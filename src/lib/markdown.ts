import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import DOMPurify from "dompurify";

import { UNSAFE_SCOPE_CLASS, sanitizeDeclarations, scopeCss } from "./unsafe-css";

type HighlightJs = typeof import("highlight.js").default;

/** Options controlling how a paste body is rendered. */
export interface RenderOptions {
  /** Allow a restricted subset of custom CSS, scoped to the preview container. */
  unsafe?: boolean;
}

let highlighter: HighlightJs | null = null;
let markedInstance: Marked | null = null;
let hooksInstalled = false;
let scopeStyles = false;
let frameMode = false;

/**
 * Content Security Policy for the isolated frame used by unsafe HTML pastes.
 * Scripts, frames and network CSS (`@import`, external stylesheets, `fetch`) are
 * blocked; inline CSS plus https/data images, fonts and media still load so
 * CSS-only games render.
 */
export const FRAME_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: https:",
  "font-src data: https:",
  "media-src data: https:",
  "frame-src https:",
].join("; ");

/**
 * Tiny host-authored script injected into the isolated frame. It is locked to a
 * per-render nonce via CSP, so pasted scripts (already stripped by DOMPurify)
 * can never execute. Its only job is to start playback from a user gesture,
 * because CSS alone cannot trigger audio: clicking START GAME / play / Winamp
 * either plays the first `<audio>` element or loads the first track into the
 * named media `<iframe>`.
 */
const FRAME_AUDIO_SCRIPT = `(function () {
  var started = false;
  function findFrame(name) {
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i += 1) {
      if (frames[i].getAttribute("name") === name) return frames[i];
    }
    return null;
  }
  function start() {
    if (started) return;
    var audio = document.querySelector("audio");
    if (audio) {
      started = true;
      var result = audio.play();
      if (result && typeof result.catch === "function") result.catch(function () {});
      return;
    }
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i += 1) {
      var href = links[i].getAttribute("href") || "";
      if (!/\\.(mp3|ogg|wav|m4a|aac|flac)([?#].*)?$/i.test(href)) continue;
      var target = links[i].getAttribute("target");
      if (!target || target.charAt(0) === "_") continue;
      var frame = findFrame(target);
      if (frame) {
        started = true;
        frame.setAttribute("src", links[i].href);
        return;
      }
    }
  }
  document.addEventListener(
    "click",
    function (event) {
      var node = event.target;
      if (node && node.closest) node = node.closest("label,button,a,input,[role=button]");
      var text = node ? (node.textContent || "") + " " + (node.value || "") : "";
      if (/start|play|resume|winamp/i.test(text)) start();
    },
    true,
  );
})();`;

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let nonce = "";
  for (const byte of bytes) nonce += byte.toString(16).padStart(2, "0");
  return nonce;
}

/**
 * highlight.js ships ~190 languages. It is a sizeable dependency, so load it
 * lazily the first time a paste is rendered rather than on initial page load.
 */
async function loadHighlighter(): Promise<HighlightJs> {
  if (!highlighter) {
    highlighter = (await import("highlight.js")).default;
  }
  return highlighter;
}

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === "A") {
      // Inside the isolated frame keep authored targets (e.g. `target="music"`,
      // which loads a track into a hidden media frame); elsewhere force new tabs.
      if (!frameMode) node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    // Inside the isolated frame, iframes are allowed so media targets work, but
    // they are force-sandboxed (the parent sandbox is inherited anyway) and can
    // only ever be granted autoplay - never scripts, same-origin or other
    // powerful permissions.
    if (frameMode && node.tagName === "IFRAME") {
      node.setAttribute("sandbox", "");
      node.setAttribute("allow", "autoplay");
    }
    // Inline CSS is only rewritten when it will be injected into this document
    // (unsafe markdown/code pastes). Unsafe HTML renders inside an isolated
    // frame, so there its CSS is left intact and constrained by the frame CSP.
    if (!scopeStyles) return;
    const inline = node.getAttribute("style");
    if (inline !== null) {
      const cleaned = sanitizeDeclarations(inline);
      if (cleaned) node.setAttribute("style", cleaned);
      else node.removeAttribute("style");
    }
  });

  DOMPurify.addHook("afterSanitizeElements", (node) => {
    if (scopeStyles && node instanceof Element && node.tagName === "STYLE") {
      node.textContent = scopeCss(node.textContent ?? "", `.${UNSAFE_SCOPE_CLASS}`);
    }
  });
}

