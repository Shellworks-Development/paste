export type Visibility = "public" | "unlisted" | "encrypted";

export interface PasteMeta {
  id: string;
  title: string | null;
  language: string;
  size: number;
  visibility: Visibility;
  burn_after_read: boolean;
  /** Opt-in mode that allows sanitized, scoped custom CSS when rendering. */
  unsafe: boolean;
  views: number;
  created_at: number;
  expires_at: number | null;
  owner: boolean;
  url: string;
  raw_url: string;
  download_url: string;
}

export interface Paste extends PasteMeta {
  content: string;
}

export interface TokenInfo {
  id: string;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface CreatePasteInput {
  content: string;
  title?: string;
  language?: string;
  visibility?: Visibility;
  burn_after_read?: boolean;
  /** Opt in to scoped custom CSS when the paste is rendered. Disabled by default. */
  unsafe?: boolean;
  /** Seconds until the paste expires, a preset like `1w`, or `null`/`never` for no expiry. */
  expires_in?: number | string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface Stats {
  pastes: number;
  bytes: number;
}

export const LIMITS = {
  anonBytes: 1_048_576,
  authBytes: 5_242_880,
} as const;

export const EXPIRY_PRESETS: { value: string; label: string; seconds: number | null }[] = [
  { value: "10m", label: "10 minutes", seconds: 600 },
  { value: "1h", label: "1 hour", seconds: 3_600 },
  { value: "1d", label: "1 day", seconds: 86_400 },
  { value: "1w", label: "1 week", seconds: 604_800 },
  { value: "2w", label: "2 weeks", seconds: 1_209_600 },
  { value: "1m", label: "1 month", seconds: 2_592_000 },
  { value: "6m", label: "6 months", seconds: 15_552_000 },
  { value: "1y", label: "1 year", seconds: 31_536_000 },
  { value: "never", label: "Never", seconds: null },
];
