/** Test data for the Overview tests: served shapes, with counts that add up the way the server's do. */
import type { FleetKpiBasis, FleetKpiLoops, FleetKpiRow, FleetKpis, FleetKpiTrend } from '../../../api/cpm/fleetKpis';
import type { CpmEventFrame, CpmFleetSummary, CpmRankedLoop } from '../../../api/cpmApi';

export const NOW = Date.parse('2026-11-04T10:30:00Z');
export const NEWEST_END = '2026-11-04T10:15:00Z';

export const BASIS: FleetKpiBasis = {
  windowKind: '12h', windows: ['12h', '24h'], freshSeconds: 3600, normalModeMin: 0.95, manualModeMin: 0.5, saturationMax: 0.1,
  g0CompletenessMin: 0.95, g0BadQualityMax: 0.05, findingBands: ['SUSPECTED', 'CONFIRMED'], symptomBands: ['DETECTED', 'CLASSIFIED'],
  noFaultCodes: ['NO_CALL', 'INSUFFICIENT_EVIDENCE'], reference: '',
};

const figure = (key: FleetKpis['kpis'][number]['key'], label: string, count: number, denominator: number, denominatorLabel: string, rule: string) =>
  ({ key, label, count, denominator, denominatorLabel, rule });

export const KPIS: FleetKpis = {
  basis: BASIS,
  computedAt: '2026-11-04T10:29:00Z',
  monitored: 241,
  states: { assessed: 160, notAssessable: 5, stale: 66, neverEvaluated: 10 },
  notAssessableByReason: [{ reason: 'INCOMPLETE_DATA', count: 3 }, { reason: 'MANUAL_MODE', count: 2 }],
  assessed: { acceptable: 120, noFaultLimited: 20, finding: 15, symptomOnly: 4, unrecognised: 1 },
  kpis: [
    figure('acceptable', 'Performing acceptably', 120, 241, 'monitored loops', 'No fault identified (NO_CALL / INSUFFICIENT_EVIDENCE), in normal mode ≥ 95 %, good-error share at or above the profile floor (G3 pass)'),
    figure('normal-mode', 'In auto mode', 140, 150, 'loops with a measured mode', 'AUTO / CASCADE ≥ 95 % of the 12h window'),
    figure('manual-mode', 'In manual mode', 3, 150, 'loops with a measured manual share', 'MANUAL ≥ 50 % of the 12h window'),
    figure('oscillating', 'Oscillating', 6, 160, 'assessed loops', 'Suspected or confirmed oscillation (evidence ≥ 75)'),
    figure('valve', 'Suspected valve problem', 4, 160, 'assessed loops', 'Suspected or confirmed final-element nonlinearity'),
    figure('effort', 'Excessive actuator effort', 2, 160, 'assessed loops', 'Suspected or confirmed excessive effort'),
    figure('saturated', 'Saturated / at limit', 7, 150, 'loops with a measured OP', 'OP fully open or closed > 10 % of the window'),
    figure('not-assessable', 'Not assessable', 5, 241, 'monitored loops', 'Fresh window could not be judged'),
    figure('stale', 'Stale', 66, 241, 'monitored loops', 'Newest 12h result older than 60 min'),
    figure('never-evaluated', 'Never evaluated', 10, 241, 'monitored loops', 'No 12h result yet'),
  ],
  previous: {
    asOf: '2026-11-03T10:29:00Z',
    monitored: 241,
    kpis: [
      { key: 'acceptable', count: 100, denominator: 241 },
      { key: 'not-assessable', count: 5, denominator: 241 },
      { key: 'stale', count: 60, denominator: 241 },
      { key: 'never-evaluated', count: 10, denominator: 241 },
    ],
  },
};

/** A fleet with nothing monitored, for D-39. */
export const EMPTY_KPIS: FleetKpis = {
  ...KPIS,
  monitored: 0,
  states: { assessed: 0, notAssessable: 0, stale: 0, neverEvaluated: 0 },
  notAssessableByReason: [],
  assessed: { acceptable: 0, noFaultLimited: 0, finding: 0, symptomOnly: 0, unrecognised: 0 },
  kpis: KPIS.kpis.map(f => ({ ...f, count: 0, denominator: 0 })),
  previous: undefined,
};

