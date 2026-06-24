/** Bearer token for API/SignalR (Keycloak or dev test auth). */
export function getAuthToken(): string {
  const kcToken = (window as unknown as { kc?: { token?: string } }).kc?.token;
  if (kcToken) return kcToken;
  const dev = (window as unknown as { amsDevToken?: string }).amsDevToken;
  return dev ?? 'dev';
}
