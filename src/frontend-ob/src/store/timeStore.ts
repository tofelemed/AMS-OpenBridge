// Display-level time context (Phase 2 / checklist K). A single source of truth for the time window
// every time-aware symbol on the open display reads from. Expressions are stored (config-only,
// G-CONFIG) and resolved to epoch ms via the standalone parser; live mode re-resolves on a tick.
import { create } from 'zustand';
import { parseTimeExpression, isNowExpression } from '../utils/timeExpression';

const DEFAULT_START = '*-1h';
const DEFAULT_END = '*';

export interface DisplayTimeState {
  /** Stored expressions (what the author/operator typed). */
  startExpr: string;
  endExpr: string;
  /** Resolved window in epoch ms. */
  start: number;
  end: number;
  /** end is now-relative → the window auto-advances. */
  live: boolean;
  /** Validation error for the last setRange, or null. */
  error: string | null;
  /** Saved (display-default) expressions, for "revert". */
  savedStartExpr: string;
  savedEndExpr: string;
  /** Phase 8 (K18/M15) — display timezone: 'local' (client), 'UTC', or an IANA zone. */
  tz: string;

  setTz: (tz: string) => void;
  setRange: (startExpr: string, endExpr: string) => void;
  setDurationMs: (ms: number) => void;
  snapToNow: () => void;
  shift: (dir: -1 | 1) => void;
  revert: () => void;
  markSaved: (startExpr?: string, endExpr?: string) => void;
  /** In live mode, re-resolve so the window tracks "now". Call on an interval. */
  tick: () => void;
  /** Seed from URL params (?start=&end=), falling back to current values. */
  initFromUrl: (params: URLSearchParams) => void;
}

interface Resolved { start: number; end: number; live: boolean; error: string | null; }

/** Resolve a pair of expressions. start anchors to now; end anchors to the resolved start (K13). */
function resolve(startExpr: string, endExpr: string, now = new Date()): Resolved {
  const s = parseTimeExpression(startExpr, { now, anchor: now });
  if (!s.date) return { start: 0, end: 0, live: false, error: s.error ?? 'Invalid start time' };
  const e = parseTimeExpression(endExpr, { now, anchor: s.date });
  if (!e.date) return { start: s.date.getTime(), end: 0, live: false, error: e.error ?? 'Invalid end time' };
  if (e.date.getTime() <= s.date.getTime()) {
    return { start: s.date.getTime(), end: e.date.getTime(), live: false, error: 'End must be after start' };
  }
  return { start: s.date.getTime(), end: e.date.getTime(), live: isNowExpression(endExpr), error: null };
}

const initial = resolve(DEFAULT_START, DEFAULT_END);

export const useDisplayTimeStore = create<DisplayTimeState>((set, get) => ({
  startExpr: DEFAULT_START,
  endExpr: DEFAULT_END,
  start: initial.start,
  end: initial.end,
  live: initial.live,
  error: initial.error,
  savedStartExpr: DEFAULT_START,
  savedEndExpr: DEFAULT_END,
  tz: 'local',

  setTz: (tz) => set({ tz }),

  setRange: (startExpr, endExpr) => {
    const r = resolve(startExpr, endExpr);
    // Keep the expressions even when invalid, so the field shows what the user typed + the error.
    set({ startExpr, endExpr, error: r.error, ...(r.error ? {} : { start: r.start, end: r.end, live: r.live }) });
  },

  setDurationMs: (ms) => {
    // Duration preset → end=now, start=now-<ms>. Store as relative expressions so it stays live.
    const mins = Math.round(ms / 60_000);
    get().setRange(`*-${mins}m`, '*');
  },

  snapToNow: () => {
    const { start, end } = get();
    const span = Math.max(60_000, end - start);
    get().setRange(`*-${Math.round(span / 60_000)}m`, '*');
  },

  shift: (dir) => {
    const { start, end } = get();
    const span = end - start;
    const ns = start + dir * span;
    const ne = end + dir * span;
    // Shifting moves off "now" → absolute (fixed) window.
    set({ startExpr: new Date(ns).toISOString(), endExpr: new Date(ne).toISOString(), start: ns, end: ne, live: false, error: null });
  },

  revert: () => {
    const { savedStartExpr, savedEndExpr } = get();
    get().setRange(savedStartExpr, savedEndExpr);
  },

  markSaved: (startExpr, endExpr) => {
    set(s => ({ savedStartExpr: startExpr ?? s.startExpr, savedEndExpr: endExpr ?? s.endExpr }));
  },

  tick: () => {
    if (!get().live) return;
    const r = resolve(get().startExpr, get().endExpr);
    if (!r.error) set({ start: r.start, end: r.end });
  },

  initFromUrl: (params) => {
    const s = params.get('start');
    const e = params.get('end');
    if (s || e) get().setRange(s ?? get().startExpr, e ?? get().endExpr);
    const tz = params.get('tz');
    if (tz) set({ tz });
  },
}));

/** Format an epoch-ms in the display timezone ('local' = client zone; else an IANA zone / 'UTC'). */
export function formatInZone(ms: number, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  const base: Intl.DateTimeFormatOptions = opts ?? {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(undefined, tz && tz !== 'local' ? { ...base, timeZone: tz } : base).format(ms);
  } catch {
    return new Intl.DateTimeFormat(undefined, base).format(ms);
  }
}
