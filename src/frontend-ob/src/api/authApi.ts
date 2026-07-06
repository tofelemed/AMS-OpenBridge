import axios from 'axios';

/** Authenticated user as returned by the auth service. */
export interface AuthUser {
  user_id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
  permissions: string[];
}

const AUTH_BASE = '/api/auth';

// withCredentials so the refresh-token httpOnly cookie is sent/received.
const client = axios.create({ withCredentials: true });

/** POST /api/auth/login → access token (body) + refresh cookie (Set-Cookie). */
export async function loginRequest(
  username: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await client.post(`${AUTH_BASE}/login`, { username, password });
  return { token: res.data.token, user: res.data.user };
}

/** POST /api/auth/refresh → new access token using the refresh cookie. */
export async function refreshRequest(): Promise<{ token: string }> {
  const res = await client.post(`${AUTH_BASE}/refresh`, {});
  return { token: res.data.token };
}

/** POST /api/auth/logout → clears the server record + refresh cookie. */
export async function logoutRequest(): Promise<void> {
  await client.post(`${AUTH_BASE}/logout`, {});
}

/** GET /api/auth/me → current user + permissions. */
export async function meRequest(token: string): Promise<AuthUser> {
  const res = await client.get(`${AUTH_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.data;
}

/** Extract a human-readable error message from an axios error. */
export function extractAuthError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const serverMsg = (error.response?.data as { error?: string } | undefined)?.error;
    if (serverMsg === 'ACCOUNT_DEACTIVATED') return 'This account has been deactivated.';
    if (serverMsg) return serverMsg;
    if (error.response?.status === 401) return 'Invalid username or password.';
    return 'Unable to reach the authentication service.';
  }
  return 'An unexpected error occurred.';
}
