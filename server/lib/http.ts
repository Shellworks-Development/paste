export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function text(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, { ...init, headers });
}

export function fail(
  status: number,
  code: string,
  message: string,
  headers: HeadersInit = {},
): Response {
  return json({ error: { code, message } }, { status, headers });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** `?raw` / `?format=raw` / `Accept: text/plain` all ask for the raw body. */
export function wantsRaw(request: Request, url: URL): boolean {
  if (url.searchParams.has("raw")) return true;
  const format = url.searchParams.get("format");
  if (format && /^(raw|text|txt|plain)$/i.test(format)) return true;
  const accept = request.headers.get("Accept");
  if (accept && !/text\/html|\*\/\*/.test(accept) && /text\/plain/.test(accept)) return true;
  return false;
}

export function contentDisposition(id: string, language: string, title: string | null): string {
  const extension = language === "plaintext" || language === "markdown" ? "txt" : language;
  const base = (title?.trim() || id).replace(/[^\w.-]+/g, "_").slice(0, 60) || id;
  return `attachment; filename="${base}.${extension}"`;
}
