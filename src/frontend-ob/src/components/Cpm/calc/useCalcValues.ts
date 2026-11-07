/**
 * Task 20: every value on the Calculations page belongs to ONE window, the same one the verdict judges (CHG-092): the
 * newest fused window, or the exact window `?window=` names (read by its end, an original before a re-run). The fused
 * window's long row also carries the short-tier metrics computed over that window (vw_*).
 */
import { useCallback } from 'react';
import { ApiError } from '../../../api/apiFetch';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { useCpmCalculations, useCpmKpis, useCpmKpisRange, useCpmLoops, useLatestGates } from '../../../hooks/useCpm';
import type { MetricDef } from '../calcCatalogue';
import { useWindowAt } from '../evidence/useWindowAt';
import { contextOfMatrix, contextOfRow, metricAvailability, type MetricAvailability } from '../metricAvailability';
import { statusOf, type MetricView } from './calcView';

/** gates/latest 404 = "no fused window yet": an answer, not a failure. */
const isNoVerdict = (e: unknown) => e instanceof ApiError && e.status === 404;

export function useCalcValues(loopId: string | undefined, kind: string, windowEnd: string | null) {
  const named = !!windowEnd && !!loopId;
  const loops = useCpmLoops();
  const loop = loopId ? (loops.data?.loops ?? []).find(l => l.loopId.toLowerCase() === loopId.toLowerCase()) : undefined;

  const latestGates = useLatestGates(loop?.loopId, kind, !named);
  const at = useWindowAt(named ? loop?.loopId : undefined, kind, named ? windowEnd : null);
  const matrix: CpmGateMatrix | undefined = named ? at.row : latestGates.data;

  const latestKpis = useCpmKpis(named ? undefined : loop?.loopId, kind, 1);
  const rangeKpis = useCpmKpisRange(loop?.loopId, kind, matrix?.windowStart ?? undefined, matrix?.windowEnd ?? undefined, 10,
    named && !!matrix?.windowStart);
  const row: CpmKpiRow | undefined = named
    ? rangeKpis.data?.samples.find(r => r.window_end === matrix?.windowEnd)
    : latestKpis.data?.samples[0];
  const kpis = named ? rangeKpis : latestKpis;

  const catalogue = useCpmCalculations();

  const valueOf = useCallback((m: MetricDef): number | null => {
    if (m.source === 'gate') return matrix?.confidence ?? null;
    const v = row?.[m.source === 'short' ? `vw_${m.field}` : m.field];
    return typeof v === 'number' ? v : null;
  }, [matrix, row]);

  const availabilityOf = useCallback((m: MetricDef): MetricAvailability | null => {
    const ctx = m.source === 'gate' ? (matrix ? contextOfMatrix(matrix) : null) : row ? contextOfRow(row, 'long') : null;
    return ctx ? metricAvailability(ctx, m.field, valueOf(m)) : null;
  }, [matrix, row, valueOf]);

  const notCalculatedWhy = useCallback((m: MetricDef): string => {
    if (m.source === 'gate') return matrix ? 'the fused result carries no evidence score' : 'no result yet';
    if (kpis.isError) return 'the result could not be read';
    if (!row) return 'no window result yet';
    return 'engine version without this metric';
  }, [matrix, row, kpis.isError]);

  const viewOf = useCallback((m: MetricDef): MetricView => {
    const value = valueOf(m);
    const a = availabilityOf(m);
    let na: MetricView['na'] = null;
    if (value == null) {
      const specific = a && a.state !== 'measured' && a.reason && a.reason !== 'not in this result' ? a.reason : null;
      na = { short: 'Not calculated', reason: specific ?? notCalculatedWhy(m) };
    } else if (a && a.state !== 'measured') {
      // a zeroed placeholder from a declined window or a method that did not qualify: never a measurement
      na = { short: a.short, reason: a.reason ?? '' };
    }
    const cell = matrix?.gates.find(g => g.key === m.gate);
    return { metric: m, value: na ? null : value, na, status: statusOf(cell, matrix?.diagnosis) };
  }, [valueOf, availabilityOf, notCalculatedWhy, matrix]);

  const runIdOf = useCallback((gate: string): string | undefined =>
    matrix?.gates.find(g => g.key === gate)?.methodRunId ?? matrix?.methodRunIds?.[gate], [matrix]);

  const rowVersion = typeof row?.calculation_version === 'string' ? row.calculation_version : null;
  return {
    loop, matrix, row, named, viewOf, runIdOf,
    notStored: named && at.notFound,
    loading: !!loopId && (named ? at.isLoading : latestGates.isLoading),
    windowError: named && at.isError ? at.error : null,
    retryWindow: at.refetch,
    verdictFailed: !named && latestGates.isError && !isNoVerdict(latestGates.error),
    kpiError: kpis.isError ? kpis.error : null,
    retryKpis: () => void kpis.refetch(),
    stamped: rowVersion ?? matrix?.metadata.calculationVersion ?? null,
    deployed: catalogue.data?.calculationVersion ?? null,
  };
}
