import { Hono } from "hono";

import { DEFAULT_LANGUAGE } from "@shared/languages";
import type { Paste, PasteMeta, Visibility } from "@shared/types";

import { background, type AppContext, type AppEnv } from "../context";
import { resolveExpiry } from "../lib/expiry";
import { clientIp, contentDisposition, fail, json, text, wantsRaw } from "../lib/http";
import { isSafeId, randomId } from "../lib/ids";
import {
  deletePaste,
  getPaste,
  incrementViews,
  insertPaste,
  listByOwner,
  type PasteRow,
} from "../lib/store";
import { requireToken } from "../middleware/auth";

const MAX_TITLE = 200;
const LANGUAGE_PATTERN = /^[A-Za-z0-9+#._-]{1,32}$/;

interface ParsedCreate {
  content: string;
  title?: unknown;
  language?: unknown;
  visibility?: unknown;
  burn_after_read?: unknown;
  expires_in?: unknown;
}

function tooLarge(maxBytes: number): Response {
  return fail(
    413,
    "payload_too_large",
    `This paste exceeds the ${Math.floor(maxBytes / 1024)} KiB limit for your tier. Sign in with an API token to raise it.`,
  );
}

export function toMeta(row: PasteRow, origin: string, viewerId: string | null): PasteMeta {
  return {
    id: row.id,
    title: row.title,
    language: row.language,
    size: row.size,
    visibility: row.visibility,
    burn_after_read: row.burn_after_read === 1,
    views: row.views,
    created_at: row.created_at,
    expires_at: row.expires_at,
    owner: viewerId !== null && viewerId === row.owner_id,
    url: `${origin}/p/${row.id}`,
    raw_url: `${origin}/raw/${row.id}`,
    download_url: `${origin}/dl/${row.id}`,
  };
}

function isExpired(row: PasteRow, now: number): boolean {
  return row.expires_at !== null && row.expires_at <= now;
}

export async function loadBody(env: Env, row: PasteRow): Promise<string | null> {
  const object = await env.PASTES.get(row.r2_key);
  if (!object) return null;
  return await object.text();
}

async function parseCreate(request: Request, url: URL): Promise<ParsedCreate | Response> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return fail(400, "invalid_json", "The request body is not valid JSON.");
    }
    if (typeof parsed === "string") return { content: parsed };
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(400, "invalid_json", "Expected a JSON object with a `content` field.");
    }
    const body = parsed as Record<string, unknown>;
    if (typeof body.content !== "string") {
      return fail(400, "missing_content", "The `content` field is required and must be a string.");
    }
    return {
      content: body.content,
      title: body.title,
      language: body.language,
      visibility: body.visibility,
      burn_after_read: body.burn_after_read ?? body.burn,
      expires_in: body.expires_in ?? body.expires ?? body.expiry,
    };
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, "invalid_form", "The multipart form could not be parsed.");
    }
    const file = form.get("file") ?? form.get("c");
    const field = form.get("content");
    let content: string | undefined;
    if (file instanceof File) content = await file.text();
    else if (typeof field === "string") content = field;
    if (typeof content !== "string") {
      return fail(
        400,
        "missing_content",
        "Provide the paste as a `content` field or a `file` upload.",
      );
    }
    return {
      content,
      title: form.get("title") ?? (file instanceof File ? file.name : undefined),
      language: form.get("language") ?? form.get("lang"),
      visibility: form.get("visibility"),
      burn_after_read: form.get("burn_after_read") ?? form.get("burn"),
      expires_in: form.get("expires_in") ?? form.get("expires"),
    };
  }

  const content = await request.text();
  return {
    content,
    title: url.searchParams.get("title"),
    language: url.searchParams.get("language") ?? url.searchParams.get("lang"),
    visibility: url.searchParams.get("visibility"),
    burn_after_read: url.searchParams.has("burn") ? "true" : undefined,
    expires_in: url.searchParams.get("expires_in") ?? url.searchParams.get("expires"),
  };
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return /^(1|true|yes|on)$/i.test(value.trim());
  return false;
}

function parseVisibility(value: unknown): Visibility {
  if (typeof value !== "string") return "unlisted";
  const lowered = value.toLowerCase();
  if (lowered === "public" || lowered === "encrypted") return lowered;
  return "unlisted";
}

function parseTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_TITLE);
}

function parseLanguage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return DEFAULT_LANGUAGE;
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return LANGUAGE_PATTERN.test(lowered) ? lowered : null;
}

export async function allocateId(env: Env, length = 8): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomId(length + (attempt >= 4 ? attempt : 0));
    const existing = await getPaste(env.DB, candidate);
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique paste id");
}

export const pastes = new Hono<AppContext>();