export const ranked = (over: Partial<CpmRankedLoop> & { loopId: string }): CpmRankedLoop => ({
  rank: 1, displayName: `${over.loopId} service`, site: 'hdpe', area: 'section_600', unit: 'u6002', loopType: 'flow', criticality: 'high',
  windowEnd: NEWEST_END, diagnosis: 'SUSPECTED_OSCILLATION', severity: 'HIGH', confidence: 0.9,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.42, mae: 1.2 },
  observabilityFlags: [], leadingHypothesis: null, priority: 'HIGH',
  episodeOpenedAt: '2026-11-01T10:30:00Z', episodeWindowCount: 12, ackState: 'UNACKNOWLEDGED',
  ...over,
});

export const fleetRow = (over: Partial<FleetKpiRow> & { loopId: string }): FleetKpiRow => ({
  displayName: `${over.loopId} service`, site: 'hdpe', area: 'section_600', unit: 'u6002', criticality: 'high',
  state: 'Assessed', outcome: 'Finding', diagnosis: 'SUSPECTED_OSCILLATION', evidenceScore: 90, windowKind: '12h', windowEnd: NEWEST_END,
  ageSeconds: 900, deciding: { label: 'Evidence score', value: 90, threshold: 75, unit: 'score', comparator: '>=', measured: true },
  limitedBy: [],
  inputs: { autoPct: 0.97, saturationPct: 0.02, completeness: 0.97, sampleCount: 40_000, expectedSampleCount: 43_200, goodErrorPct: 0.42, g3Status: 'WARN', g4Status: 'STRONG' },
  ...over,
});

export const kpiLoops = (over: Partial<FleetKpiLoops> = {}): FleetKpiLoops => ({
  kpi: 'oscillating', basis: BASIS, computedAt: '2026-11-04T10:29:00Z', figure: KPIS.kpis[3], total: 6, matched: 6, page: 1, pageSize: 25,
  rows: [fleetRow({ loopId: 'FIC101' })],
  ...over,
});

export const SUMMARY: CpmFleetSummary = {
  site: null, windowKind: '12h',
  loops: { total: 243, monitored: 241, withPeerLinks: 2, withVp: 7 },
  diagnoses: [],
  capability: { loopsCappedByMissingVp: 236, loopsWithoutDisturbanceContext: 241, vpNotInstalled: 3, vpNotApplicable: 0, peersNotApplicable: 1 },
};

export const episode = (over: Partial<CpmEventFrame> & { id: number }): CpmEventFrame => ({
  loop_id: 'FIC101', window_kind: '12h', family: 'OSCILLATION', opened_at: '2026-11-04T09:00:00Z', closed_at: null,
  peak_diagnosis: 'CONFIRMED_OSCILLATION', peak_confidence: 0.9, last_diagnosis: null, last_confidence: null, severity: 'HIGH',
  window_count: 3, ack_state: 'UNACKNOWLEDGED', acked_by: null, acked_at: null, shelve_until: null, note: null, calculation_version: null,
  dynamics_profile_version: null, availability_state: null, condition_state: 'OPEN', result_revision: null, qualified_support_ms: null,
  close_reason: null, shelf_state: 'NONE', shelved_by: null, shelved_at: null, shelve_reason: null,
  ...over,
});

const point = (day: string, asOf: string, count: number | null, isNow = false) => ({
  asOf, day, isNow, source: count == null ? 'none' as const : 'daily' as const, monitored: 241, assessed: 160,
  kpis: count == null ? [] : [
    { key: 'oscillating' as const, count, denominator: 160 },
    { key: 'normal-mode' as const, count: 140, denominator: 150 },
  ],
});

export const TREND: FleetKpiTrend = {
  basis: BASIS, days: 4, anchor: '2026-11-04T00:00:00Z',
  plantDay: { setting: 'UTC', zone: 'UTC', utcOffset: '+00:00' },
  points: [
    point('2026-11-01', '2026-11-02T00:00:00Z', 8),
    point('2026-11-02', '2026-11-03T00:00:00Z', null),
    point('2026-11-03', '2026-11-04T00:00:00Z', 4),
    point('2026-11-04', '2026-11-04T10:29:00Z', 6, true),
  ],
};
