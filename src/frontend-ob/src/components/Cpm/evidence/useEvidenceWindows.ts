/**
 * v2.5 workbench: the evaluated windows of one loop as picker options - fused rows (12h / 24h,
 * `projection=summary`) and short / long feature rows (KPI rows carrying their run ids) in ONE
 * shape, newest first, paged backwards ("Load older"), each labelled with its state and its age.
 * The landing opens the newest window that carries run ids; rows written before v2.5 are listed
 * but cannot be opened (no run identity).
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import * as cpm from '../../../api/cpmApi';
import { getWindowSummaries, type CpmWindowSummary } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpm/kpis';
import { fmtDuration, type CpmTone } from '../shared';
import { gateMark, reviewSeverity } from '../gateStatus';
import { formatInZone } from './timezone';
import { GATE_ORDER } from './gateFacts';
import { codeLabel, diagnosisLabel, phrase } from '../vocabulary';

export type WindowTier = 'fused' | 'short' | 'long';

export interface WindowGateCell { key: string; status: string | null; reason: string | null }

export interface WindowOption {
  windowEnd: string;
  windowStart: string | null;
  kind: string;
  tier: WindowTier;
  label: string;
  tone: CpmTone;
  ageMs: number;
  sampleCount: number | null;
  methodRunIds: Record<string, string>;
  hasRunIds: boolean;
  gates: WindowGateCell[];
  flags: { observabilityFlags: string[]; familyDisqualifiers: string[]; insufficientEvidenceReason: string | null } | undefined;
  methodEligibility: CpmWindowSummary['methodEligibility'];
  purpose: string | null;
}

const age = (endIso: string, now: number) => Math.max(0, now - Date.parse(endIso));
const ageText = (ms: number) => ms >= 36 * 3_600_000 ? `${(ms / 86_400_000).toFixed(1)} d ago` : `${fmtDuration(ms)} ago`;
const NO_IDS = ' · no run identity (pre-v2.5)';

export function fusedOptions(rows: CpmWindowSummary[], now: number, timeZone: string): WindowOption[] {
  return rows.map(r => {
    const ids = r.methodRunIds ?? {};
    const hasRunIds = Object.keys(ids).length > 0;
    const insufficient = !r.diagnosis || r.diagnosis === 'INSUFFICIENT_DATA';
    const state = insufficient
      ? `INSUFFICIENT DATA${r.insufficientEvidenceReason ? ` (${r.insufficientEvidenceReason})` : ''}`
      : `${diagnosisLabel(r.diagnosis)}${r.confidence != null ? ` ${Math.round(r.confidence * 100)}%` : ''}`;
    const ms = age(r.windowEnd, now);
    const tone: CpmTone = insufficient ? 'muted' : r.diagnosis === 'NOT_EVALUATED' ? 'muted' : /SUSPECTED|CONFIRMED|FAIL/.test(r.diagnosis!) ? 'bad' : /DEVELOPING|WARN/.test(r.diagnosis!) ? 'warn' : 'good';
    return {
      windowEnd: r.windowEnd, windowStart: r.windowStart, kind: r.windowKind, tier: 'fused',
      label: `ends ${formatInZone(Date.parse(r.windowEnd), timeZone)} · ${state} · ${ageText(ms)}${hasRunIds ? '' : NO_IDS}`,
      tone, ageMs: ms, sampleCount: r.sampleCount, methodRunIds: ids, hasRunIds,
      gates: (r.gates ?? []).map(g => ({ key: g.key, status: g.status, reason: g.reason })),
      flags: { observabilityFlags: r.observabilityFlags ?? [], familyDisqualifiers: r.familyDisqualifiers ?? [], insufficientEvidenceReason: r.insufficientEvidenceReason ?? null },
      methodEligibility: r.methodEligibility ?? null, purpose: null,
    };
  });
}

const parseIds = (raw: unknown): Record<string, string> => {
  if (typeof raw !== 'string' || !raw) return {};
  try { const v = JSON.parse(raw) as Record<string, string>; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

export function kpiOptions(rows: CpmKpiRow[], kind: string, tier: 'short' | 'long', now: number, timeZone: string): WindowOption[] {
  return rows.filter(r => r.window_end).map(r => {
    const ids = parseIds(r.method_run_ids);
    const hasRunIds = Object.keys(ids).length > 0;
    const gates: WindowGateCell[] = GATE_ORDER
      .map(g => ({ key: g, status: (r[`gate${g.replace(/^G/, '').toLowerCase()}_status`] as string | null | undefined) ?? null, reason: (r[`gate${g.replace(/^G/, '').toLowerCase()}_reason`] as string | null | undefined) ?? null }))
      .filter(g => g.status != null);
    const evalState = typeof r.evaluation_state === 'string' ? r.evaluation_state : null;
    const evalReason = typeof r.evaluation_reason === 'string' ? r.evaluation_reason : null;
    let state: string;
    let tone: CpmTone;
    if (evalState && evalState !== 'EVALUATED') {
      state = `${codeLabel(evalState)}${evalReason ? ` (${phrase(evalReason)})` : ''}`;
      tone = 'muted';
    } else {
      const notPass = gates.filter(g => reviewSeverity(g.status) != null);
      state = notPass.length ? notPass.map(g => `${g.key} ${gateMark(g.status, g.key).word.toLowerCase()}${g.reason ? ` (${phrase(g.reason)})` : ''}`).join(', ') : gates.length ? 'all gates pass' : 'no gate statuses';
      tone = notPass.some(g => reviewSeverity(g.status) === 'bad') ? 'bad' : notPass.length ? 'warn' : gates.length ? 'good' : 'muted';
    }
    const ms = age(r.window_end as string, now);
    return {
      windowEnd: r.window_end as string, windowStart: (r.window_start as string | null) ?? null, kind, tier,
      label: `ends ${formatInZone(Date.parse(r.window_end as string), timeZone)} · ${state} · ${ageText(ms)}${hasRunIds ? '' : NO_IDS}`,
      tone, ageMs: ms, sampleCount: typeof r.sample_count === 'number' ? r.sample_count : null, methodRunIds: ids, hasRunIds,
      gates, flags: undefined, methodEligibility: null, purpose: typeof r.purpose === 'string' ? r.purpose : null,
    };
  });
}

export function findOptionOfRun(options: WindowOption[], methodRunId: string | undefined): number {
  if (!methodRunId) return -1;
  return options.findIndex(o => Object.values(o.methodRunIds).includes(methodRunId));
}

export function neighbours(options: WindowOption[], index: number): { newer: WindowOption | null; older: WindowOption | null } {
  if (index < 0 || index >= options.length) return { newer: null, older: null };
  return { newer: index > 0 ? options[index - 1] : null, older: index < options.length - 1 ? options[index + 1] : null };
}

/** The newest option with run ids; the wanted gate when it has a run there, else G15, else the first gate with a run. */
export function resolveLanding(options: WindowOption[], wantedGate: string | null): { methodRunId: string; gate: string } | null {
  const o = options.find(x => x.hasRunIds);
  if (!o) return null;
  const gate = wantedGate && o.methodRunIds[wantedGate] ? wantedGate : o.methodRunIds.G15 ? 'G15' : GATE_ORDER.find(g => o.methodRunIds[g]);
  return gate ? { methodRunId: o.methodRunIds[gate], gate } : null;
}

