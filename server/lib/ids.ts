const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CEIL = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * Generates a short, URL-safe, cryptographically random identifier.
 * Uses rejection sampling so every character is uniformly distributed.
 */
export function randomId(length = 8): string {
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < CEIL) {
        out += ALPHABET[byte % ALPHABET.length];
        if (out.length === length) break;
      }
    }
  }
  return out;
}

export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9]{4,64}$/.test(id);
}
