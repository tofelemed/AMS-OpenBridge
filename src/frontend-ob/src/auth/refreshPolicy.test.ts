// 2026-09-17: a failed /refresh used to end the session whatever the failure was. A 429 from the
// gateway's rate limiter (one Redis hiccup), a 502/503 while a service restarts or a dropped
// connection are TRANSIENT: the access token in hand is still valid, so the session stands and the
// refresh is retried. Only the server saying "no" (401 / 403, a typed SESSION_* code) or a token
// that has actually expired ends it.
import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { classifyRefreshFailure, retryDelayMs, tokenExpiresAtMs } from './refreshPolicy';

const axiosError = (status: number | undefined, data: unknown = {}, headers: Record<string, string> = {}): AxiosError => {
  const e = new AxiosError('boom', status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK');
  if (status) e.response = { status, data, headers: new AxiosHeaders(headers), statusText: '', config: { headers: new AxiosHeaders() } };
  return e;
};
const jwt = (exp: number) => `h.${btoa(JSON.stringify({ sub: 'u', exp })).replace(/=/g, '')}.s`;

describe('classifyRefreshFailure', () => {
  it('a 401 / 403 or a typed session code is terminal', () => {
    expect(classifyRefreshFailure(axiosError(401))).toBe('terminal');
    expect(classifyRefreshFailure(axiosError(403))).toBe('terminal');
    expect(classifyRefreshFailure(axiosError(200, { code: 'SESSION_IDLE_TIMEOUT' }))).toBe('terminal');
  });
  it('a 429, a 5xx, a network error or a timeout is transient', () => {
    expect(classifyRefreshFailure(axiosError(429))).toBe('transient');
    expect(classifyRefreshFailure(axiosError(502))).toBe('transient');
    expect(classifyRefreshFailure(axiosError(503))).toBe('transient');
    expect(classifyRefreshFailure(axiosError(undefined))).toBe('transient');
    expect(classifyRefreshFailure(new Error('timeout of 10000ms exceeded'))).toBe('transient');
  });
});

describe('retryDelayMs', () => {
  it('honours Retry-After (seconds), capped, else backs off 5 s → 15 s → 45 s', () => {
    expect(retryDelayMs(axiosError(429, {}, { 'retry-after': '7' }), 0)).toBe(7_000);
    expect(retryDelayMs(axiosError(429, {}, { 'retry-after': '600' }), 0)).toBe(60_000);
    expect(retryDelayMs(axiosError(503), 0)).toBe(5_000);
    expect(retryDelayMs(axiosError(503), 1)).toBe(15_000);
    expect(retryDelayMs(axiosError(503), 2)).toBe(45_000);
    expect(retryDelayMs(axiosError(503), 9)).toBe(45_000);
  });
});

describe('tokenExpiresAtMs', () => {
  it('reads exp from a base64url JWT and null from anything else', () => {
    expect(tokenExpiresAtMs(jwt(1_800_000_000))).toBe(1_800_000_000_000);
    expect(tokenExpiresAtMs('not-a-jwt')).toBeNull();
    expect(tokenExpiresAtMs(null)).toBeNull();
  });
});
