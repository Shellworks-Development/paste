/**
 * Defense-in-depth helpers for opt-in "unsafe mode" pastes.
 *
 * Unsafe mode still runs the paste through DOMPurify (so scripts, event-handler
 * attributes, `javascript:` URLs, iframes and friends never survive), then adds
 * back a *restricted* subset of CSS:
 *
 * - every selector in a `<style>` block is prefixed with a scope class so it can
 *   only match nodes inside the preview container;
 * - network loads (`@import`, non-`data:` `url(...)`) are dropped;
 * - script-ish values (`expression()`, `javascript:`, `behavior`, `-moz-binding`)
 *   are dropped;
 * - `position: fixed`/`sticky` is neutralized so a paste cannot pin content over
 *   the site chrome.
 *
 * The functions here are intentionally pure string transforms so they can be
 * unit-tested without a browser.
 */

/** Class applied to the preview container that unsafe CSS is scoped to. */
export const UNSAFE_SCOPE_CLASS = "paste-unsafe";

const KEYFRAMES = /^@(?:-webkit-|-moz-|-o-)?keyframes\b/i;
const NESTED_AT_RULES = /^@(?:media|supports|container|layer|document|scope)\b/i;
const DECLARATION_AT_RULES = /^@(?:font-face|page|counter-style|property|viewport)\b/i;
const FORBIDDEN_PROPERTIES = new Set(["behavior", "-moz-binding", "-webkit-binding"]);
const DANGEROUS_VALUE = /(?:expression\s*\(|(?:java|vb)script\s*:|-moz-binding|behavior\s*:)/i;
const NETWORK_URL = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

function isSafeUrl(raw: string): boolean {
  const url = raw.trim().toLowerCase();
  if (url === "") return true;
  return url.startsWith("data:") || url.startsWith("#");
}

function hasNetworkUrl(value: string): boolean {
  NETWORK_URL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NETWORK_URL.exec(value)) !== null) {
    if (!isSafeUrl(match[2])) return true;
  }
  return false;
}

function skipString(input: string, start: number): number {
  const quote = input[start];
  let index = start + 1;
  while (index < input.length) {
    const char = input[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    index += 1;
  }
  return input.length;
}

function skipComment(input: string, start: number): number {
  const end = input.indexOf("*/", start + 2);
  return end === -1 ? input.length : end + 2;
}

/** Splits on a separator while ignoring separators nested in strings/comments/parens. */
function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === "/" && input[index + 1] === "*") {
      const next = skipComment(input, index);
      current += input.slice(index, next);
      index = next;
      continue;
    }
    if (char === '"' || char === "'") {
      const next = skipString(input, index);
      current += input.slice(index, next);
      index = next;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);

    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }

  parts.push(current);
  return parts;
}

/** Reads a `{ ... }` block starting after the opening brace. */
function readBlock(input: string, start: number): { content: string; next: number } {
  let depth = 1;
  let index = start;
  let contentEnd = input.length;

  while (index < input.length) {
    const char = input[index];
    if (char === "/" && input[index + 1] === "*") {
      index = skipComment(input, index);
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipString(input, index);
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        contentEnd = index;
        index += 1;
        break;
      }
    }
    index += 1;
  }

  return { content: input.slice(start, contentEnd), next: index };
}

/** Removes hostile constructs that must never reach the page. */
function stripDangerous(css: string): string {
  return (
    css
      // Comments can split keywords (`position:/*x*/fixed`), so drop them first.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@import\b[^;{]*;?/gi, "")
      .replace(/expression\s*\(/gi, "")
      .replace(/(?:java|vb)script\s*:/gi, "")
      .replace(/behavior\s*:[^;]*;?/gi, "")
      .replace(/-moz-binding\s*:[^;]*;?/gi, "")
      .replace(/position\s*:\s*(?:fixed|sticky)\b/gi, "position: static")
      .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match, _quote, url: string) =>
        isSafeUrl(url) ? match : "",
      )
  );
}

