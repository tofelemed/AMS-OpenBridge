/**
 * Dual-clock session policy — frontend half (the "no API call" UX).
 *
 * Two clocks, mirroring the server's enforcement on POST /auth/refresh:
 *  - sliding idle  : time since the last *authenticated REST call* (apiFetch).
 *                    Mouse/keyboard and SignalR/MQTT push traffic do NOT count.
 *  - absolute      : time since login. Never extended.
 *
 * The authoritative policy (idleMs/absoluteMs, per role) arrives from the
 * server on login/refresh; the VITE_ env values are only a fallback for the
 * window before the first response. Clocks persist in localStorage so a page
 * reload does not reset them.
 */

export interface SessionPolicy {
  idleMs: number;
  absoluteMs: number;
}

export type SessionEndReason = 'inactivity' | 'expired';

const KEY_LAST_ACTIVITY = 'ams.session.lastApiActivity';
const KEY_STARTED_AT = 'ams.session.startedAt';
const KEY_POLICY = 'ams.session.policy';

const FALLBACK_POLICY: SessionPolicy = {
  idleMs: Number(import.meta.env.VITE_SESSION_IDLE_MS) || 30 * 60 * 1000,
  absoluteMs: Number(import.meta.env.VITE_SESSION_ABSOLUTE_MS) || 12 * 60 * 60 * 1000,
};

function readNumber(key: string): number | null {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getPolicy(): SessionPolicy {
  try {
    const raw = localStorage.getItem(KEY_POLICY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SessionPolicy>;
      if (typeof p.idleMs === 'number' && typeof p.absoluteMs === 'number') {
        return { idleMs: p.idleMs, absoluteMs: p.absoluteMs };
      }
    }
  } catch {
    /* fall through to fallback */
  }
  return FALLBACK_POLICY;
}

/** Login: start both clocks and store the server's policy for this session. */
export function startSessionClocks(policy?: SessionPolicy): void {
  const now = Date.now();
  localStorage.setItem(KEY_STARTED_AT, String(now));
  localStorage.setItem(KEY_LAST_ACTIVITY, String(now));
  if (policy) localStorage.setItem(KEY_POLICY, JSON.stringify(policy));
}

/** Silent-refresh restore: adopt the server policy without touching the clocks. */
export function updatePolicy(policy: SessionPolicy): void {
  localStorage.setItem(KEY_POLICY, JSON.stringify(policy));
}

/** Every authenticated REST call (except login/refresh) marks activity. */
export function markApiActivity(): void {
  localStorage.setItem(KEY_LAST_ACTIVITY, String(Date.now()));
}

export function clearSessionClocks(): void {
  localStorage.removeItem(KEY_STARTED_AT);
  localStorage.removeItem(KEY_LAST_ACTIVITY);
  localStorage.removeItem(KEY_POLICY);
}

/** True when the clocks exist (a session was started on this browser). */
export function hasSessionClocks(): boolean {
  return readNumber(KEY_STARTED_AT) !== null;
}

export function idleExceeded(): boolean {
  const last = readNumber(KEY_LAST_ACTIVITY);
  if (last === null) return false; // no clock → let the server decide on /refresh
  return Date.now() - last > getPolicy().idleMs;
}

export function absoluteExceeded(): boolean {
  const started = readNumber(KEY_STARTED_AT);
  if (started === null) return false;
  return Date.now() - started > getPolicy().absoluteMs;
}

/** Absolute is checked before idle — matches the server's order on /refresh. */
export function expiredReason(): SessionEndReason | null {
  if (absoluteExceeded()) return 'expired';
  if (idleExceeded()) return 'inactivity';
  return null;
}
