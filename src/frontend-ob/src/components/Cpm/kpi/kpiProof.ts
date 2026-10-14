/**
 * CHG-082 / KPI Phase 3: the words of the proof — why a loop is in a KPI, read from the drill-down row the server built
 * with the same classification as the tile. Pure (unit-tested). Rules and references: kpi_calculation_logic/KPI-LOGIC.md.
 */
import type { FleetKpiKey, FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { ageText } from '../verdictAge';
import { diagnosisLabel } from '../vocabulary';
import { calculationsHref, explorerHref, historicalHref, windowsHref } from '../cpaHref';
import { reasonLabel } from './fleetKpiView';

const NO_FAULT = new Set(['NO_CALL', 'INSUFFICIENT_EVIDENCE']);
const percent = (v: number) => `${Math.round(v * 1000) / 10} %`;

/** "Time in AUTO / CASCADE 62 % — below 95 %": the value that put this loop here, against its threshold. */
export function decidingText(row: FleetKpiRow): string {
  const d = row.deciding;
  if (!d.measured || d.value == null) return d.label === 'State' ? stateText(row) : `${d.label}: not measured`;
  const value = d.unit === 'fraction' ? percent(d.value) : d.unit === 'seconds' ? ageText(d.value * 1000).replace(/ ago$/, '')
    : `${Math.round(d.value)}`;
  const threshold = d.threshold == null ? '' : d.unit === 'fraction' ? percent(d.threshold)
    : d.unit === 'seconds' ? `${Math.round(d.threshold / 60)} min` : `${Math.round(d.threshold)}`;
  const cmp: Record<string, string> = { '>=': 'at or above', '>': 'above', '<': 'below', '<=': 'at or below' };
  // the comparator states the rule the value meets (e.g. AUTO >= 95 %); a value that fails it reads as the opposite
  const meets = d.comparator === '>=' ? d.value >= (d.threshold ?? 0) : d.comparator === '>' ? d.value > (d.threshold ?? 0)
    : d.comparator === '<' ? d.value < (d.threshold ?? 0) : d.value <= (d.threshold ?? 0);
  const word = meets ? cmp[d.comparator] : ({ '>=': 'below', '>': 'at or below', '<': 'at or above', '<=': 'above' } as Record<string, string>)[d.comparator];
  return threshold ? `${d.label} ${value} — ${word} ${threshold}` : `${d.label} ${value}`;
}

export function stateText(row: FleetKpiRow): string {
  switch (row.state) {
    case 'NeverEvaluated': return 'No result yet';
    case 'Stale': return `Newest result ${row.ageSeconds != null ? ageText(row.ageSeconds * 1000) : 'old'}`;
    case 'NotAssessable': return `Not assessable — ${reasonLabel(row.reason)}`;
    default: return NO_FAULT.has(row.diagnosis ?? '') ? 'No fault identified' : row.diagnosis ? diagnosisLabel(row.diagnosis) : 'Assessed';
  }
}

/** The verdict as a word, with its evidence score only when there is a verdict. */
export function verdictText(row: FleetKpiRow): string {
  if (row.state !== 'Assessed') return stateText(row);
  // NO_CALL / INSUFFICIENT_EVIDENCE are verdicts — judged, no fault reached the evidence threshold — never "not evaluated"
  const word = NO_FAULT.has(row.diagnosis ?? '') ? 'No fault identified' : row.diagnosis ? diagnosisLabel(row.diagnosis) : '—';
  return row.evidenceScore != null ? `${word} · evidence ${row.evidenceScore}` : word;
}

/** The inputs a reviewer checks next for this KPI (never a 0 for a value that was not measured). */
export function contextText(row: FleetKpiRow, kpi: FleetKpiKey): string {
  const i = row.inputs;
  const parts: string[] = [];
  const p = (label: string, v?: number | null) => { if (v != null) parts.push(`${label} ${percent(v)}`); };
  if (kpi === 'oscillating') {
    parts.push(i.periodS != null ? `period ${Math.round(i.periodS)} s` : `period not measured${i.periodStatus ? ` (${i.periodStatus.toLowerCase().replace(/_/g, ' ')})` : ''}`);
    if (i.acfRegularity != null) parts.push(`regularity ${i.acfRegularity.toFixed(2)}`);
  } else if (kpi === 'saturated') {
    parts.push(`limits: ${i.limitSource === 'FALLBACK_0_100' ? '0–100 % fallback (no OP range registered)' : i.limitSource ? 'registered OP range' : 'basis not reported'}`);
    if (i.satLimitDwellS != null) parts.push(`longest dwell ${Math.round(i.satLimitDwellS / 60)} min`);
  } else if (kpi === 'effort') {
    if (i.effortRatio != null) parts.push(`effort ratio ${i.effortRatio.toFixed(2)}`);
    if (i.travelPerDay != null) parts.push(`OP travel ${Math.round(i.travelPerDay)} %/day`);
    if (i.reversalsPerHour != null) parts.push(`${i.reversalsPerHour.toFixed(1)} reversals/h`);
  } else if (kpi === 'valve') {
    parts.push(`G14 ${i.g14State ? i.g14State.toLowerCase().replace(/_/g, ' ') : 'not reported'}`);
  } else if (kpi === 'not-assessable') {
    if (i.sampleCount != null && i.expectedSampleCount != null)
      parts.push(`${Math.round(i.sampleCount)} of ${Math.round(i.expectedSampleCount)} samples`);
    if (i.maxGapS != null && i.maxGapS >= 60) parts.push(`longest gap ${Math.round(i.maxGapS / 60)} min`);
    p('bad quality', i.badQualityPct);
  } else if (kpi === 'normal-mode' || kpi === 'out-of-mode' || kpi === 'manual-mode' || kpi === 'acceptable' || kpi === 'no-fault-limited') {
    p('manual', i.manualPct);
  }
  // the last REAL judgement before this window, as context — not an exclusion, not the same window again
  const lv = row.lastVerdict;
  if (lv && row.state !== 'Assessed' && !lv.diagnosis.startsWith('EXCLUDED') && lv.windowEnd !== row.windowEnd)
    parts.push(`last verdict ${diagnosisLabel(lv.diagnosis)}${lv.windowEnd ? `, ${ageText(Date.now() - Date.parse(lv.windowEnd))}` : ''}`);
  return parts.join(' · ');
}

export interface ProofLink { label: string; href: string; title: string }

/** Where the number is proven for this loop: the loop, its evaluated window, the formula, the raw signals. */
/** CHG-092 (SME 2 #9): the calculation that proves each KPI (opened directly on the Calculations page). */
const KPI_METRIC: Partial<Record<FleetKpiKey, string>> = {
  acceptable: 'CPLM-014', 'normal-mode': 'CPLM-003', 'out-of-mode': 'CPLM-003', 'manual-mode': 'CPLM-003',
  'no-fault-limited': 'CPLM-003', oscillating: 'CPLM-030', valve: 'CPLM-050', effort: 'CPLM-020', 'not-assessable': 'CPLM-001',
};

export function proofLinks(row: FleetKpiRow, kpi?: FleetKpiKey): ProofLink[] {
  const end = row.windowEnd ?? null;
  // CHG-089: the trend covers the row's own window (12 h or 24 h), not always 24 h
  const hours = row.windowKind === '12h' ? 12 : 24;
  const from = end ? new Date(Date.parse(end) - hours * 3600_000).toISOString() : null;
  const links: ProofLink[] = [
    { label: 'Loop', href: explorerHref(row.loopId, { tab: 'Summary', kind: row.windowKind }), title: `${row.loopId} in the Loop Explorer` },
  ];
  if (end) links.push({ label: 'Window', href: windowsHref(row.loopId, { profile: row.windowKind, window: end }),
    title: 'The evaluated window in the Window Inspector: data qualification and every gate' });
  if (row.state === 'Assessed' || row.state === 'NotAssessable')
    links.push({ label: 'Calculations', href: calculationsHref(row.loopId, { kind: row.windowKind, metric: kpi ? KPI_METRIC[kpi] : null }),
      title: 'The metric behind this KPI, on the same window, with its formula and history' });
  if (end) links.push({ label: 'Trend', href: historicalHref(row.loopId, { from, to: end }),
    title: 'PV, SP, OP and mode over the evaluated window (Historical)' });
  return links;
}

/** Why this KPI exists and where its rule comes from (KPI-LOGIC.md section 3.2 / 6). */
export const KPI_WHY: Partial<Record<FleetKpiKey, string>> = {
  acceptable: 'The headline of control-loop monitoring: loops judged with no fault, on qualified data, in their normal mode and not at an OP limit (Desborough & Miller 2002; Bauer et al. 2016).',
  'normal-mode': 'A loop out of its normal mode is not controlling. More than 5 % of the time out of design mode counts as out of mode; target: fewer than 10 % of loops out of mode (Emerson loop-performance guidance; Bayer / PlantTriage).',
  'out-of-mode': 'Loops that spent more than 5 % of the window outside AUTO / CASCADE (Emerson; Bayer / PlantTriage).',
  'manual-mode': 'Loops run by hand for half the window or more: the controller is not in charge, so its tuning cannot be judged and the operator carries the load (service factor, Emerson; Bayer / PlantTriage). A loop in MANUAL for a short task is not counted.',
  oscillating: 'Oscillation is among the most common loop defects (Ender 1993; Hägglund 1995). Counted only when suspected or confirmed (evidence ≥ 75), as an alarm would be (ISA-18.2).',
  valve: 'Valve stiction / backlash is a frequent root cause of oscillation and the one maintenance acts on (Horch 1999; Choudhury, Shah & Thornhill 2008). Without valve position it stops at suspected.',
  effort: 'Excessive OP travel and reversals wear the final element (standard CPM wear indicators).',
  saturated: 'A loop at its OP limit has no authority, whatever its tuning. More than 10 % of the time fully open or closed (Bayer / PlantTriage).',
  'not-assessable': 'The window could not be judged — reported with its cause, never as 0 (NAMUR NE 107; GUM).',
  stale: 'No new result for more than 1 h (four missed 15-minute evaluations): the pipeline or the feed stopped (OPC UA "last usable value").',
  'never-evaluated': 'Monitored but never evaluated: an onboarding or signal-mapping gap.',
  finding: 'Suspected or confirmed findings of any family.',
  symptom: 'Detected or classified symptoms: evidence below 75, listed but not counted as findings.',
  'no-fault-limited': 'No fault identified, but the loop was out of its normal mode for more than 5 % of the window or at an OP limit for more than 10 % — so not counted as performing acceptably.',
  assessed: 'Loops whose fresh window was judged.',
  all: 'Every monitored loop in scope.',
};
