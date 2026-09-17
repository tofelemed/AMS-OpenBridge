/**
 * 2026-09-17: what a failed /refresh means. The store used to end the session on ANY failure - a
 * 429 from the gateway's rate limiter (one Redis hiccup), a 502/503 while a service restarts, a
 * dropped connection - although the access token in hand was still valid for most of an hour.
 * Those are transient: the session stands, the refresh is retried (Retry-After, else a short
 * backoff). Only the server refusing the refresh token (401 / 403, a typed SESSION_* code) or a
 * token that has actually expired ends the session.
 */
import axios from 'axios';

export type RefreshFailure = 'terminal' | 'transient';

const TERMINAL_CODES = new Set(['SESSION_IDLE_TIMEOUT', 'SESSION_MAX_DURATION', 'SESSION_REVOKED', 'REFRESH_TOKEN_INVALID', 'REFRESH_TOKEN_REUSED']);

export function classifyRefreshFailure(error: unknown): RefreshFailure {
  if (axios.isAxiosError(error)) {
    const code = (error.response?.data as { code?: string } | undefined)?.code;
    if (code && TERMINAL_CODES.has(code)) return 'terminal';
    const status = error.response?.status;
    if (status === 401 || status === 403) return 'terminal';
    return 'transient';                                    // 429, 5xx, no response (network / timeout)
  }
  return 'transient';
}

const BACKOFF_MS = [5_000, 15_000, 45_000];
export const MAX_RETRY_DELAY_MS = 60_000;

/** The server's Retry-After in ms (seconds form), capped at a minute; null when it said nothing. */
export function retryAfterMs(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const ra = error.response?.headers?.['retry-after'];
  const seconds = typeof ra === 'string' ? Number(ra) : typeof ra === 'number' ? ra : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_DELAY_MS) : null;
}

/** When to try again: the server's Retry-After when it says, else 5 s → 15 s → 45 s. */
export function retryDelayMs(error: unknown, attempt: number): number {
  return retryAfterMs(error) ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

/** The JWT's exp in epoch ms (base64url payload), or null when the token cannot be read. */
export function tokenExpiresAtMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const b64url = token.split('.')[1] ?? '';
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** A token is worth keeping while it has more than a grace margin left. */
export const tokenStillValid = (token: string | null | undefined, nowMs: number, graceMs = 15_000): boolean => {
  const exp = tokenExpiresAtMs(token);
  return exp != null && exp - nowMs > graceMs;
};
