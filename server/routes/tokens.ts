import { Hono } from "hono";

import type { TokenInfo } from "@shared/types";

import type { AppContext, AppEnv } from "../context";
import { clientIp, fail, json } from "../lib/http";
import { randomId } from "../lib/ids";
import {
  getIssuance,
  insertToken,
  listTokens,
  recordIssuance,
  revokeToken,
  type TokenRow,
} from "../lib/store";
import { generateToken, verifyAdminToken } from "../lib/tokens";
import { requireToken } from "../middleware/auth";

function toInfo(row: TokenRow): TokenInfo {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
  };
}

/** Admin operations (listing and revoking any key) are gated behind `ADMIN_TOKEN`. */
async function requireAdmin(c: AppEnv): Promise<Response | null> {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) {
    return fail(
      503,
      "admin_disabled",
      "Admin operations are disabled: set the ADMIN_TOKEN secret first.",
    );
  }
  const presented = c.req.header("X-Admin-Token");
  if (!presented || !(await verifyAdminToken(presented, expected))) {
    return fail(403, "forbidden", "A valid X-Admin-Token header is required.");
  }
  return null;
}

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

export const account = new Hono<AppContext>();

account.get("/me", requireToken, (c) => {
  const token = c.get("token")!;
  return json({ token: toInfo(token) });
});

/**
 * Self-service API key generation. Anyone can mint a key, but each IP must wait
 * out a cooldown between keys (on top of the per-location rate limit binding).
 */
account.post("/tokens", async (c) => {
  const ip = clientIp(c.req.raw);
  const now = Date.now();
  const cooldownSeconds = Math.max(0, Number(c.env.TOKEN_COOLDOWN_SECONDS) || 0);
  const cooldownMs = cooldownSeconds * 1000;

  const { success } = await c.env.RL_KEYS.limit({ key: `ip:${ip}` });
  if (!success) {
    return fail(429, "rate_limited", "Too many key requests. Try again in a minute.", {
      "Retry-After": "60",
    });
  }

  if (cooldownMs > 0) {
    const previous = await getIssuance(c.env.DB, ip);
    if (previous) {
      const elapsed = now - previous.last_issued_at;
      if (elapsed < cooldownMs) {
        const retryAfter = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
        return fail(
          429,
          "key_cooldown",
          `One API key per IP every ${formatCooldown(cooldownSeconds)}. Try again in ${retryAfter}s.`,
          { "Retry-After": String(retryAfter) },
        );
      }
    }
  }

  let name = "api key";
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    if (body && typeof body.name === "string" && body.name.trim())
      name = body.name.trim().slice(0, 80);
  } else {
    const query = new URL(c.req.url).searchParams.get("name");
    if (query?.trim()) name = query.trim().slice(0, 80);
  }

  const generated = await generateToken();
  const id = randomId(12);
  await insertToken(c.env.DB, {
    id,
    name,
    prefix: generated.prefix,
    hash: generated.hash,
    createdAt: now,
    issuedIp: ip,
  });
  await recordIssuance(c.env.DB, ip, now);

  const row = (await listTokens(c.env.DB)).find((candidate) => candidate.id === id);
  return json(
    {
      // Returned exactly once — it cannot be recovered later.
      token: generated.token,
      info: row ? toInfo(row) : null,
    },
    { status: 201 },
  );
});

/** Revoke the key currently being used. */
account.delete("/tokens/self", requireToken, async (c) => {
  const token = c.get("token")!;
  await revokeToken(c.env.DB, token.id, Date.now());
  return c.body(null, 204);
});

account.get("/tokens", async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const rows = await listTokens(c.env.DB);
  return json({ tokens: rows.map(toInfo) });
});

account.delete("/tokens/:id", async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;
  const changes = await revokeToken(c.env.DB, c.req.param("id"), Date.now());
  if (changes === 0) return fail(404, "not_found", "No active token with that id.");
  return c.body(null, 204);
});