/**
 * Sanitizes a declaration list (the inside of a rule, or an inline `style`
 * attribute) and returns it in a normalized `property: value; property: value`
 * form.
 */
export function sanitizeDeclarations(input: string): string {
  const kept: string[] = [];

  for (const declaration of splitTopLevel(input, ";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;

    const property = declaration
      .slice(0, colon)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim()
      .toLowerCase();
    const value = declaration
      .slice(colon + 1)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    if (!property || !value) continue;
    if (FORBIDDEN_PROPERTIES.has(property)) continue;
    if (DANGEROUS_VALUE.test(value)) continue;
    if (hasNetworkUrl(value)) continue;
    if (
      property === "position" &&
      /^(?:fixed|sticky)\b/i.test(value.replace(/!important/i, "").trim())
    )
      continue;

    kept.push(`${property}: ${value.replace(/\s+/g, " ")}`);
  }

  return kept.join("; ");
}

function scopeSelectors(selectors: string, scope: string): string {
  return splitTopLevel(selectors, ",")
    .map((selector) => selector.trim())
    .filter((selector) => selector.length > 0)
    .map((selector) => `${scope} ${selector}`)
    .join(", ");
}

function transform(css: string, scope: string): string {
  let output = "";
  let index = 0;
  const length = css.length;

  while (index < length) {
    const whitespaceStart = index;
    while (index < length && /\s/.test(css[index])) index += 1;
    output += css.slice(whitespaceStart, index);
    if (index >= length) break;

    if (css[index] === "/" && css[index + 1] === "*") {
      const next = skipComment(css, index);
      output += css.slice(index, next);
      index = next;
      continue;
    }

    const preludeStart = index;
    let depth = 0;
    let terminator = "";

    while (index < length) {
      const char = css[index];
      if (char === "/" && css[index + 1] === "*") {
        index = skipComment(css, index);
        continue;
      }
      if (char === '"' || char === "'") {
        index = skipString(css, index);
        continue;
      }
      if (char === "(" || char === "[") depth += 1;
      else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
      else if (depth === 0 && (char === "{" || char === "}" || char === ";")) {
        terminator = char;
        break;
      }
      index += 1;
    }

    const prelude = css.slice(preludeStart, index);

    if (terminator === "") {
      output += prelude;
      break;
    }

    if (terminator === ";") {
      index += 1;
      // Drop every at-rule statement (@import, @charset, @namespace, …). None of
      // them are needed for creative CSS and they are easy to obfuscate.
      if (!prelude.trim().startsWith("@")) output += `${prelude};`;
      continue;
    }

    if (terminator === "}") {
      output += `${prelude}}`;
      index += 1;
      continue;
    }

    // terminator === "{"
    index += 1;
    const block = readBlock(css, index);
    index = block.next;
    const trimmed = prelude.trim();

    if (KEYFRAMES.test(trimmed)) {
      output += `${prelude}{${stripDangerous(block.content)}}`;
    } else if (NESTED_AT_RULES.test(trimmed)) {
      output += `${prelude}{${transform(block.content, scope)}}`;
    } else if (DECLARATION_AT_RULES.test(trimmed)) {
      output += `${prelude}{${sanitizeDeclarations(block.content)}}`;
    } else if (trimmed.startsWith("@")) {
      // Unknown at-rules are dropped rather than trusted.
      continue;
    } else {
      output += `${scopeSelectors(prelude, scope)}{${sanitizeDeclarations(block.content)}}`;
    }
  }

  return output;
}

/**
 * Rewrites a stylesheet so every selector is scoped to `scope` and no hostile
 * or network-loading constructs survive.
 */
export function scopeCss(css: string, scope: string): string {
  if (!css || !/\S/.test(css)) return "";
  return transform(stripDangerous(css), scope).trim();
}
