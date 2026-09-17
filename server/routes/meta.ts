import { Hono } from "hono";

import { DEFAULT_LANGUAGE, LANGUAGES } from "@shared/languages";
import { EXPIRY_PRESETS } from "@shared/types";

import type { AppContext } from "../context";
import { clientIp, fail, json } from "../lib/http";
import { countPastes, listPublic } from "../lib/store";
import { toMeta } from "./pastes";

export const meta = new Hono<AppContext>();

meta.get("/health", () => json({ ok: true, now: Date.now() }));

meta.get("/languages", () => json({ languages: LANGUAGES, default: DEFAULT_LANGUAGE }));

meta.get("/expiry-presets", () => json({ presets: EXPIRY_PRESETS }));

meta.get("/stats", async (c) => {
  const stats = await countPastes(c.env.DB);
  return json(stats);
});

meta.get("/recent", async (c) => {
  const { success } = await c.env.RL_READ.limit({ key: `ip:${clientIp(c.req.raw)}` });
  if (!success) {
    return fail(429, "rate_limited", "Too many requests. Slow down and try again shortly.", {
      "Retry-After": "60",
    });
  }

  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
  const rows = await listPublic(c.env.DB, Date.now(), limit, offset);

  return json({
    pastes: rows.map((row) => toMeta(row, url.origin, c.get("token")?.id ?? null)),
    limit,
    offset,
  });
});
