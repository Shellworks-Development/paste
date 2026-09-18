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
].join("; ");

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
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
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

function sanitize(html: string, unsafe = false, scope = unsafe): string {
  installHooks();
  const config: Parameters<typeof DOMPurify.sanitize>[1] = {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  };

  if (unsafe) {
    // Allow `<style>` blocks but keep script execution vectors forbidden even in
    // unsafe mode.
    config.ADD_TAGS = ["style"];
    config.FORBID_TAGS = ["script", "iframe", "object", "embed", "link", "base", "meta", "form"];
    config.FORBID_ATTR = ["srcdoc"];
    // Without this a leading `<style>` is hoisted into `<head>` and dropped.
    config.FORCE_BODY = true;
  } else {
    // Normal mode: no author CSS at all, inline attributes included.
    config.FORBID_ATTR = ["style"];
  }

  scopeStyles = scope;
  try {
    return DOMPurify.sanitize(html, config);
  } finally {
    scopeStyles = false;
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
  const body = sanitize(source, true, false);
  const head =
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
    `<meta name="referrer" content="no-referrer">` +
    `<base target="_blank">`;
  return `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;
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
