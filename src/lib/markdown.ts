import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import DOMPurify from "dompurify";

type HighlightJs = typeof import("highlight.js").default;

let highlighter: HighlightJs | null = null;
let markedInstance: Marked | null = null;
let hooksInstalled = false;

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
    if (node instanceof Element && node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
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

function sanitize(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
  });
}

/** Renders Markdown to sanitized HTML with highlighted code fences. */
export async function renderMarkdown(source: string): Promise<string> {
  const marked = await getMarked();
  const html = await marked.parse(source);
  return sanitize(html);
}

/** Renders a plain code paste as a highlighted `<pre>` block. */
export async function renderCode(source: string, language: string): Promise<string> {
  const hljs = await loadHighlighter();
  const lang = language && hljs.getLanguage(language) ? language : "plaintext";
  const highlighted = hljs.highlight(source, { language: lang }).value;
  const safeLanguage = lang.replace(/[^\w-]/g, "");
  return sanitize(
    `<pre class="hljs"><code class="language-${safeLanguage} language-${safeLanguage}">${highlighted}</code></pre>`,
  );
}

/** Returns the list of languages highlight.js can highlight. */
export async function availableLanguages(): Promise<string[]> {
  const hljs = await loadHighlighter();
  return hljs.listLanguages();
}
