import { describe, expect, it } from "vite-plus/test";

import { renderMarkdown } from "@/lib/markdown";

describe("unsafe mode css", () => {
  it("allows <style> blocks and scopes them to the preview", async () => {
    const html = await renderMarkdown(
      "<style>.game { color: red; }</style>\n\n<div class='game'>x</div>",
      {
        unsafe: true,
      },
    );

    expect(html).toContain("<style>");
    expect(html).toContain(".paste-unsafe .game{color: red}");
    expect(html).toContain('class="game"');
  });

  it("allows inline style attributes", async () => {
    const html = await renderMarkdown('<p style="color: red">hi</p>', { unsafe: true });
    expect(html).toContain('style="color: red"');
  });

  it("keeps custom css from escaping the preview or loading the network", async () => {
    const html = await renderMarkdown(
      "<style>@import url(https://evil.test/x.css); body { position: fixed; } .a { background: url(https://evil.test/x.png); color: red; }</style>",
      { unsafe: true },
    );

    expect(html).not.toContain("evil.test");
    expect(html).not.toContain("@import");
    expect(html).not.toContain("fixed");
    expect(html).toContain(".paste-unsafe body{position: static}");
    expect(html).toContain(".paste-unsafe .a{color: red}");
  });
});

describe("css is stripped in normal mode", () => {
  it("removes <style> blocks and inline styles by default", async () => {
    const html = await renderMarkdown(
      '<style>.game { color: red; }</style>\n\n<p style="color: red">hi</p>',
    );

    expect(html).not.toContain("<style");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("color");
    expect(html).toContain("<p>hi</p>");
  });
});

describe("script execution vectors stay blocked in both modes", () => {
  for (const unsafe of [false, true]) {
    const label = unsafe ? "unsafe mode" : "normal mode";

    it(`removes <script> in ${label}`, async () => {
      const html = await renderMarkdown("<script>alert(1)</script>\n\n<p>ok</p>", { unsafe });
      expect(html).not.toContain("<script");
      expect(html).not.toContain("alert(1)");
      expect(html).toContain("ok");
    });

    it(`removes onerror/onclick handlers in ${label}`, async () => {
      const html = await renderMarkdown(
        '<img src="x" onerror="alert(1)"><a href="#" onclick="alert(1)">x</a>',
        { unsafe },
      );
      expect(html).not.toContain("onerror");
      expect(html).not.toContain("onclick");
    });

    it(`removes javascript: urls in ${label}`, async () => {
      const html = await renderMarkdown('<a href="javascript:alert(1)">x</a>', { unsafe });
      expect(html).not.toContain("javascript:");
    });

    it(`removes iframe/srcdoc in ${label}`, async () => {
      const html = await renderMarkdown('<iframe srcdoc="<script>alert(1)</script>"></iframe>', {
        unsafe,
      });
      expect(html).not.toContain("iframe");
      expect(html).not.toContain("srcdoc");
    });
  }
});

describe("existing markdown rendering", () => {
  it("is unchanged for headings, lists, links and code", async () => {
    const html = await renderMarkdown(
      "# Title\n\nSome **bold** and [a link](https://example.com).\n\n```js\nconst x = 1;\n```\n\n- one\n- two\n",
    );

    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("hljs");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).not.toContain("<style");
  });

  it("still allows safe inline HTML", async () => {
    const html = await renderMarkdown("<b>bold</b><em>em</em><code>code</code>");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<code>code</code>");
  });
});
