import { EXPIRY_PRESETS } from "@shared/types";

const PRESETS = new Map(EXPIRY_PRESETS.map((p) => [p.value, p.seconds]));

export interface ExpiryResult {
  ok: true;
  expiresAt: number | null;
}

export interface ExpiryFailure {
  ok: false;
  message: string;
}

/**
 * Normalizes the many shapes an `expires_in` value can arrive in
 * (preset string, seconds, ISO date) into an absolute timestamp.
 */
export function resolveExpiry(
  input: unknown,
  options: { now: number; defaultSeconds: number; maxSeconds: number },
): ExpiryResult | ExpiryFailure {
  if (input === undefined || input === null || input === "") {
    return { ok: true, expiresAt: options.now + options.defaultSeconds * 1000 };
  }

  if (input === "never" || input === 0 || input === false) {
    return { ok: true, expiresAt: null };
  }

  let seconds: number | null = null;

  if (typeof input === "number") {
    seconds = input;
  } else if (typeof input === "string") {
    const preset = PRESETS.get(input);
    if (preset !== undefined)
      return { ok: true, expiresAt: preset === null ? null : options.now + preset * 1000 };

    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      seconds = parsed;
    } else {
      const date = Date.parse(input);
      if (!Number.isNaN(date)) {
        if (date <= options.now) return { ok: false, message: "expires_in is in the past" };
        if (date - options.now > options.maxSeconds * 1000) {
          return { ok: false, message: `expires_in must not exceed ${options.maxSeconds} seconds` };
        }
        return { ok: true, expiresAt: date };
      }
      return { ok: false, message: `Unrecognized expires_in value: ${input}` };
    }
  } else {
    return { ok: false, message: "expires_in must be a string or number" };
  }

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ok: false, message: "expires_in must be a positive number of seconds" };
  }
  if (seconds > options.maxSeconds) {
    return { ok: false, message: `expires_in must not exceed ${options.maxSeconds} seconds` };
  }
  return { ok: true, expiresAt: options.now + seconds * 1000 };
}
