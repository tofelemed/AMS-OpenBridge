/**
 * Where the Evidence Workbench's two outward links go for the run on screen. The run names its own window, so the
 * link never depends on that window being among the loaded ones (a 3-day-old run is not), and never turns a 15m or
 * 4h run into a 12h one: Investigation and Replay hold 12h and 24h only, so a run of any other kind goes back to the
 * Window Inspector, which lists every kind, and has no Replay.
 */
import { investigationHref, replayHref, responseHref, windowsHref } from '../cpaHref';
import { WINDOW_KINDS } from '../useWindowKind';

export const REPLAY_UNAVAILABLE = 'Replay holds 12 h and 24 h windows';

export const isFusedKind = (kind: string | null | undefined): boolean =>
  !!kind && (WINDOW_KINDS as readonly string[]).includes(kind);

const isoOf = (ms: number | null | undefined): string | null =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;

export interface RunRef {
  loopId: string;
  gate: string;
  /** The run's own window kind, when the run has loaded; else the kind the page is on. */
  kind: string;
  /** The run's own support end (ms), when the run has loaded. */
  toMs?: number | null;
  /** The run's id: a response (event) run is found by it on System Response. */
  methodRunId?: string | null;
  /** The end of the run's window as listed, when it is among the loaded windows. */
  listedEnd?: string | null;
}

export interface BackLink { label: string; href: string }

export function backLink(r: RunRef): BackLink {
  const end = r.listedEnd || isoOf(r.toMs);
  // a response run (G12) has the kind "event": System Response resolves it from the run
  if (r.kind === 'event' && r.methodRunId) return { label: 'Back to System Response ↗', href: responseHref(r.loopId, { methodRun: r.methodRunId }) };
  if (isFusedKind(r.kind)) {
    return { label: 'Back to Investigation ↗', href: investigationHref(r.loopId, { kind: r.kind, window: end, gate: r.gate }) };
  }
  return { label: 'Back to Window Inspector ↗', href: windowsHref(r.loopId, { profile: r.kind, window: end }) };
}

/** The Replay link, or null with the reason it is not offered. */
export function replayLink(r: RunRef): { href: string } | { href: null; reason: string } {
  if (!isFusedKind(r.kind)) return { href: null, reason: REPLAY_UNAVAILABLE };
  return { href: replayHref(r.loopId, { gate: r.gate, window: isoOf(r.toMs) ?? r.listedEnd, kind: r.kind }) };
}
