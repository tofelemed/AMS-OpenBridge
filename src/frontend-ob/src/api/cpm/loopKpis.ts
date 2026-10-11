/**
 * KPI Phase 4: one loop's KPIs (cplm-api `GET /loops/{id}/kpi-summary`) — the newest LIVE window and the one 24 h earlier, with the
 * stored metrics and the engine's gate verdicts that judge them. Logic: kpi_calculation_logic/KPI-LOGIC.md section 3.3.
 */
import { apiJson } from '../apiFetch';
import { CPM_BASE } from './base';

export type LoopKpiMetric =
  | 'auto_pct' | 'manual_pct' | 'good_error_pct' | 'mae' | 'rmse' | 'pv_std' | 'op_std' | 'saturation_pct' | 'travel_per_day'
  | 'reversals_per_hour' | 'sp_changes_per_h' | 'completeness' | 'sample_count' | 'expected_sample_count' | 'effort_ratio';

export interface LoopKpiWindow {
  windowEnd: string | null;
  diagnosis: string | null;
  /** null = not stored for this window (not measured) — never shown as 0. */
  values: Partial<Record<LoopKpiMetric, number | null>>;
  gates: Partial<Record<'G0' | 'G1' | 'G3' | 'G4' | 'G10', string | null>>;
  limitSource?: string | null;
}

export interface LoopKpis {
  loopId: string;
  windowKind: string;
  computedAt: string;
  span: { pvMin?: number | null; pvMax?: number | null; opMin?: number | null; opMax?: number | null; pvUnit?: string | null } | null;
  current: LoopKpiWindow | null;
  previous: LoopKpiWindow | null;
  reference: string;
}

export const getLoopKpis = (loopId: string, windowKind = '12h', signal?: AbortSignal) =>
  apiJson<LoopKpis>(`${CPM_BASE}/loops/${encodeURIComponent(loopId)}/kpi-summary?windowKind=${encodeURIComponent(windowKind)}`, { signal });
