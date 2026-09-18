import { describe, expect, it } from "vite-plus/test";

import { sanitizeDeclarations, scopeCss } from "@/lib/unsafe-css";

const SCOPE = ".paste-unsafe";

describe("scopeCss", () => {
  it("scopes plain selectors to the preview container", () => {
    expect(scopeCss(".game { color: red; }", SCOPE)).toBe(".paste-unsafe .game{color: red}");
  });

  it("prevents selectors from targeting the page chrome", () => {
    const scoped = scopeCss("body, html, :root { display: none; }", SCOPE);
    expect(scoped).toBe(
      ".paste-unsafe body, .paste-unsafe html, .paste-unsafe :root{display: none}",
    );
  });

  it("scopes selectors inside nested at-rules but keeps keyframe steps", () => {
    const scoped = scopeCss(
      "@media (max-width: 600px) { .a { color: red; } } @keyframes spin { from { opacity: 0; } to { opacity: 1; } }",
      SCOPE,
    );
    expect(scoped).toContain(".paste-unsafe .a{color: red}");
    expect(scoped).toContain("@keyframes spin");
    expect(scoped).toContain("from { opacity: 0; }");
    expect(scoped).not.toContain(".paste-unsafe from");
  });

  it("drops @import and network url() loads", () => {
    const scoped = scopeCss(
      "@import url(https://evil.test/x.css); .a { background: url(https://evil.test/x.png); color: red; }",
      SCOPE,
    );
    expect(scoped).not.toContain("evil.test");
    expect(scoped).not.toContain("@import");
    expect(scoped).toContain(".paste-unsafe .a{color: red}");
  });

  it("keeps data: and fragment urls", () => {
    const scoped = scopeCss(
      ".a { background: url(data:image/gif;base64,AAAA); fill: url(#grad); }",
      SCOPE,
    );
    expect(scoped).toContain("data:image/gif;base64,AAAA");
    expect(scoped).toContain("url(#grad)");
  });

  it("neutralizes position: fixed and sticky", () => {
    const scoped = scopeCss(".a { position: fixed; top: 0; } .b { position: sticky; }", SCOPE);
    expect(scoped).not.toContain("fixed");
    expect(scoped).not.toContain("sticky");
  });

  it("drops expression() and javascript: values", () => {
    const scoped = scopeCss(
      ".a { width: expression(alert(1)); background: javascript:alert(1); color: red; }",
      SCOPE,
    );
    expect(scoped).not.toContain("expression");
    expect(scoped).not.toContain("javascript:");
    expect(scoped).toContain("color: red");
  });

  it("sees through comment obfuscation", () => {
    const scoped = scopeCss(
      ".a { position:/* x */fixed; background: java/* x */script:alert(1); color: red; }",
      SCOPE,
    );
    expect(scoped).not.toContain("fixed");
    expect(scoped).not.toContain("script:");
    expect(scoped).toContain("color: red");
  });

  it("strips network urls nested in keyframes", () => {
    const scoped = scopeCss(
      "@keyframes flicker { 0% { background: url(https://evil.test/x.png); opacity: 0; } 100% { opacity: 1; } }",
      SCOPE,
    );
    expect(scoped).not.toContain("evil.test");
    expect(scoped).toContain("opacity: 1");
  });

  it("drops at-rule statements such as @namespace and @import", () => {
    const scoped = scopeCss(
      "@namespace svg url(http://www.w3.org/2000/svg); .a { color: red; }",
      SCOPE,
    );
    expect(scoped).not.toContain("@namespace");
    expect(scoped).not.toContain("w3.org");
    expect(scoped).toContain(".paste-unsafe .a{color: red}");
  });
});

describe("sanitizeDeclarations", () => {
  it("normalizes safe declarations", () => {
    expect(sanitizeDeclarations("COLOR:red; padding:  4px 8px")).toBe(
      "color: red; padding: 4px 8px",
    );
  });

  it("drops dangerous properties and values", () => {
    expect(sanitizeDeclarations("color: red; behavior: url(#x); -moz-binding: url(#x)")).toBe(
      "color: red",
    );
    expect(sanitizeDeclarations("width: expression(alert(1)); color: blue")).toBe("color: blue");
  });

  it("drops position: fixed and sticky", () => {
    expect(sanitizeDeclarations("position: fixed; color: red")).toBe("color: red");
    expect(sanitizeDeclarations("position: sticky !important; color: red")).toBe("color: red");
  });

  it("drops external url() loads but keeps data: urls", () => {
    expect(sanitizeDeclarations("background: url(https://evil.test/x.png); color: red")).toBe(
      "color: red",
    );
    expect(sanitizeDeclarations("background: url(data:image/png;base64,AAAA)")).toBe(
      "background: url(data:image/png;base64,AAAA)",
    );
  });
});
