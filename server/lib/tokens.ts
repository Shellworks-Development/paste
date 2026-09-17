export const TOKEN_PREFIX = "psk_";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return hex(digest);
}

export interface GeneratedToken {
  /** The plaintext token. Shown to the caller exactly once. */
  token: string;
  /** A short, non-secret prefix used to identify the token in lists. */
  prefix: string;
  hash: string;
}

export async function generateToken(): Promise<GeneratedToken> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = TOKEN_PREFIX + base64url(bytes);
  return {
    token,
    prefix: token.slice(0, TOKEN_PREFIX.length + 6),
    hash: await hashToken(token),
  };
}

/** Constant-time comparison of two equal-length strings. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

/** Compares a candidate admin token against the configured secret. */
export async function verifyAdminToken(candidate: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([hashToken(candidate), hashToken(expected)]);
  return timingSafeEqualString(left, right);
}
