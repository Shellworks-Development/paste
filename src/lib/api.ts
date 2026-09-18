import type {
  ApiErrorBody,
  CreatePasteInput,
  Paste,
  PasteMeta,
  Stats,
  TokenInfo,
} from "@shared/types";
import type { Language } from "@shared/languages";

const TOKEN_KEY = "paste.token";
const ADMIN_KEY = "paste.admin";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(value: string | null): void {
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_KEY);
}

export function setAdminToken(value: string | null): void {
  if (value) localStorage.setItem(ADMIN_KEY, value);
  else localStorage.removeItem(ADMIN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  admin?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  const init: RequestInit = { method: options.method ?? "GET", headers, signal: options.signal };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (options.admin) {
    const admin = getAdminToken();
    if (!admin) throw new ApiError(403, "missing_admin_token", "Enter an admin token first.");
    headers.set("X-Admin-Token", admin);
  }

  const response = await fetch(path, init);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "request_failed",
      errorBody?.error?.message ?? `Request failed with status ${response.status}.`,
    );
  }

  return payload as T;
}

export const api = {
  createPaste(input: CreatePasteInput): Promise<PasteMeta> {
    return request<PasteMeta>("/api/pastes", {
      method: "POST",
      body: {
        content: input.content,
        title: input.title,
        language: input.language,
        visibility: input.visibility,
        burn_after_read: input.burn_after_read,
        unsafe: input.unsafe,
        expires_in: input.expires_in,
      },
    });
  },

  getPaste(id: string, signal?: AbortSignal): Promise<Paste> {
    return request<Paste>(`/api/pastes/${encodeURIComponent(id)}`, { signal });
  },

  getPasteMeta(id: string, signal?: AbortSignal): Promise<PasteMeta> {
    return request<PasteMeta>(`/api/pastes/${encodeURIComponent(id)}/meta`, { signal });
  },

  deletePaste(id: string): Promise<void> {
    return request<void>(`/api/pastes/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  listMine(): Promise<{ pastes: PasteMeta[] }> {
    return request<{ pastes: PasteMeta[] }>("/api/pastes?limit=100");
  },

  recent(limit = 25): Promise<{ pastes: PasteMeta[] }> {
    return request<{ pastes: PasteMeta[] }>(`/api/recent?limit=${limit}`);
  },

  stats(): Promise<Stats> {
    return request<Stats>("/api/stats");
  },

  languages(): Promise<{ languages: Language[]; default: string }> {
    return request<{ languages: Language[]; default: string }>("/api/languages");
  },

  me(): Promise<{ token: TokenInfo }> {
    return request<{ token: TokenInfo }>("/api/me");
  },

  listTokens(): Promise<{ tokens: TokenInfo[] }> {
    return request<{ tokens: TokenInfo[] }>("/api/tokens", { admin: true });
  },

  createToken(name: string): Promise<{ token: string; info: TokenInfo | null }> {
    return request<{ token: string; info: TokenInfo | null }>("/api/tokens", {
      method: "POST",
      body: { name },
    });
  },

  revokeSelf(): Promise<void> {
    return request<void>("/api/tokens/self", { method: "DELETE" });
  },

  revokeToken(id: string): Promise<void> {
    return request<void>(`/api/tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
      admin: true,
    });
  },
};
