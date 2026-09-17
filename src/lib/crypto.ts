/**
 * Client-side, end-to-end encryption for pastes.
 *
 * The plaintext never leaves the browser: pastes are encrypted with AES-GCM
 * using a key derived from the user's passphrase with PBKDF2-SHA256, and the
 * server only ever stores the opaque envelope below.
 *
 *   paste-encrypted:v1:<iterations>:<salt>:<iv>:<ciphertext>
 */

export const ENCRYPTED_PREFIX = "paste-encrypted:v1:";

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 24;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

export function isEncryptedEnvelope(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/** Generates a random, URL-safe passphrase that is easy to copy and share. */
export function generateKey(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encodeText(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeText(plaintext),
  );
  return [
    ENCRYPTED_PREFIX.replace(/:$/, ""),
    String(ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(iv),
    bytesToBase64Url(new Uint8Array(ciphertext)),
  ].join(":");
}

export async function decryptText(envelope: string, passphrase: string): Promise<string> {
  const parts = envelope.split(":");
  if (parts.length !== 6 || `${parts[0]}:${parts[1]}:` !== ENCRYPTED_PREFIX) {
    throw new Error("This paste is not in a supported encrypted format.");
  }

  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error("This paste has an invalid encryption header.");
  }

  const salt = base64UrlToBytes(parts[3]);
  const iv = base64UrlToBytes(parts[4]);
  const ciphertext = base64UrlToBytes(parts[5]);
  const key = await deriveKey(passphrase, salt, iterations);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("That key did not decrypt this paste. Check it and try again.");
  }
}
