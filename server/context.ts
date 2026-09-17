import type { Context } from "hono";

import type { TokenRow } from "./lib/store";

declare global {
  interface Env {
    /** Optional secret. Required to mint and revoke API tokens. */
    ADMIN_TOKEN?: string;
  }
}

export interface Variables {
  token: TokenRow | null;
}

export type AppContext = {
  Bindings: Env;
  Variables: Variables;
};

export type AppEnv = Context<AppContext>;

/**
 * Schedules work after the response without breaking in contexts that have no
 * `ExecutionContext` (for example `app.request()` in tests).
 */
export function background(c: AppEnv, promise: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    promise.catch(() => undefined);
  }
}
