/**
 * CHG-139: the evaluated windows Historical lists, with the values each one stored.
 *
 * Full rows (every gate, every metric) live 14 days in Postgres, so they answer the newest part of a range. Older
 * windows come back as summaries from the verdict history; since CHG-139 a summary keeps four metrics
 * (good_error_pct, auto_pct, mae, saturation_pct), so an older window shows its values too. Both read as one
 * `HistoryWindow`, oldest first; a window that exists as a full row is never listed twice.
 */
import { instantMs } from '../evidence/useWindowAt';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWindowSummaries, type CpmGateMatrix, type CpmWindowSummary } from '../../../api/cpm/gates';
import { useGateHistory } from '../../../hooks/useCpm';

/** Most windows asked for in one read. At one result every 15 minutes this is about 5 days. */
export const WINDOW_CAP = 500;
/** Full rows live this long in Postgres; a range reaching further back needs the summaries. */
const FULL_ROW_DAYS = 14;

export interface HistoryWindow {
  windowStart: string | null;
  windowEnd: string;
  diagnosis: string | null;
  confidence: number | null;
  sampleCount: number | null;
  insufficientEvidenceReason: string | null;
  methodRunIds: Record<string, string>;
  gates: CpmWindowSummary['gates'];
  /** Only what the window stored; a missing key is not zero. */
  metrics?: Record<string, number>;
  /** "v7 · profile v3" when the row carries it (full rows only). */
  calculation?: string | null;
}

export function fromFullRow(m: CpmGateMatrix): HistoryWindow | null {
  if (!m.windowEnd) return null;
  const v = m.metadata?.calculationVersion;
  return {
    windowStart: m.windowStart, windowEnd: m.windowEnd, diagnosis: m.diagnosis, confidence: m.confidence,
    sampleCount: m.sampleCount, insufficientEvidenceReason: m.insufficientEvidenceReason,
    methodRunIds: m.methodRunIds ?? {}, metrics: m.metrics,
    gates: m.gates.map(g => ({ key: g.key, status: g.status, reason: g.reason, methodRunId: g.methodRunId ?? null })),
    calculation: v != null ? `v${v} · profile v${m.metadata.dynamicsProfileVersion ?? '—'}` : null,
  };
}

export const fromSummary = (s: CpmWindowSummary): HistoryWindow => ({
  windowStart: s.windowStart, windowEnd: s.windowEnd, diagnosis: s.diagnosis, confidence: s.confidence,
  sampleCount: s.sampleCount, insufficientEvidenceReason: s.insufficientEvidenceReason,
  methodRunIds: s.methodRunIds ?? {}, gates: s.gates, metrics: s.metrics ?? {}, calculation: null,
});

/** Oldest first, full rows winning over a summary of the same window. */
export function mergeWindows(full: CpmGateMatrix[], summaries: CpmWindowSummary[]): HistoryWindow[] {
  // keyed by the instant: "Z" and "+00:00" spell one window
  const key = (end: string) => { const ms = instantMs(end); return Number.isFinite(ms) ? ms : end; };
  const byEnd = new Map<number | string, HistoryWindow>();
  for (const s of summaries) byEnd.set(key(s.windowEnd), fromSummary(s));
  for (const m of full) { const w = fromFullRow(m); if (w) byEnd.set(key(w.windowEnd), w); }
  return [...byEnd.values()].sort((a, b) => (instantMs(a.windowEnd) || 0) - (instantMs(b.windowEnd) || 0));
}

export function useWindowKpis(loopId: string | undefined, kind: string, from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const history = useGateHistory(loopId, kind, fromIso, toIso, 'LIVE', WINDOW_CAP);
  const full = useMemo(() => history.data?.windows ?? [], [history.data]);
  const fullCapped = full.length >= WINDOW_CAP;
  const reachesOlder = from.getTime() < Date.now() - FULL_ROW_DAYS * 86_400_000;
  // The summaries continue where the full rows stop: past the 14 days, or past the cap.
  const oldestFull = full.reduce<string | null>((o, w) => (w.windowEnd && (!o || w.windowEnd < o) ? w.windowEnd : o), null);
  const summaryTo = oldestFull ?? toIso;
  const summaries = useQuery({
    queryKey: ['cpm', 'history-summaries', loopId ?? '', kind, fromIso, summaryTo],
    queryFn: ({ signal }) => getWindowSummaries(loopId!, kind, { from: fromIso, to: summaryTo, limit: WINDOW_CAP, includeInsufficient: false }, signal),
    enabled: !!loopId && history.isSuccess && (fullCapped || reachesOlder),
    staleTime: 60_000,
  });
  const older = useMemo(() => summaries.data?.windows ?? [], [summaries.data]);
  const windows = useMemo(() => mergeWindows(full, older), [full, older]);
  const truncated = summaries.isSuccess ? older.length >= WINDOW_CAP : fullCapped;
  return { windows, full, history, summaries, truncated, fullCapped };
}
