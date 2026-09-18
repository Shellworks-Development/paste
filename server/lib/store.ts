import type { Visibility } from "@shared/types";

export interface PasteRow {
  id: string;
  title: string | null;
  language: string;
  size: number;
  r2_key: string;
  visibility: Visibility;
  burn_after_read: number;
  unsafe: number;
  views: number;
  created_at: number;
  expires_at: number | null;
  owner_id: string | null;
}

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface InsertPasteInput {
  id: string;
  title: string | null;
  language: string;
  size: number;
  r2Key: string;
  visibility: Visibility;
  burnAfterRead: boolean;
  unsafe: boolean;
  createdAt: number;
  expiresAt: number | null;
  ownerId: string | null;
}

export async function insertPaste(db: D1Database, input: InsertPasteInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO pastes
        (id, title, language, size, r2_key, visibility, burn_after_read, unsafe, views, created_at, expires_at, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.title,
      input.language,
      input.size,
      input.r2Key,
      input.visibility,
      input.burnAfterRead ? 1 : 0,
      input.unsafe ? 1 : 0,
      input.createdAt,
      input.expiresAt,
      input.ownerId,
    )
    .run();
}

export async function getPaste(db: D1Database, id: string): Promise<PasteRow | null> {
  return await db.prepare("SELECT * FROM pastes WHERE id = ?").bind(id).first<PasteRow>();
}

export async function deletePaste(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM pastes WHERE id = ?").bind(id).run();
}

export async function incrementViews(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE pastes SET views = views + 1 WHERE id = ?").bind(id).run();
}

export async function listByOwner(
  db: D1Database,
  ownerId: string,
  limit: number,
  offset: number,
): Promise<PasteRow[]> {
  const result = await db
    .prepare("SELECT * FROM pastes WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(ownerId, limit, offset)
    .all<PasteRow>();
  return result.results ?? [];
}

export async function listPublic(
  db: D1Database,
  now: number,
  limit: number,
  offset: number,
): Promise<PasteRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM pastes
       WHERE visibility = 'public' AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(now, limit, offset)
    .all<PasteRow>();
  return result.results ?? [];
}

export async function countPastes(db: D1Database): Promise<{ pastes: number; bytes: number }> {
  const row = await db
    .prepare("SELECT COUNT(*) AS pastes, COALESCE(SUM(size), 0) AS bytes FROM pastes")
    .first<{ pastes: number; bytes: number }>();
  return { pastes: row?.pastes ?? 0, bytes: row?.bytes ?? 0 };
}

export async function findTokenByHash(db: D1Database, hash: string): Promise<TokenRow | null> {
  return await db
    .prepare("SELECT * FROM tokens WHERE hash = ? AND revoked_at IS NULL")
    .bind(hash)
    .first<TokenRow>();
}

export async function touchToken(db: D1Database, id: string, at: number): Promise<void> {
  await db.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?").bind(at, id).run();
}

export async function insertToken(
  db: D1Database,
  token: {
    id: string;
    name: string;
    prefix: string;
    hash: string;
    createdAt: number;
    issuedIp?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO tokens (id, name, prefix, hash, created_at, issued_ip) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(token.id, token.name, token.prefix, token.hash, token.createdAt, token.issuedIp ?? null)
    .run();
}

export interface IssuanceRow {
  ip: string;
  last_issued_at: number;
}

export async function getIssuance(db: D1Database, ip: string): Promise<IssuanceRow | null> {
  return await db
    .prepare("SELECT ip, last_issued_at FROM token_issuance WHERE ip = ?")
    .bind(ip)
    .first<IssuanceRow>();
}

export async function recordIssuance(db: D1Database, ip: string, at: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO token_issuance (ip, last_issued_at) VALUES (?, ?)
       ON CONFLICT(ip) DO UPDATE SET last_issued_at = excluded.last_issued_at`,
    )
    .bind(ip, at)
    .run();
}

export async function deleteStaleIssuance(db: D1Database, before: number): Promise<void> {
  await db.prepare("DELETE FROM token_issuance WHERE last_issued_at < ?").bind(before).run();
}

export async function listTokens(db: D1Database): Promise<TokenRow[]> {
  const result = await db.prepare("SELECT * FROM tokens ORDER BY created_at DESC").all<TokenRow>();
  return result.results ?? [];
}

export async function revokeToken(db: D1Database, id: string, at: number): Promise<number> {
  const result = await db
    .prepare("UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(at, id)
    .run();
  return result.meta.changes ?? 0;
}

export async function findExpiredPastes(
  db: D1Database,
  now: number,
  limit: number,
): Promise<{ id: string; r2_key: string }[]> {
  const result = await db
    .prepare(
      "SELECT id, r2_key FROM pastes WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT ?",
    )
    .bind(now, limit)
    .all<{ id: string; r2_key: string }>();
  return result.results ?? [];
}

export async function deleteExpired(db: D1Database, now: number): Promise<void> {
  await db
    .prepare("DELETE FROM pastes WHERE expires_at IS NOT NULL AND expires_at <= ?")
    .bind(now)
    .run();
}