async function getMarked(): Promise<Marked> {
  if (markedInstance) return markedInstance;

  const hljs = await loadHighlighter();
  const marked = new Marked({ gfm: true, breaks: true });
  marked.use(
    markedHighlight({
      langPrefix: "hljs language-",
      highlight(code, lang) {
        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        try {
          return hljs.highlight(code, { language }).value;
        } catch {
          return code;
        }
      },
    }),
  );

  markedInstance = marked;
  return marked;
}

function sanitize(html: string, unsafe = false, scope = unsafe, frames = false): string {
  installHooks();
  const config: Parameters<typeof DOMPurify.sanitize>[1] = {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  };

  if (unsafe) {
    // Allow `<style>` blocks but keep script execution vectors forbidden even in
    // unsafe mode. Iframes are only allowed inside the isolated frame, where the
    // parent sandbox (no allow-scripts / no allow-same-origin) is inherited.
    config.ADD_TAGS = frames ? ["style", "iframe"] : ["style"];
    // `contenteditable` is what lets CSS-only "site builders" edit text in place;
    // it is harmless on its own. Frame-only attributes enable sandboxed media.
    config.ADD_ATTR = [
      "target",
      "rel",
      "contenteditable",
      "spellcheck",
      ...(frames ? ["name", "allow", "allowfullscreen", "loading", "referrerpolicy"] : []),
    ];
    config.FORBID_TAGS = [
      "script",
      ...(frames ? [] : ["iframe"]),
      "object",
      "embed",
      "link",
      "base",
      "meta",
      "form",
    ];
    config.FORBID_ATTR = ["srcdoc"];
    // Without this a leading `<style>` is hoisted into `<head>` and dropped.
    config.FORCE_BODY = true;
  } else {
    // Normal mode: no author CSS at all, inline attributes included.
    config.FORBID_ATTR = ["style"];
  }

  scopeStyles = scope;
  frameMode = frames;
  try {
    return DOMPurify.sanitize(html, config);
  } finally {
    scopeStyles = false;
    frameMode = false;
  }
}

/** Renders Markdown to sanitized HTML with highlighted code fences. */
export async function renderMarkdown(source: string, options: RenderOptions = {}): Promise<string> {
  const marked = await getMarked();
  const html = await marked.parse(source);
  return sanitize(html, options.unsafe ?? false);
}

/**
 * Sanitizes a raw HTML paste so it renders live (instead of being shown as
 * highlighted source). A leading `<style>` or a full `<!doctype html>` document
 * is preserved; DOMPurify's `FORCE_BODY` keeps style blocks out of `<head>`.
 */
export async function renderHtml(source: string, options: RenderOptions = {}): Promise<string> {
  return sanitize(source, options.unsafe ?? false);
}

/**
 * Renders an unsafe HTML paste as a self-contained document for a sandboxed
 * `<iframe srcdoc>`. The frame gets a real `html`/`body` document (so `:root`,
 * `body` layout and `100vh` all behave normally), CSS is *not* selector-rewritten
 * (the frame itself is the isolation boundary), and `FRAME_CSP` blocks scripts
 * and network CSS.
 */
export async function renderHtmlFrame(source: string): Promise<string> {
  const body = sanitize(source, true, false, true);
  const nonce = randomNonce();
  const csp = `${FRAME_CSP}; script-src 'nonce-${nonce}'`;
  const head =
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<base target="_blank">`;
  const script = `<script nonce="${nonce}">${FRAME_AUDIO_SCRIPT}</script>`;
  return `<!doctype html><html lang="en"><head>${head}</head><body>${body}${script}</body></html>`;
}

/** Renders a plain code paste as a highlighted `<pre>` block. */
export async function renderCode(
  source: string,
  language: string,
  options: RenderOptions = {},
): Promise<string> {
  const hljs = await loadHighlighter();
  const lang = language && hljs.getLanguage(language) ? language : "plaintext";
  const highlighted = hljs.highlight(source, { language: lang }).value;
  const safeLanguage = lang.replace(/[^\w-]/g, "");
  return sanitize(
    `<pre class="hljs"><code class="language-${safeLanguage} language-${safeLanguage}">${highlighted}</code></pre>`,
    options.unsafe ?? false,
  );
}

/** Returns the list of languages highlight.js can highlight. */
export async function availableLanguages(): Promise<string[]> {
  const hljs = await loadHighlighter();
  return hljs.listLanguages();
}
