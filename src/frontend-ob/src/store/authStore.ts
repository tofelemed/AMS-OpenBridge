import { create } from 'zustand';
import {
  AuthUser,
  loginRequest,
  refreshRequest,
  logoutRequest,
  meRequest,
  extractAuthError,
  sessionEndCodeOf,
} from '../api/authApi';
import {
  SessionEndReason,
  startSessionClocks,
  updatePolicy,
  clearSessionClocks,
  expiredReason,
  getPolicy,
} from '../auth/sessionClock';
import { classifyRefreshFailure, retryAfterMs, retryDelayMs, tokenStillValid } from '../auth/refreshPolicy';

export type AuthStatus =
  | 'idle' // not yet checked
  | 'authenticating' // login in flight
  | 'authenticated'
  | 'unauthenticated';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  /** Why the last session ended (drives the timeout dialog); null = normal logout/none. */
  sessionEndReason: SessionEndReason | null;

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Silent refresh via the httpOnly cookie. Returns true if a session was restored. */
  refresh: () => Promise<boolean>;
  /** Called once on app load to restore an existing session. */
  bootstrap: () => Promise<boolean>;
  /** Session-policy logout: best-effort server logout + reason for the dialog. */
  endSession: (reason: SessionEndReason) => Promise<void>;
  clearSessionEndReason: () => void;
  hasPermission: (key: string) => boolean;
}

// Refresh tokens are SINGLE-USE (auth-service rotates them on every /refresh). Two concurrent
// refreshes therefore race: the first rotates the cookie, the second presents the now-spent token and
// 401s, killing the session. That happens for real — App bootstrap and an apiFetch 401-retry can fire
// at the same moment on a page load. Single-flight it: concurrent callers share one in-flight request.
let refreshInFlight: Promise<boolean> | null = null;

// ── Proactive refresh ────────────────────────────────────────────────────────
// Rotate ~60s before the access token expires so sessions survive without a 401
// round-trip — and so the SERVER idle clock (time since last successful
// /refresh) keeps moving while the user is genuinely active. The scheduler
// refuses to fire once the local clocks say the session is over; the watchdog
// in App.tsx then ends the session with the right reason.
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

