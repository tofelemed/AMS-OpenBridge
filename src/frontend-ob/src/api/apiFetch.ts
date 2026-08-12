// Phase K — the single place an access token gets attached to an API call.
//
// Before this, display/asset/binding calls used bare fetch() and sent no Authorization header at all
// (display-service accepted anonymous writes). Now that display-service validates RS256 bearer tokens,
// every call to it has to carry one — and refresh it when the access token expires.
import { useAuthStore } from '../store/authStore';
import { markApiActivity } from '../auth/sessionClock';

// H2: interval-driven refetches are machine-initiated and must NOT extend the
// idle-session clock — otherwise any page with a poller keeps a parked tab
// alive forever. Polling queryFns wrap themselves in backgroundPoll(); the
// counter only needs to cover the SYNCHRONOUS start of the queryFn, which is
// when apiFetch marks activity.
let pollDepth = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function backgroundPoll<F extends (...args: any[]) => any>(fn: F): F {
  return ((...args: Parameters<F>) => {
    pollDepth++;
    try {
      return fn(...args);
    } finally {
      pollDepth--;
    }
  }) as F;
}

/** fetch() + Authorization bearer + one silent-refresh retry on 401. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const call = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  // Session idle clock: every authenticated USER-initiated REST call counts as
  // activity (login/refresh go through authApi, not here, so they don't
  // self-extend; interval polls opt out via backgroundPoll above).
  if (pollDepth === 0 && useAuthStore.getState().accessToken) markApiActivity();

  const res = await call(useAuthStore.getState().accessToken);
  if (res.status !== 401) return res;

  // Access token expired mid-session: refresh via the httpOnly cookie and replay once.
  const refreshed = await useAuthStore.getState().refresh();
  if (!refreshed) return res;
  return call(useAuthStore.getState().accessToken);
}

/**
 * Typed API failure. Pages branch on `status` (e.g. err.status === 403) and show
 * `message`, which prefers the server's problem-detail body over the old
 * "GET /api/... → 500" internals leak. `String(error)` still yields something
 * readable for legacy render sites.
 */
export class ApiError extends Error {
  readonly status: number;
  /** Raw server detail (problem+json title/detail/error/message), if any. */
  readonly detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function friendlyHttpMessage(status: number, detail?: string): string {
  if (detail) return detail;
  if (status === 401) return 'Your session is not authorized for this request.';
  if (status === 403) return 'You do not have permission to view this.';
  if (status === 404) return 'The requested data was not found.';
  if (status >= 500) return 'The service is currently unavailable. Try again shortly.';
  return `Request failed (HTTP ${status}).`;
}

/** apiFetch + JSON parse, throwing a typed ApiError on non-2xx (react-query surfaces it). */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    // Best-effort read of the server's error body (problem+json or ad-hoc JSON).
    let detail: string | undefined;
    try {
      const body = await res.json() as Record<string, unknown>;
      detail = [body.detail, body.title, body.error, body.message]
        .find((v): v is string => typeof v === 'string' && v.length > 0);
    } catch {
      /* non-JSON body — keep the generic wording */
    }
    throw new ApiError(res.status, friendlyHttpMessage(res.status, detail), detail);
  }
  return res.json() as Promise<T>;
}

export default apiFetch;
