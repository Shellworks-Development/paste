import { describe, expect, it } from "vite-plus/test";

import { renderHtml } from "@/lib/markdown";

describe("html rendering", () => {
  it("renders a fragment with scoped custom css in unsafe mode", async () => {
    const html = await renderHtml(
      "<style>.game { color: hotpink; }</style><div class='game'>hi</div>",
      { unsafe: true },
    );

    expect(html).toContain("<style>");
    expect(html).toContain(".paste-unsafe .game{color: hotpink}");
    expect(html).toContain('<div class="game">hi</div>');
  });

  it("renders a full document, keeping styles with blank lines and the body", async () => {
    const html = await renderHtml(
      `<!doctype html>
<html>
<head>
<style>
.a { color: red; }

.b { color: blue; }
</style>
</head>
<body>
<div class="a">hello</div>
</body>
</html>`,
      { unsafe: true },
    );

    expect(html).toContain(".paste-unsafe .a{color: red}");
    expect(html).toContain(".paste-unsafe .b{color: blue}");
    expect(html).toContain('<div class="a">hello</div>');
    expect(html).not.toContain("<html");
    expect(html).not.toContain("<body");
    expect(html).not.toContain("<!doctype");
  });

  it("strips css in normal mode", async () => {
    const html = await renderHtml(
      "<style>.game { color: red; }</style><div class='game' style='color: red'>hi</div>",
    );

    expect(html).not.toContain("<style");
    expect(html).not.toContain("style=");
    expect(html).toContain('class="game"');
  });

  it("still removes scripts and inline handlers", async () => {
    const html = await renderHtml('<script>alert(1)</script><div onclick="alert(1)">ok</div>', {
      unsafe: true,
    });

    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).toContain("ok");
  });
});
