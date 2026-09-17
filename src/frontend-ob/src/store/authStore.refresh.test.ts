// 2026-09-17: refresh() distinguishes a transient failure (429 / 5xx / network) from the server ending
// the session (401 / 403 / SESSION_*). With a still-valid access token the session stands and the
// refresh is retried after Retry-After; a bootstrap with no token retries briefly before giving up.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

const api = vi.hoisted(() => ({
  refreshRequest: vi.fn(),
  meRequest: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  extractAuthError: (e: unknown) => String(e),
  sessionEndCodeOf: (e: unknown) => {
    const code = (e as AxiosError)?.response?.data && ((e as AxiosError).response!.data as { code?: string }).code;
    return code === 'SESSION_IDLE_TIMEOUT' ? 'inactivity' : code === 'SESSION_MAX_DURATION' ? 'expired' : null;
  },
}));
vi.mock('../api/authApi', () => api);

import { useAuthStore } from './authStore';

const failure = (status: number | undefined, headers: Record<string, string> = {}, data: unknown = {}) => {
  const e = new AxiosError('boom', status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK');
  if (status) e.response = { status, data, headers: new AxiosHeaders(headers), statusText: '', config: { headers: new AxiosHeaders() } };
  return e;
};
const jwt = (expInSeconds: number) => `h.${btoa(JSON.stringify({ sub: 'u', exp: Math.floor(Date.now() / 1000) + expInSeconds })).replace(/=/g, '')}.s`;

beforeEach(() => {
  vi.useFakeTimers();
  api.refreshRequest.mockReset();
  api.meRequest.mockReset().mockResolvedValue({ user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: [] });
  useAuthStore.setState({ accessToken: null, user: null, status: 'idle', error: null, sessionEndReason: null });
});
afterEach(() => { vi.useRealTimers(); });

describe('authStore.refresh', () => {
  it('a 429 with a valid token in hand keeps the session and retries after Retry-After', async () => {
    const token = jwt(3000);
    useAuthStore.setState({ accessToken: token, status: 'authenticated', user: { user_id: 'u', username: 'admin', email: '', role: 'Admin', is_active: true, permissions: [] } });
    api.refreshRequest.mockRejectedValueOnce(failure(429, { 'retry-after': '3' })).mockResolvedValueOnce({ token: jwt(3600) });

    const ok = await useAuthStore.getState().refresh();
    expect(ok).toBe(true);
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().accessToken).toBe(token);
    expect(api.refreshRequest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_100);
    expect(api.refreshRequest).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().accessToken).not.toBe(token);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('a 401 ends the session even with a token in hand', async () => {
    useAuthStore.setState({ accessToken: jwt(3000), status: 'authenticated' });
    api.refreshRequest.mockRejectedValueOnce(failure(401));
    expect(await useAuthStore.getState().refresh()).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('a transient failure with an EXPIRED token ends the session', async () => {
    useAuthStore.setState({ accessToken: jwt(-10), status: 'authenticated' });
    api.refreshRequest.mockRejectedValueOnce(failure(503));
    expect(await useAuthStore.getState().refresh()).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('a bootstrap with no token retries a transient failure briefly, then restores the session', async () => {
    api.refreshRequest.mockRejectedValueOnce(failure(undefined)).mockRejectedValueOnce(failure(429, { 'retry-after': '2' })).mockResolvedValueOnce({ token: jwt(3600) });
    const p = useAuthStore.getState().bootstrap();
    await vi.advanceTimersByTimeAsync(3_000);   // first retry (bootstrap backoff 2 s)
    await vi.advanceTimersByTimeAsync(3_000);   // second retry (Retry-After 2 s)
    expect(await p).toBe(true);
    expect(api.refreshRequest).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('a bootstrap that keeps failing transiently gives up as unauthenticated after its attempts', async () => {
    api.refreshRequest.mockRejectedValue(failure(503));
    const p = useAuthStore.getState().bootstrap();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toBe(false);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(api.refreshRequest.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