pastes.post("/", async (c) => {
  const url = new URL(c.req.url);
  const token = c.get("token");
  const maxBytes = token ? Number(c.env.MAX_AUTH_BYTES) : Number(c.env.MAX_ANON_BYTES);

  const limiter = token ? c.env.RL_AUTH : c.env.RL_ANON;
  const limitKey = token ? `token:${token.id}` : `ip:${clientIp(c.req.raw)}`;
  const { success } = await limiter.limit({ key: limitKey });
  if (!success) {
    return fail(429, "rate_limited", "Too many pastes. Slow down and try again shortly.", {
      "Retry-After": "60",
    });
  }

  const declared = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes + 4096) return tooLarge(maxBytes);

  const parsed = await parseCreate(c.req.raw, url);
  if (parsed instanceof Response) return parsed;

  const size = new TextEncoder().encode(parsed.content).byteLength;
  if (size > maxBytes) return tooLarge(maxBytes);

  const language = parseLanguage(parsed.language);
  if (language === null) {
    return fail(
      400,
      "invalid_language",
      "`language` must be a short identifier such as `typescript`.",
    );
  }

  const expiry = resolveExpiry(parsed.expires_in, {
    now: Date.now(),
    defaultSeconds: Number(c.env.DEFAULT_EXPIRY_SECONDS),
    maxSeconds: Number(c.env.MAX_EXPIRY_SECONDS),
  });
  if (!expiry.ok) return fail(400, "invalid_expiry", expiry.message);

  const createdAt = Date.now();
  const id = await allocateId(c.env);
  const r2Key = `pastes/${id}`;
  const visibility = parseVisibility(parsed.visibility);
  const title = parseTitle(parsed.title);
  const burnAfterRead = parseBoolean(parsed.burn_after_read);

  await c.env.PASTES.put(r2Key, parsed.content, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
    customMetadata: { language, title: title ?? "" },
  });

  try {
    await insertPaste(c.env.DB, {
      id,
      title,
      language,
      size,
      r2Key,
      visibility,
      burnAfterRead,
      createdAt,
      expiresAt: expiry.expiresAt,
      ownerId: token ? token.id : null,
    });
  } catch (error) {
    await c.env.PASTES.delete(r2Key);
    throw error;
  }

  const row = await getPaste(c.env.DB, id);
  if (!row) return fail(500, "internal_error", "The paste could not be created.");

  return json(toMeta(row, url.origin, token?.id ?? null), { status: 201 });
});

pastes.get("/", requireToken, async (c) => {
  const token = c.get("token")!;
  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const rows = await listByOwner(c.env.DB, token.id, limit, offset);
  return json({
    pastes: rows.map((row) => toMeta(row, url.origin, token.id)),
    limit,
    offset,
  });
});

pastes.get("/:id/meta", async (c) => {
  const url = new URL(c.req.url);
  const token = c.get("token");
  const row = await loadRow(c, c.req.param("id"));
  if (row instanceof Response) return row;
  return json(toMeta(row, url.origin, token?.id ?? null));
});

pastes.get("/:id", async (c) => {
  const url = new URL(c.req.url);
  const token = c.get("token");
  const row = await loadRow(c, c.req.param("id"));
  if (row instanceof Response) return row;

  const body = await loadBody(c.env, row);
  if (body === null) return fail(404, "not_found", "The paste body is no longer available.");

  if (row.burn_after_read === 1) await burn(c.env, row);
  else background(c, incrementViews(c.env.DB, row.id));

  if (wantsRaw(c.req.raw, url)) return text(body, { headers: pasteHeaders(row, false) });

  const payload: Paste = { ...toMeta(row, url.origin, token?.id ?? null), content: body };
  return json(payload);
});

pastes.delete("/:id", requireToken, async (c) => {
  const token = c.get("token")!;
  const row = await loadRow(c, c.req.param("id"));
  if (row instanceof Response) return row;
  if (row.owner_id !== token.id) {
    return fail(403, "forbidden", "You can only delete pastes created with this token.");
  }
  await c.env.PASTES.delete(row.r2_key);
  await deletePaste(c.env.DB, row.id);
  return c.body(null, 204);
});

async function burn(env: Env, row: PasteRow): Promise<void> {
  await env.PASTES.delete(row.r2_key);
  await deletePaste(env.DB, row.id);
}

async function loadRow(c: AppEnv, id: string): Promise<PasteRow | Response> {
  if (!isSafeId(id)) return fail(400, "invalid_id", "Paste ids look like `aB3xY9Zq`.");
  const row = await getPaste(c.env.DB, id);
  if (!row) return fail(404, "not_found", "No paste exists with that id.");
  if (isExpired(row, Date.now())) {
    await burn(c.env, row);
    return fail(410, "expired", "This paste has expired.");
  }
  return row;
}

function pasteHeaders(row: PasteRow, download: boolean): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Paste-Id": row.id,
    "X-Paste-Language": row.language,
    "X-Paste-Size": String(row.size),
    "X-Paste-Created-At": String(row.created_at),
  });
  if (row.expires_at !== null) headers.set("X-Paste-Expires-At", String(row.expires_at));
  if (download)
    headers.set("Content-Disposition", contentDisposition(row.id, row.language, row.title));
  return headers;
}

export const rawHandler = async (c: AppEnv): Promise<Response> => {
  const { success } = await c.env.RL_READ.limit({ key: `ip:${clientIp(c.req.raw)}` });
  if (!success) {
    return fail(429, "rate_limited", "Too many requests. Slow down and try again shortly.", {
      "Retry-After": "60",
    });
  }

  const row = await loadRow(c, c.req.param("id") ?? "");
  if (row instanceof Response) return row;

  const body = await loadBody(c.env, row);
  if (body === null) return fail(404, "not_found", "The paste body is no longer available.");

  if (row.burn_after_read === 1) await burn(c.env, row);
  else background(c, incrementViews(c.env.DB, row.id));

  const download = c.req.path.endsWith("/download") || c.req.path.startsWith("/dl/");
  return text(body, { headers: pasteHeaders(row, download) });
};
