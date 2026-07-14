import { create } from 'zustand';
import {
  AuthUser,
  loginRequest,
  refreshRequest,
  logoutRequest,
  meRequest,
  extractAuthError,
} from '../api/authApi';

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

  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Silent refresh via the httpOnly cookie. Returns true if a session was restored. */
  refresh: () => Promise<boolean>;
  /** Called once on app load to restore an existing session. */
  bootstrap: () => Promise<boolean>;
  hasPermission: (key: string) => boolean;
}

// Refresh tokens are SINGLE-USE (auth-service rotates them on every /refresh). Two concurrent
// refreshes therefore race: the first rotates the cookie, the second presents the now-spent token and
// 401s, killing the session. That happens for real — App bootstrap and an apiFetch 401-retry can fire
// at the same moment on a page load. Single-flight it: concurrent callers share one in-flight request.
let refreshInFlight: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  status: 'idle',
  error: null,

  login: async (username, password) => {
    set({ status: 'authenticating', error: null });
    try {
      const { token, user } = await loginRequest(username, password);
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
    try {
      await logoutRequest();
    } catch {
      // Best-effort: clear local state regardless of server response.
    }
    set({ accessToken: null, user: null, status: 'unauthenticated', error: null });
  },

  refresh: async () => {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const { token } = await refreshRequest();
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
      } catch {
        set({ accessToken: null, user: null, status: 'unauthenticated' });
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
