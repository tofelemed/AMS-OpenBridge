/**
 * CHG-085 (KPI redesign): per-KPI presentation facts — its OpenBridge icon, which direction is better, the formula in one
 * line, and the threshold in words. Pure (tested); the numbers come from cplm-api `GET /fleet/kpis`.
 * Formulas mirror kpi_calculation_logic/KPI-LOGIC.md section 3.2.
 */
import type React from 'react';
import { ObiSpeedGood } from '@oicl/openbridge-webcomponents-react/icons/icon-speed-good';
import { ObiAuto } from '@oicl/openbridge-webcomponents-react/icons/icon-auto';
import { ObiWave } from '@oicl/openbridge-webcomponents-react/icons/icon-wave';
import { ObiBoltGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-bolt-google';
import { ObiLimitsOutsideOver } from '@oicl/openbridge-webcomponents-react/icons/icon-limits-outside-over';
import { ObiAlarmSignalFail } from '@oicl/openbridge-webcomponents-react/icons/icon-alarm-signal-fail';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiPending } from '@oicl/openbridge-webcomponents-react/icons/icon-pending';
import { ValveIcon } from './kpiIcons';
import type { FleetKpiBasis, FleetKpiFigure, FleetKpiKey, FleetKpis } from '../../../api/cpm/fleetKpis';

export interface KpiMeta {
  Icon: React.ComponentType;
  /** True when a rising share is good news (acceptable, in normal mode); false for every problem KPI. */
  higherIsBetter: boolean;
  formula: string;
  threshold: (b: FleetKpiBasis) => string;
}

const pc = (v: number) => `${Math.round(v * 100)} %`;
const fresh = (b: FleetKpiBasis) => `newest ${b.windowKind} result ≤ ${Math.round(b.freshSeconds / 60)} min old`;

export const KPI_META: Partial<Record<FleetKpiKey, KpiMeta>> = {
  acceptable: { Icon: ObiSpeedGood, higherIsBetter: true,
    formula: 'count(no fault found ∧ AUTO ≥ normal-mode limit ∧ time at OP limit ≤ saturation limit) ÷ monitored loops',
    threshold: b => `No fault · AUTO ≥ ${pc(b.normalModeMin)} · at limit ≤ ${pc(b.saturationMax)}` },
  'normal-mode': { Icon: ObiAuto, higherIsBetter: true,
    formula: 'count(AUTO % ≥ limit) ÷ loops with a measured mode;  AUTO % = time in AUTO or CASCADE ÷ window time',
    threshold: b => `AUTO / CASCADE ≥ ${pc(b.normalModeMin)} of the window` },
  'out-of-mode': { Icon: ObiAuto, higherIsBetter: false,
    formula: 'count(AUTO % < limit) ÷ loops with a measured mode',
    threshold: b => `AUTO / CASCADE < ${pc(b.normalModeMin)} of the window` },
  oscillating: { Icon: ObiWave, higherIsBetter: false,
    formula: 'count(diagnosis ∈ {SUSPECTED, CONFIRMED}_OSCILLATION) ÷ assessed loops',
    threshold: () => 'Suspected or confirmed (evidence ≥ 75)' },
  valve: { Icon: ValveIcon, higherIsBetter: false,
    formula: 'count(diagnosis ∈ {SUSPECTED, CONFIRMED}_FINAL_ELEMENT_NONLINEARITY) ÷ assessed loops',
    threshold: () => 'Suspected or confirmed stiction / backlash' },
  effort: { Icon: ObiBoltGoogle, higherIsBetter: false,
    formula: 'count(diagnosis ∈ {SUSPECTED, CONFIRMED}_EXCESSIVE_EFFORT) ÷ assessed loops',
    threshold: () => 'Suspected or confirmed (OP travel, reversals)' },
  saturated: { Icon: ObiLimitsOutsideOver, higherIsBetter: false,
    formula: 'count(time with OP fully open or closed ÷ window time > limit) ÷ loops with a measured OP',
    threshold: b => `> ${pc(b.saturationMax)} of the window at an OP limit` },
  'not-assessable': { Icon: ObiAlarmSignalFail, higherIsBetter: false,
    formula: 'count(fresh window INSUFFICIENT_DATA or EXCLUDED_*) ÷ monitored;  completeness = samples ÷ (window ÷ grid)',
    threshold: b => `Completeness < ${pc(b.g0CompletenessMin)}, bad quality ≥ ${pc(b.g0BadQualityMax)}, or excluded` },
  stale: { Icon: ObiHistoryGoogle, higherIsBetter: false,
    formula: 'count(newest result older than the freshness limit) ÷ monitored loops',
    threshold: b => `No result for > ${Math.round(b.freshSeconds / 60)} min` },
  'never-evaluated': { Icon: ObiPending, higherIsBetter: false,
    formula: 'count(no result at all) ÷ monitored loops',
    threshold: () => 'No result yet' },
};

export const basisShort = (b: FleetKpiBasis): string => `${b.windowKind} window · ${fresh(b)}`;

export interface KpiDelta { points: number; direction: 'up' | 'down' | 'flat'; good: boolean | null; text: string; title: string }

/**
 * Change in the KPI's share since the same classification 24 h earlier, shown as a plain % (it is percentage points of the
 * share — the hover title says so); a share, not a count, so a fleet that grew does not read as a change. Null when there is no earlier picture to compare with.
 */
export function kpiDelta(f: FleetKpiFigure, k: FleetKpis): KpiDelta | null {
  const before = k.previous?.kpis.find(p => p.key === f.key);
  if (!before || before.denominator === 0 || f.denominator === 0) return null;
  const now = (f.count / f.denominator) * 100;
  const then = (before.count / before.denominator) * 100;
  const points = Math.round(now - then);
  const direction = points > 0 ? 'up' : points < 0 ? 'down' : 'flat';
  const better = KPI_META[f.key]?.higherIsBetter ?? false;
  return {
    points, direction,
    good: direction === 'flat' ? null : (direction === 'up') === better,
    text: `${Math.abs(points)} %`,
    title: `Change since 24 h ago: ${Math.round(then)} % (${before.count} of ${before.denominator}) → ${Math.round(now)} % now `
      + `(${f.count} of ${f.denominator}), ${direction === 'flat' ? 'no change' : `${Math.abs(points)} percentage points ${direction}`}`,
  };
}
