import { createMiddleware } from "hono/factory";

import type { AppContext } from "../context";
import { fail, bearerToken } from "../lib/http";
import { findTokenByHash, touchToken } from "../lib/store";
import { hashToken } from "../lib/tokens";
import { background } from "../context";

/** Resolves `Authorization: Bearer <token>` into `c.get('token')` when present. */
export const loadToken = createMiddleware<AppContext>(async (c, next) => {
  c.set("token", null);

  const presented = bearerToken(c.req.raw);
  if (presented) {
    const row = await findTokenByHash(c.env.DB, await hashToken(presented));
    if (!row) {
      return fail(401, "invalid_token", "The provided API token is invalid or has been revoked.");
    }
    c.set("token", row);
    background(c, touchToken(c.env.DB, row.id, Date.now()));
  }

  await next();
});

export const requireToken = createMiddleware<AppContext>(async (c, next) => {
  if (!c.get("token")) {
    return fail(
      401,
      "missing_token",
      "This endpoint requires an API token (Authorization: Bearer ...).",
    );
  }
  await next();
});
