/**
 * One table row from two served sources. The priority queue gives order, priority, episode age and
 * acknowledgement. The KPI rows give coverage, the deciding value and the window inputs. Each field
 * keeps its own source, and a field neither gives stays null. Nothing here judges a loop.
 */
import type { FleetKpiRow } from '../../../api/cpm/fleetKpis';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { decidingText } from '../../../components/Cpm/kpi/kpiProof';
import { diagnosisLabel, locationPath } from '../../../components/Cpm/vocabulary';
import { diagnosisTone, episodeTone, type BadgeTone } from '../../../ui/statusTones';
import type { SortState } from '../../../ui/DataTable';
import { ageWords, plural } from './overviewFormat';

export interface Condition { label: string; tone: BadgeTone }

export interface ReviewRow {
  loopId: string;
  name: string | null;
  asset: string;
  criticality: string | null;
  condition: Condition;
  /** A 0..1 fraction despite the name (CpmRankedLoop.metrics). */
  goodError: number | null;
  priority: string | null;
  episodeOpenedAt: string | null;
  episodeWindows: number | null;
  coverage: number | null;
  windowEnd: string | null;
  windowKind: string;
  ack: string | null;
  deciding: string | null;
  reason: string | null;
  kpi: FleetKpiRow | null;
  rank: CpmRankedLoop | null;
}

const NO_FAULT = new Set(['NO_CALL', 'INSUFFICIENT_EVIDENCE']);

/** Unassessed stays distinct from a verdict (p.13 R5). A confirmed finding is `warning`, per CD8. */
export function conditionFor(diagnosis: string | null | undefined, state?: FleetKpiRow['state']): Condition {
  if (state === 'NeverEvaluated') return { label: 'Never evaluated', tone: 'unknown' };
  if (state === 'Stale') return { label: 'Stale', tone: 'warning' };
  if (state === 'NotAssessable') return { label: 'Not assessable', tone: 'unknown' };
  if (NO_FAULT.has((diagnosis ?? '').toUpperCase())) return { label: 'No fault identified', tone: 'neutral' };
  return { label: diagnosisLabel(diagnosis), tone: diagnosisTone(diagnosis).tone };
}

export function fromRanked(r: CpmRankedLoop, fleet: FleetKpiRow | null, kind: string): ReviewRow {
  return {
    loopId: r.loopId,
    name: r.displayName || null,
    asset: locationPath(r),
    criticality: r.criticality || null,
    condition: conditionFor(r.diagnosis),
    goodError: r.metrics.goodErrorPct ?? fleet?.inputs.goodErrorPct ?? null,
    priority: r.priority ?? null,
    episodeOpenedAt: r.episodeOpenedAt ?? null,
    episodeWindows: r.episodeWindowCount ?? null,
    coverage: fleet?.inputs.completeness ?? null,
    windowEnd: r.windowEnd,
    windowKind: kind,
    ack: r.ackState ?? null,
    deciding: null,
    reason: null,
    kpi: fleet,
    rank: r,
  };
}

export function fromKpi(k: FleetKpiRow, rank: CpmRankedLoop | null): ReviewRow {
  return {
    loopId: k.loopId,
    name: k.displayName || null,
    asset: locationPath(k),
    criticality: k.criticality || null,
    condition: conditionFor(k.diagnosis, k.state),
    goodError: k.inputs.goodErrorPct ?? null,
    priority: rank?.priority ?? null,
    episodeOpenedAt: rank?.episodeOpenedAt ?? null,
    episodeWindows: rank?.episodeWindowCount ?? null,
    coverage: k.inputs.completeness ?? null,
    windowEnd: k.windowEnd ?? null,
    windowKind: k.windowKind,
    ack: rank?.ackState ?? null,
    deciding: decidingText(k),
    reason: k.reason ?? null,
    kpi: k,
    rank,
  };
}

const LEVEL: Record<string, number> = { HIGH: 1, MEDIUM: 2, LOW: 3 };

export const priorityWord = (p: string | null): string | null =>
  (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : null);

const ACK: Record<string, string> = { UNACKNOWLEDGED: 'Unacknowledged', ACKNOWLEDGED: 'Acknowledged', SHELVED: 'Shelved' };

export function ackBadge(ack: string | null): Condition | null {
  return ack ? { label: ACK[ack] ?? ack, tone: episodeTone(ack).tone } : null;
}

/** "3 days · 12 windows": how long the open episode has stood. */
export function persistenceText(r: Pick<ReviewRow, 'episodeOpenedAt' | 'episodeWindows'>, now: number): string | null {
  const since = r.episodeOpenedAt ? Date.parse(r.episodeOpenedAt) : NaN;
  if (!Number.isFinite(since)) return null;
  const windows = r.episodeWindows ? ` · ${plural(r.episodeWindows, 'window')}` : '';
  return `${ageWords(now - since)}${windows}`;
}

export function searchRows(rows: ReviewRow[], query: string): ReviewRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.loopId.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q));
}

const SORT_VALUE: Record<string, (r: ReviewRow) => string | number | null> = {
  loop: r => r.loopId,
  asset: r => r.asset || null,
  condition: r => r.condition.label,
  metric: r => r.goodError,
  priority: r => (r.priority ? LEVEL[r.priority] ?? null : null),
  persistence: r => (r.episodeOpenedAt ? -Date.parse(r.episodeOpenedAt) : null),
  coverage: r => r.coverage,
  evaluated: r => (r.windowEnd ? Date.parse(r.windowEnd) : null),
};

export const SORT_NAME: Record<string, string> = {
  loop: 'Loop', asset: 'Parent asset', condition: 'Condition', metric: 'Review metric', priority: 'Priority',
  persistence: 'Persistence', coverage: 'Coverage', evaluated: 'Last evaluation',
};

/** Missing values sort last in either direction, so a dash never reads as the best or the worst. */
export function sortRows(rows: ReviewRow[], sort: SortState): ReviewRow[] {
  if (!sort) return rows;
  const value = SORT_VALUE[sort.key];
  if (!value) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return x === y ? 0 : x == null ? 1 : -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

/** Ascending, then descending, then back to the server's own order. */
export function nextSort(current: SortState, key: string): SortState {
  if (current?.key !== key) return { key, dir: 'asc' };
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}
