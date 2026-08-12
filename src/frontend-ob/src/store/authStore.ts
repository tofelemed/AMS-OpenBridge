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
} from '../auth/sessionClock';

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
  const fireIn = Math.max(expMs - Date.now() - 60_000, 5_000);
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
        // Server-enforced idle/absolute → surface the typed reason in the dialog.
        const reason = sessionEndCodeOf(error);
        cancelProactiveRefresh();
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
    const restored = await get().refresh();
    if (!restored) set({ status: 'unauthenticated' });
    return restored;
  },

  hasPermission: (key) => !!get().user?.permissions?.includes(key),
}));
