import { describe, expect, it } from "vite-plus/test";

import { FRAME_CSP, renderHtml, renderHtmlFrame } from "@/lib/markdown";

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

describe("unsafe html frame", () => {
  it("wraps the paste in a document with a restrictive CSP and untouched css", async () => {
    const doc = await renderHtmlFrame(
      "<style>.game { color: hotpink; background: url(https://example.com/a.png); }</style><div class='game'>hi</div>",
    );

    expect(doc).toContain(FRAME_CSP);
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain(".game { color: hotpink; background: url(https://example.com/a.png); }");
    expect(doc).not.toContain(".paste-unsafe");
    expect(doc).toContain('<div class="game">hi</div>');
    expect(doc).toContain("<body>");

    // The only executable script is the host one, locked to the CSP nonce.
    const nonce = /script-src 'nonce-([0-9a-f]+)'/.exec(doc)?.[1];
    expect(nonce).toBeTruthy();
    expect(doc).toContain(`<script nonce="${nonce}">`);
  });

  it("leaves body/:root selectors and css nesting intact", async () => {
    const css = ":root { --c: red; } body { margin: 0; } .a { .b { color: var(--c); } }";
    const doc = await renderHtmlFrame(
      `<style>${css}</style><div class="a"><div class="b">x</div></div>`,
    );

    expect(doc).toContain(css);
    expect(doc).not.toContain(".paste-unsafe");
  });

  it("removes scripts but keeps sandboxed media iframes", async () => {
    const doc = await renderHtmlFrame(
      '<script>alert(1)</script><iframe name="music" src="https://x.test/song.mp3"></iframe><p>ok</p>',
    );

    expect(doc).not.toContain("alert(1)");
    expect(doc).not.toContain("<script>alert");
    expect(doc).toContain('name="music"');
    expect(doc).toContain('src="https://x.test/song.mp3"');
    expect(doc).toContain('sandbox=""');
    expect(doc).toContain('allow="autoplay"');
    expect(doc).toContain("<p>ok</p>");
  });

  it("keeps contenteditable so in-game text can be edited", async () => {
    const doc = await renderHtmlFrame(
      '<p contenteditable="plaintext-only">edit me</p><textarea required></textarea>',
    );
    expect(doc).toContain('contenteditable="plaintext-only"');
    expect(doc).toContain("<textarea");
  });

  it("preserves named link targets so media frames can be used", async () => {
    const doc = await renderHtmlFrame('<a href="https://x.test/song.mp3" target="music">play</a>');
    expect(doc).toContain('target="music"');
    expect(doc).toContain('rel="noopener noreferrer nofollow"');
  });

  it("never gives an iframe a scripted or same-origin context", async () => {
    const doc = await renderHtmlFrame(
      '<iframe src="https://x.test" sandbox="allow-scripts allow-same-origin" allow="fullscreen"></iframe>' +
        '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    );

    expect(doc).not.toContain("allow-scripts");
    expect(doc).not.toContain("allow-same-origin");
    expect(doc).not.toContain("srcdoc");
    expect(doc).toContain('sandbox=""');
  });
});
