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

/** apiFetch + JSON parse, throwing on a non-2xx (so react-query surfaces the error). */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${input} → ${res.status}`);
  return res.json() as Promise<T>;
}

export default apiFetch;
