import { env } from "cloudflare:test";
import { describe, expect, it } from "vite-plus/test";

import type { Paste, PasteMeta, TokenInfo } from "@shared/types";

import { app } from "../server/index";
const ADMIN_TOKEN = "test-admin-token";

function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return Promise.resolve(app.request(path, { ...init, headers }, env));
}

function createPaste(body: Record<string, unknown>, token?: string): Promise<Response> {
  return api("/api/pastes", { method: "POST", body: JSON.stringify(body) }, token);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function mintToken(name = "test"): Promise<string> {
  // Clear the per-IP issuance cooldown so tests can mint freely.
  await env.DB.prepare("DELETE FROM token_issuance").run();
  const response = await api("/api/tokens", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  const { token } = await readJson<{ token: string }>(response);
  return token;
}

describe("meta", () => {
  it("reports health and languages", async () => {
    const health = await api("/api/health");
    expect(health.status).toBe(200);
    expect((await readJson<{ ok: boolean }>(health)).ok).toBe(true);

    const languages = await api("/api/languages");
    const { languages: list, default: fallback } = await readJson<{
      languages: { id: string }[];
      default: string;
    }>(languages);
    expect(fallback).toBe("markdown");
    expect(list.some((language) => language.id === "typescript")).toBe(true);
  });
});

describe("create and read", () => {
  it("creates a paste and serves it raw", async () => {
    const response = await createPaste({
      content: "# hello",
      title: "greeting",
      language: "markdown",
    });
    expect(response.status).toBe(201);

    const meta = await readJson<PasteMeta>(response);
    expect(meta.id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(meta.title).toBe("greeting");
    expect(meta.size).toBe(7);
    expect(meta.visibility).toBe("unlisted");
    expect(meta.owner).toBe(false);

    const raw = await api(`/raw/${meta.id}`);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toContain("text/plain");
    expect(raw.headers.get("X-Paste-Language")).toBe("markdown");
    expect(await raw.text()).toBe("# hello");

    const viaApi = await api(`/api/pastes/${meta.id}?raw`);
    expect(await viaApi.text()).toBe("# hello");

    const pretty = await api(`/api/pastes/${meta.id}`);
    const paste = await readJson<Paste>(pretty);
    expect(paste.content).toBe("# hello");
    expect(paste.views).toBeGreaterThanOrEqual(0);
  });

  it("accepts plain text bodies with query options", async () => {
    const response = await api("/api/pastes?language=rust&title=main", {
      method: "POST",
      body: "fn main() {}",
      headers: { "Content-Type": "text/plain" },
    });
    expect(response.status).toBe(201);
    const meta = await readJson<PasteMeta>(response);
    expect(meta.language).toBe("rust");
    expect(meta.title).toBe("main");
  });

  it("rejects bad input", async () => {
    expect((await createPaste({ content: "x", language: "not a lang!" })).status).toBe(400);
    expect((await createPaste({ content: "x", expires_in: -5 })).status).toBe(400);
    expect((await createPaste({ nope: true })).status).toBe(400);

    const broken = await api("/api/pastes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(broken.status).toBe(400);
  });

  it("enforces the anonymous size limit", async () => {
    const response = await createPaste({ content: "a".repeat(1_048_576 + 1) });
    expect(response.status).toBe(413);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe(
      "payload_too_large",
    );
  });

  it("returns 404 for unknown and malformed ids", async () => {
    expect((await api("/api/pastes/doesnotexist")).status).toBe(404);
    expect((await api("/api/pastes/short")).status).toBe(404);
    expect((await api("/api/pastes/!!!!")).status).toBe(400);
  });
});

describe("expiry and burn after read", () => {
  it("treats expired pastes as gone", async () => {
    const created = await createPaste({ content: "temporary" });
    const meta = await readJson<PasteMeta>(created);

    await env.DB.prepare("UPDATE pastes SET expires_at = ? WHERE id = ?")
      .bind(Date.now() - 1000, meta.id)
      .run();

    const response = await api(`/api/pastes/${meta.id}`);
    expect(response.status).toBe(410);
    expect((await readJson<{ error: { code: string } }>(response)).error.code).toBe("expired");
  });

  it("deletes a paste after a single read", async () => {
    const created = await createPaste({ content: "secret", burn_after_read: true });
    const meta = await readJson<PasteMeta>(created);
    expect(meta.burn_after_read).toBe(true);

    expect((await api(`/raw/${meta.id}`)).status).toBe(200);
    expect((await api(`/raw/${meta.id}`)).status).toBe(404);
  });
});

describe("tokens", () => {
  it("mints, uses and revokes tokens", async () => {
    const token = await mintToken("laptop");

    const me = await api("/api/me", {}, token);
    const info = (await readJson<{ token: TokenInfo }>(me)).token;
    expect(info.name).toBe("laptop");
    expect(info.prefix.startsWith("psk_")).toBe(true);

    const response = await createPaste({ content: "b".repeat(2 * 1024 * 1024) }, token);
    expect(response.status).toBe(201);
    const meta = await readJson<PasteMeta>(response);
    expect(meta.owner).toBe(true);

    const mine = await readJson<{ pastes: PasteMeta[] }>(await api("/api/pastes", {}, token));
    expect(mine.pastes.map((paste) => paste.id)).toContain(meta.id);

    expect((await api(`/api/pastes/${meta.id}`, { method: "DELETE" }, token)).status).toBe(204);
    expect((await api(`/api/pastes/${meta.id}`)).status).toBe(404);

    const revoke = await api("/api/tokens/self", { method: "DELETE" }, token);
    expect(revoke.status).toBe(204);
    expect((await api("/api/me", {}, token)).status).toBe(401);
  });

  it("enforces the per-IP key cooldown", async () => {
    await env.DB.prepare("DELETE FROM token_issuance").run();

    const first = await api("/api/tokens", { method: "POST" });
    expect(first.status).toBe(201);

    const second = await api("/api/tokens", { method: "POST" });
    expect(second.status).toBe(429);
    const body = await readJson<{ error: { code: string } }>(second);
    expect(body.error.code).toBe("key_cooldown");
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("lets an admin list every key", async () => {
    const token = await mintToken("admin-listed");
    const response = await api("/api/tokens", { headers: { "X-Admin-Token": ADMIN_TOKEN } }, token);
    expect(response.status).toBe(200);
    const { tokens } = await readJson<{ tokens: TokenInfo[] }>(response);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("rejects invalid tokens and unauthorised admin calls", async () => {
    expect((await api("/api/me", {}, "psk_not-a-real-token")).status).toBe(401);
    expect((await api("/api/tokens")).status).toBe(403);
    expect((await api("/api/tokens/some-id", { method: "DELETE" })).status).toBe(403);
    expect((await api("/api/pastes/abcdefgh", { method: "DELETE" })).status).toBe(401);
  });

  it("guards deletion by ownership", async () => {
    const owner = await mintToken("owner");
    const other = await mintToken("other");
    const created = await createPaste({ content: "mine" }, owner);
    const meta = await readJson<PasteMeta>(created);

    const forbidden = await api(`/api/pastes/${meta.id}`, { method: "DELETE" }, other);
    expect(forbidden.status).toBe(403);
    expect((await api(`/api/pastes/${meta.id}`)).status).toBe(200);
  });
});

describe("listing", () => {
  it("only lists public pastes in recent", async () => {
    const isPublic = await readJson<PasteMeta>(
      await createPaste({ content: "listed", visibility: "public" }),
    );
    const isUnlisted = await readJson<PasteMeta>(
      await createPaste({ content: "hidden", visibility: "unlisted" }),
    );

    const recent = await readJson<{ pastes: PasteMeta[] }>(await api("/api/recent?limit=50"));
    const ids = recent.pastes.map((paste) => paste.id);
    expect(ids).toContain(isPublic.id);
    expect(ids).not.toContain(isUnlisted.id);
  });
});

describe("encrypted visibility", () => {
  it("stores the envelope opaquely and keeps it out of recent", async () => {
    const envelope = "paste-encrypted:v1:210000:c2FsdA:aXY:Y2lwaGVy";
    const created = await createPaste({
      content: envelope,
      visibility: "encrypted",
      language: "markdown",
      title: "locked",
    });
    expect(created.status).toBe(201);

    const meta = await readJson<PasteMeta>(created);
    expect(meta.visibility).toBe("encrypted");

    const raw = await api(`/raw/${meta.id}`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe(envelope);

    const full = await readJson<Paste>(await api(`/api/pastes/${meta.id}`));
    expect(full.content).toBe(envelope);

    const recent = await readJson<{ pastes: PasteMeta[] }>(await api("/api/recent?limit=50"));
    expect(recent.pastes.map((paste) => paste.id)).not.toContain(meta.id);
  });
});
