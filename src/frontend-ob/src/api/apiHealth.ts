/**
 * App-wide API reachability, derived from what requests actually did.
 *
 * Why this exists: when the gateway is down every query on a page fails
 * independently, so the operator gets five to eight identical error cards
 * saying the same thing, and nothing says "the API is unreachable" rather than
 * "these five panels each have a problem". One strip states it once; the panels
 * keep their own scoped messages, because knowing WHICH read failed is the
 * thing this product must never hide.
 *
 * Classification matters. `apiJson` throws a typed `ApiError` for any non-2xx,
 * but a `fetch()` that never reached the gateway rejects with a plain
 * `TypeError` — that, not a 500, is the unreachable signal. A 401/403/404 is a
 * perfectly reachable API answering correctly and must never raise the banner.
 */
import { ApiError } from './apiFetch';

export type ApiHealthKind = 'ok' | 'offline' | 'unreachable' | 'degraded';

export interface ApiHealthState {
  kind: ApiHealthKind;
  /** When the current non-ok condition was first observed. */
  since: number | null;
  /** Last classified failure message, for the strip's detail line. */
  lastError: string | null;
}

const OK: ApiHealthState = { kind: 'ok', since: null, lastError: null };

let state: ApiHealthState = OK;
const listeners = new Set<() => void>();

function emit(next: ApiHealthState) {
  if (next.kind === state.kind && next.lastError === state.lastError) return;
  state = next;
  listeners.forEach(l => l());
}

export function subscribeApiHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getApiHealth = (): ApiHealthState => state;

/** Any successful response proves reachability — clear everything. */
export function reportApiSuccess(): void {
  if (state.kind !== 'ok') emit(OK);
}

/**
 * Classify a query/mutation failure.
 *
 * - Not an ApiError → the request never got an HTTP response: unreachable.
 * - ApiError >= 500 → reached the gateway, an upstream is broken: degraded.
 * - Anything else (401/403/404/4xx) → a correct answer; not a health signal.
 */
export function reportApiError(error: unknown): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit({ kind: 'offline', since: state.since ?? Date.now(), lastError: null });
    return;
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      emit({
        kind: 'degraded',
        since: state.kind === 'degraded' ? state.since : Date.now(),
        lastError: error.message,
      });
    }
    return; // 4xx is the API working, not failing.
  }
  emit({
    kind: 'unreachable',
    since: state.kind === 'unreachable' ? state.since : Date.now(),
    lastError: error instanceof Error ? error.message : String(error),
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => emit({
    kind: 'offline', since: Date.now(), lastError: null,
  }));
  // Coming back online does not prove the API is up — let the next successful
  // request clear it, so the strip never claims recovery it has not seen.
  window.addEventListener('online', () => {
    if (state.kind === 'offline') {
      emit({ kind: 'unreachable', since: Date.now(), lastError: null });
    }
  });
}
