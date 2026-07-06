import { useAuthStore } from '../store/authStore';

/**
 * Returns the current bearer token for API/SignalR calls.
 * Primary source is the auth store (set on login / silent refresh). Falls back
 * to a Keycloak/dev token on the window for backwards compatibility.
 */
export function getAuthToken(): string {
  const token = useAuthStore.getState().accessToken;
  if (token) return token;

  const kcToken = (window as unknown as { kc?: { token?: string } }).kc?.token;
  if (kcToken) return kcToken;

  const dev = (window as unknown as { amsDevToken?: string }).amsDevToken;
  return dev ?? '';
}