function jwtExpMs(token: string): number | null {
  try {
    // H3: JWTs are base64URL (RFC 7515) — atob() throws on '-'/'_', which real
    // tokens virtually always contain. Normalize + pad before decoding, or the
    // proactive-refresh scheduler silently never runs.
    const b64url = token.split('.')[1] ?? '';
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleProactiveRefresh(token: string): void {
  if (proactiveTimer) clearTimeout(proactiveTimer);
  const expMs = jwtExpMs(token);
  if (!expMs) return;

  // Two constraints, whichever is SOONER:
  //  1) refresh ~60s before the access token expires (avoid a 401 round-trip);
  //  2) refresh well WITHIN the server's idle window. The server's sliding-idle
  //     clock (last_used_at) only advances on a successful /refresh, so if we only
  //     refreshed at token expiry (~59m) the server would see idle ≈ 59m and reject
  //     an ACTIVE user whose idle window is 30m — the "logged out while using it"
  //     bug. Refreshing at ~40% of the idle window keeps last_used_at fresh (≥2
  //     refreshes per window) so an active session never trips the server clock.
  // The refresh itself is gated on the LOCAL idle clock (expiredReason below), so a
  // genuinely idle user is still ended by the App watchdog at the window boundary.
  const { idleMs } = getPolicy();
  const beforeExpiry = expMs - Date.now() - 60_000;
  const withinIdleWindow = idleMs * 0.4;
  const fireIn = Math.max(Math.min(beforeExpiry, withinIdleWindow), 30_000);

  proactiveTimer = setTimeout(() => {
    const { status, refresh, endSession } = useAuthStore.getState();
    if (status !== 'authenticated') return;
    const reason = expiredReason();
    if (reason) {
      void endSession(reason);
      return;
    }
    void refresh();
  }, fireIn);
}

function cancelProactiveRefresh(): void {
  if (proactiveTimer) clearTimeout(proactiveTimer);
  proactiveTimer = null;
}

// ── Transient refresh failures ───────────────────────────────────────────────
// 2026-09-17: a 429 (the gateway's limiter behind one Redis hiccup), a 5xx or a dropped
// connection is not the server ending the session. With a still-valid access token the
// session stands and the refresh is retried after Retry-After / a short backoff; the
// count resets on success. A bootstrap (no token yet) retries a few times before it
// gives up, so a page load during a blip lands on the app, not on the login form.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
const BOOTSTRAP_ATTEMPTS = 3;
const BOOTSTRAP_BACKOFF_MS = 2_000;
const MAX_BOOTSTRAP_WAIT_MS = 5_000;

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(error: unknown): void {
  cancelRetry();
  const delay = retryDelayMs(error, retryAttempt++);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (useAuthStore.getState().status === 'authenticated') void useAuthStore.getState().refresh();
  }, delay);
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  status: 'idle',
  error: null,
  sessionEndReason: null,

  login: async (username, password) => {
    set({ status: 'authenticating', error: null, sessionEndReason: null });
    try {
      const { token, user, sessionPolicy } = await loginRequest(username, password);
      startSessionClocks(sessionPolicy); // both clocks start NOW; absolute is never extended
      scheduleProactiveRefresh(token);
      set({ accessToken: token, user, status: 'authenticated', error: null });
    } catch (error) {
      set({
        accessToken: null,
        user: null,
        status: 'unauthenticated',
        error: extractAuthError(error),
      });
      throw error;
    }
  },

  logout: async () => {
    cancelProactiveRefresh();
    clearSessionClocks();
    try {
      await logoutRequest();
    } catch {
      // Best-effort: clear local state regardless of server response.
    }
    set({ accessToken: null, user: null, status: 'unauthenticated', error: null });
  },

  endSession: async (reason) => {
    cancelProactiveRefresh();
    clearSessionClocks();
    try {
      await logoutRequest(); // best-effort DELETE of the refresh row
    } catch {
      /* the server may already have deleted it (idle/absolute enforcement) */
    }
    set({
      accessToken: null,
      user: null,
      status: 'unauthenticated',
      error: null,
      sessionEndReason: reason,
    });
  },

  clearSessionEndReason: () => set({ sessionEndReason: null }),

  refresh: async () => {
    if (refreshInFlight) return refreshInFlight;

    // Local clocks already expired → don't even present the refresh token;
    // end with the same reason the server would have returned.
    const localReason = expiredReason();
    if (localReason && get().status === 'authenticated') {
      await get().endSession(localReason);
      return false;
    }

    refreshInFlight = (async () => {
      try {
        const { token, sessionPolicy } = await refreshRequest();
        if (sessionPolicy) updatePolicy(sessionPolicy); // policy only — clocks untouched
        cancelRetry();
        retryAttempt = 0;
        scheduleProactiveRefresh(token);
        set({ accessToken: token, status: 'authenticated' });
        if (!get().user) {
          try {
            const user = await meRequest(token);
            set({ user });
          } catch {
            // A missing profile is non-fatal; token is still usable.
          }
        }
        return true;
      } catch (error) {
        // A transient failure with a token still worth keeping: the session stands, retry later.
        if (classifyRefreshFailure(error) === 'transient' && tokenStillValid(get().accessToken, Date.now())) {
          scheduleRetry(error);
          return true;
        }
        // Server-enforced idle/absolute → surface the typed reason in the dialog.
        const reason = sessionEndCodeOf(error);
        cancelProactiveRefresh();
        cancelRetry();
        clearSessionClocks();
        set({
          accessToken: null,
          user: null,
          status: 'unauthenticated',
          ...(reason ? { sessionEndReason: reason } : {}),
        });
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  bootstrap: async () => {
    // No token yet, so a transient failure cannot be ridden out on the token: retry a few times
    // (Retry-After when the server says, else 2 s) before deciding there is no session.
    for (let attempt = 0; ; attempt++) {
      let failure: unknown = null;
      try {
        const { token, sessionPolicy } = await refreshRequest();
        if (sessionPolicy) updatePolicy(sessionPolicy);
        retryAttempt = 0;
        scheduleProactiveRefresh(token);
        set({ accessToken: token, status: 'authenticated' });
        try { set({ user: await meRequest(token) }); } catch { /* profile is non-fatal */ }
        return true;
      } catch (error) {
        failure = error;
      }
      if (classifyRefreshFailure(failure) === 'terminal' || attempt + 1 >= BOOTSTRAP_ATTEMPTS) break;
      const ra = retryAfterMs(failure);
      await sleep(ra != null ? Math.min(ra, MAX_BOOTSTRAP_WAIT_MS) : BOOTSTRAP_BACKOFF_MS);
    }
    set({ accessToken: null, user: null, status: 'unauthenticated' });
    return false;
  },

  hasPermission: (key) => !!get().user?.permissions?.includes(key),
}));
