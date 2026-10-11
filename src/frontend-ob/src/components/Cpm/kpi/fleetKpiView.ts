/**
 * CHG-082 / KPI Phase 2: how the Overview shows the fleet KPIs (cplm-api `GET /fleet/kpis`). Pure, so order, groups, tones
 * and wording are unit-tested. The numbers are the server's; this only arranges them. Rules: kpi_calculation_logic/KPI-LOGIC.md.
 *
 * ISA-101: colour only where it means something — green for loops performing acceptably, amber for conditions that need a
 * look and for a stopped pipeline (stale, same amber as its bar segment); red stays for findings in the bar; zero counts are muted. Every tile names its denominator.
 */
import type { FleetKpiFigure, FleetKpiKey, FleetKpis } from '../../../api/cpm/fleetKpis';
import type { CpmTone } from '../shared';

export interface KpiGroup { id: 'headline' | 'conditions' | 'coverage'; title: string; keys: FleetKpiKey[] }

/** Tiles in three rows: how the fleet performs, what is wrong, and what could not be judged. */
export const KPI_GROUPS: KpiGroup[] = [
  // CHG-089: "In auto mode" (normal-mode) and the new "In manual mode" side by side
  { id: 'headline', title: 'How the fleet performs', keys: ['acceptable', 'normal-mode', 'manual-mode'] },
  { id: 'conditions', title: 'What needs a look', keys: ['oscillating', 'valve', 'effort', 'saturated'] },
  { id: 'coverage', title: 'What could not be judged', keys: ['not-assessable', 'stale', 'never-evaluated'] },
];

export const pct = (count: number, denominator: number): number =>
  denominator > 0 ? Math.round((count / denominator) * 100) : 0;

export function kpiTone(f: FleetKpiFigure, outOfModeTarget = 0.10): CpmTone {
  if (f.key === 'acceptable') return f.count > 0 ? 'good' : 'muted';
  if (f.key === 'normal-mode') {
    if (f.denominator === 0) return 'muted';
    // Emerson guidance: fewer than 10 % of loops out of mode
    return (f.denominator - f.count) / f.denominator < outOfModeTarget ? 'good' : 'warn';
  }
  if (f.count === 0) return 'muted';
  if (f.key === 'never-evaluated') return 'muted';
  return 'warn';
}

/** "of 160 assessed loops" — the denominator is always named, so a % can be checked. */
export const denominatorText = (f: FleetKpiFigure): string => `of ${f.denominator} ${f.denominatorLabel}`;

export interface KpiSegment { key: string; label: string; count: number; drill: FleetKpiKey }

/** The state bar: every monitored loop in exactly one segment (sums to `monitored`). */
export function stateSegments(k: FleetKpis): KpiSegment[] {
  return [
    { key: 'acceptable', label: 'Performing acceptably', count: k.assessed.acceptable, drill: 'acceptable' as const },
    { key: 'finding', label: 'With a finding', count: k.assessed.finding, drill: 'finding' as const },
    { key: 'symptom', label: 'Symptom only (weak evidence)', count: k.assessed.symptomOnly, drill: 'symptom' as const },
    { key: 'outOfMode', label: 'No fault, but out of mode or at limit', count: k.assessed.noFaultLimited, drill: 'no-fault-limited' as const },
    { key: 'notAssessable', label: 'Not assessable', count: k.states.notAssessable, drill: 'not-assessable' as const },
    { key: 'stale', label: 'Stale', count: k.states.stale, drill: 'stale' as const },
    { key: 'never', label: 'Never evaluated', count: k.states.neverEvaluated, drill: 'never-evaluated' as const },
  ].filter(s => s.count > 0);
}

const REASON: Record<string, string> = {
  INCOMPLETE_DATA: 'incomplete data',
  BAD_QUALITY: 'bad quality',
  DATA_QUALIFICATION: 'data not qualified',
  MANUAL_MODE: 'manual mode',
  OUTSIDE_OPERATING_REGION: 'outside operating region',
  INSTRUMENT_HEALTH: 'instrument fault',
  SENSOR_FAULT: 'sensor fault',
  NOT_YET_JUDGED: 'not yet judged',
  EXCLUDED_OTHER: 'excluded',
};

export const reasonLabel = (r: string | null | undefined): string => (r ? REASON[r] ?? r.toLowerCase().replace(/_/g, ' ') : '');

/** The not-assessable tile's breakdown: "incomplete data 12 · manual mode 3". */
export const reasonsText = (k: FleetKpis): string =>
  k.notAssessableByReason.map(r => `${reasonLabel(r.reason)} ${r.count}`).join(' · ');

/** "newest 24h result, ≤ 60 min old · normal mode ≥ 95 % · at limit > 10 %" */
export function basisText(k: FleetKpis): string {
  const b = k.basis;
  return `Each monitored loop counted once from its newest ${b.windowKind} result, at most ${Math.round(b.freshSeconds / 60)} min old`
    + ` · normal mode ≥ ${Math.round(b.normalModeMin * 100)} % · at limit > ${Math.round(b.saturationMax * 100)} %`
    + ' · findings = suspected or confirmed';
}
