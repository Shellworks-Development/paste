import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppContext } from "./context";
import { fail } from "./lib/http";
import { deleteExpired, deleteStaleIssuance, findExpiredPastes } from "./lib/store";
import { loadToken } from "./middleware/auth";
import { meta } from "./routes/meta";
import { pastes, rawHandler } from "./routes/pastes";
import { account } from "./routes/tokens";

export const app = new Hono<AppContext>();
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
});

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Admin-Token"],
    maxAge: 86_400,
  }),
);

app.use("/api/*", loadToken);

app.route("/api/pastes", pastes);
app.route("/api", account);
app.route("/api", meta);

app.get("/raw/:id", rawHandler);
app.get("/dl/:id", rawHandler);
app.get("/p/:id/raw", rawHandler);
app.get("/p/:id/download", rawHandler);

app.notFound((c) => fail(404, "not_found", `No route for ${c.req.method} ${c.req.path}.`));

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      message: "unhandled_error",
      path: c.req.path,
      method: c.req.method,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return fail(500, "internal_error", "Something went wrong while handling this request.");
});

async function cleanup(env: Env): Promise<void> {
  const now = Date.now();
  const expired = await findExpiredPastes(env.DB, now, 1000);
  if (expired.length > 0) {
    await env.PASTES.delete(expired.map((row) => row.r2_key));
  }
  await deleteExpired(env.DB, now);
  await deleteStaleIssuance(env.DB, now - 24 * 60 * 60 * 1000);
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> =>
    app.fetch(request, env, ctx),
  scheduled: (_controller: ScheduledController, env: Env, ctx: ExecutionContext): void => {
    ctx.waitUntil(cleanup(env));
  },
} satisfies ExportedHandler<Env>;