/** The run of `gate` in a window, else the window's G15, else its first run. */
export function runInWindow(o: WindowOption, gate: string): { methodRunId: string; gate: string } | null {
  if (o.methodRunIds[gate]) return { methodRunId: o.methodRunIds[gate], gate };
  if (o.methodRunIds.G15) return { methodRunId: o.methodRunIds.G15, gate: 'G15' };
  const g = GATE_ORDER.find(k => o.methodRunIds[k]);
  return g ? { methodRunId: o.methodRunIds[g], gate: g } : null;
}

const PAGE = 100;

export interface EvidenceWindows {
  options: WindowOption[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
}

/** One hook for both sources; `tier` decides the endpoint, `startBefore` (ISO) starts the list at a date ("Jump to date"). */
export function useEvidenceWindows(loopId: string | undefined, kind: string, tier: WindowTier, timeZone: string, startBefore?: string): EvidenceWindows {
  const fused = useInfiniteQuery({
    queryKey: ['cpm', 'window-summaries', loopId ?? '', kind, startBefore ?? ''],
    queryFn: ({ pageParam, signal }) => getWindowSummaries(loopId!, kind, { to: pageParam as string | undefined, limit: PAGE }, signal),
    initialPageParam: startBefore,
    getNextPageParam: last => last.windows.length >= PAGE ? last.windows[last.windows.length - 1].windowEnd : undefined,
    enabled: !!loopId && tier === 'fused',
    staleTime: 5 * 60_000,
  });
  const kpi = useInfiniteQuery({
    queryKey: ['cpm', 'window-kpis', loopId ?? '', kind, startBefore ?? ''],
    queryFn: ({ pageParam, signal }) => cpm.getKpis(loopId!, kind, undefined, undefined, 48, signal, (pageParam as string | undefined) || undefined),
    initialPageParam: startBefore ?? '',
    getNextPageParam: last => last.nextBefore ?? undefined,
    enabled: !!loopId && tier !== 'fused',
    staleTime: 5 * 60_000,
  });
  const q = tier === 'fused' ? fused : kpi;
  const now = Date.now();
  const options = tier === 'fused'
    ? fusedOptions(fused.data?.pages.flatMap(p => p.windows) ?? [], now, timeZone)
    : kpiOptions(kpi.data?.pages.flatMap(p => p.samples) ?? [], kind, tier, now, timeZone);
  return {
    options, isLoading: q.isLoading, error: q.error, refetch: () => { void q.refetch(); },
    hasMore: !!q.hasNextPage, loadMore: () => { void q.fetchNextPage(); }, isLoadingMore: q.isFetchingNextPage,
  };
}
