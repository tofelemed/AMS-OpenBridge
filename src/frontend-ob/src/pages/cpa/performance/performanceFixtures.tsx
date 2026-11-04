/** Test data and the harness for the Performance page tests. The data hooks are mocked, the URL is real. */
import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmHeatmapLoop, CpmRankedLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import type { FleetPerformance } from '../../../api/cpm/fleetKpis';

export const GATE_KEYS = ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];

const passing = Object.fromEntries(GATE_KEYS.map(k => [k, 'PASS']));

export const heatRow = (loopId: string, over: Partial<CpmHeatmapLoop> = {}): CpmHeatmapLoop => ({
  loopId,
  displayName: `${loopId} service`,
  loopType: 'FLOW',
  windowEnd: '2026-11-04T09:15:00Z',
  diagnosis: 'NO_CALL',
  confidence: null,
  gates: { ...passing },
  methodRunIds: { G0: 'run-g0', G1: 'run-g1', G3: 'run-g3', G4: 'run-g4', G15: 'run-g15' },
  observabilityFlags: [],
  ...over,
});

export const LOOPS: CpmHeatmapLoop[] = [
  heatRow('FIC101', { gates: { ...passing, G0: 'FAIL', G4: 'STRONG', G15: 'INSUFFICIENT_EVIDENCE' } }),
  heatRow('LIC202', { diagnosis: 'SUSPECTED_OSCILLATION', confidence: 0.54, gates: { ...passing, G3: 'WARN', G15: 'SUSPECTED' } }),
  heatRow('TIC303', { diagnosis: 'EXCLUDED_SENSOR', gates: { ...passing, G1: 'EXCLUDED_SENSOR', G15: 'NOT_EVALUATED' } }),
  heatRow('PIC404', { diagnosis: 'NOT_EVALUATED', windowEnd: null, gates: {}, methodRunIds: {} }),
];

export const ranked = (loopId: string, over: Partial<CpmRankedLoop> = {}): CpmRankedLoop => ({
  rank: 1,
  loopId,
  displayName: loopId,
  site: 'hdpe',
  area: null,
  unit: null,
  loopType: 'FLOW',
  criticality: 'LOW',
  windowEnd: null,
  diagnosis: 'SUSPECTED_OSCILLATION',
  severity: null,
  confidence: 0.8,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.5, mae: null },
  observabilityFlags: [],
  leadingHypothesis: null,
  ...over,
});

export const PERFORMANCE: FleetPerformance = {
  monitored: 4,
  assessed: 3,
  excluded: { notAssessable: 1, stale: 0, neverEvaluated: 0 },
  goodError: { meanPct: 71.25, medianPct: 74.5, counted: 3, notMeasured: 0 },
  errorOfSpan: { medianPct: 2.25, counted: 2, noSpan: 1, notMeasured: 0 },
  periodic: { count: 1, of: 3 },
};

export const SUMMARY = {
  site: null,
  windowKind: '12h',
  loops: { total: 40, monitored: 4, withPeerLinks: 0, withVp: 0 },
  diagnoses: [],
  capability: { loopsCappedByMissingVp: 30, loopsWithoutDisturbanceContext: 12, vpNotInstalled: 2, vpNotApplicable: 5 },
};

export const matrixOf = (over: Partial<CpmGateMatrix> = {}): CpmGateMatrix => ({
  loopId: 'FIC101',
  windowKind: '12h',
  windowStart: '2026-11-03T21:15:00Z',
  windowEnd: '2026-11-04T09:15:00Z',
  sampleCount: 4320,
  diagnosis: 'NO_CALL',
  severity: null,
  confidence: null,
  gates: [
    { key: 'G0', name: 'Data quality', tier: 'short', status: 'FAIL', reason: 'INSUFFICIENT_SAMPLES', methodRunId: 'run-g0' },
    { key: 'G4', name: 'Actuator effort', tier: 'short', status: 'STRONG', reason: null, methodRunId: 'run-g4' },
    { key: 'G7', name: 'Stiction shape', tier: 'long', status: 'PASS', reason: null, methodRunId: null },
  ],
  observabilityFlags: ['NO_VP'],
  familyDisqualifiers: [],
  hasPeerLinks: false,
  insufficientEvidenceReason: null,
  metrics: { valid_cycles: 3, triangularity: 0.2 },
  narrative: { selectedFamily: null, statusReason: null, recommendation: null },
  verdictV2: { legacy: true } as never,
  metadata: {
    schemaVersion: 1, calculationVersion: '7', dynamicsProfileVersion: '3', dynamicsClass: null, profileSource: null,
    calculationSource: 'flink', replayId: null, sourceCommit: null, jarSha256: null, contractVersion: null,
    computedAt: '2026-11-04T09:16:00Z',
  },
  ...over,
});

export const CATALOGUE = {
  count: 3,
  gates: [
    { gate: 'G0', role: 'BLOCKING', definition: 'Is the data usable?' },
    { gate: 'G4', role: 'PERFORMANCE', definition: 'Is the actuator overworked?' },
    { gate: 'G7', role: 'PRIMARY', definition: 'Is the waveform triangular?' },
    { gate: 'G15', role: 'FUSION', definition: 'What is the verdict?' },
  ],
};

const Where: React.FC = () => {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
};

/** Where the app has navigated to, as `path?query`. */
export const whereNow = (element: HTMLElement) => new URL(element.textContent ?? '', 'http://x');

export function renderAt(url: string, page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        {page}
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
