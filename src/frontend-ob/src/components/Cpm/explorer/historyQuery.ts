/**
 * Explorer › History: what is read and how it is grouped.
 *
 * sort:'recent' is load-bearing, not a preference: the endpoint's default order
 * is triage (open first, then peak confidence), so under the default this LIMIT
 * kept the highest-CONFIDENCE frames while the tab rendered them as a timeline.
 *
 * Consecutive frames with the same diagnosis collapse into one run (a loop re-detecting the same fault every 15 minutes
 * otherwise lists one fact ten times). A frame whose closed_at precedes its opened_at is flagged, never printed as a
 * backwards range: that is an upstream defect in the event frames, and this screen must not repeat it as fact.
 */
import type { CpmEventFrame } from '../../../api/cpmApi';
import { fmtWhen } from '../blocks/whenText';

export const HISTORY_QUERY = {
  openOnly: false, includeShelved: true, limit: 50, sort: 'recent' as const,
};

export interface Span { startMs: number; endMs: number | null; invalid: boolean }

export function spanOf(e: CpmEventFrame): Span {
  const startMs = Date.parse(e.opened_at);
  const raw = e.closed_at ? Date.parse(e.closed_at) : null;
  const closed = raw != null && !Number.isNaN(raw) ? raw : null;
  const invalid = closed != null && !Number.isNaN(startMs) && closed < startMs;
  return { startMs, endMs: invalid ? null : closed, invalid };
}

export interface Run {
  key: string;
  diagnosis: string;
  /** Newest first: the first is the episode the run's review state and its Loop Events link belong to. */
  frames: CpmEventFrame[];
  startMs: number;
  endMs: number | null;
  peak: number;
  windows: number;
  /** Distinct evaluation window sizes across the collapsed frames (12h/24h). */
  kinds: Set<string>;
  anyOpen: boolean;
  anyInvalid: boolean;
}

/** Collapse CONSECUTIVE frames carrying the same diagnosis into one run. */
export function toRuns(rows: CpmEventFrame[]): Run[] {
  const runs: Run[] = [];
  for (const e of rows) {
    const span = spanOf(e);
    const head = runs[runs.length - 1];
    if (head && head.diagnosis === e.peak_diagnosis) {
      head.frames.push(e);
      head.startMs = Math.min(head.startMs, span.startMs);
      head.endMs = span.endMs == null || head.endMs == null ? null : Math.max(head.endMs, span.endMs);
      head.peak = Math.max(head.peak, e.peak_confidence);
      head.windows += e.window_count;
      head.kinds.add(e.window_kind);
      head.anyOpen = head.anyOpen || !e.closed_at;
      head.anyInvalid = head.anyInvalid || span.invalid;
      continue;
    }
    runs.push({
      key: String(e.id), diagnosis: e.peak_diagnosis, frames: [e], startMs: span.startMs, endMs: span.endMs,
      peak: e.peak_confidence, windows: e.window_count, kinds: new Set([e.window_kind]), anyOpen: !e.closed_at, anyInvalid: span.invalid,
    });
  }
  return runs;
}

/** "5 Oct · 07:45 · open" or "1 Sept · 00:15 → 5 Oct · 07:30" (the date and time format stays as it was, owner Q5). */
export const runPeriod = (run: Run): string =>
  run.anyOpen || run.endMs == null ? `${fmtWhen(run.startMs)} · open` : `${fmtWhen(run.startMs)} → ${fmtWhen(run.endMs)}`;

/** One episode's period; an impossible span says so instead of printing a backwards range. */
export function episodePeriod(e: CpmEventFrame): string {
  const span = spanOf(e);
  const end = span.invalid ? ' · end before start' : span.endMs != null ? ` → ${fmtWhen(span.endMs)}` : ' · open';
  return `${fmtWhen(e.opened_at)}${end}`;
}

/**
 * CHG-185 (owner review item 6): the window count with its size, without "window(s)". The count alone was ambiguous: "3 windows"
 * is 36 h of evidence at 12h and 72 h at 24h. "1 × 24h window", "4 × 12h windows", "136 windows of 12h and 24h".
 */
export function windowsText(count: number, kinds: Iterable<string>): string {
  const sizes = [...new Set(kinds)].filter(Boolean).sort();
  const noun = count === 1 ? 'window' : 'windows';
  if (sizes.length === 1) return `${count} × ${sizes[0]} ${noun}`;
  if (sizes.length === 0) return `${count} ${noun}`;
  return `${count} ${noun} of ${sizes.slice(0, -1).join(', ')} and ${sizes[sizes.length - 1]}`;
}

/**
 * An episode line shows its windows only where they differ: when every episode of the run has the same count and size, the run's
 * own "N × 24h windows" already says each one's.
 */
export const episodeWindowsDiffer = (run: Run): boolean =>
  run.kinds.size > 1 || new Set(run.frames.map(f => f.window_count)).size > 1;
