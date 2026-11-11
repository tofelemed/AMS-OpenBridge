/**
 * Test data for the Pipeline Health page tests (CHG-170): the GET answers the page reads, shaped like the lab's of 11 Nov
 * (7 of 13 required jobs running, the three alarm and three platform jobs not deployed; the on-demand evaluation off the list;
 * the newest 12 h result 7 Nov 11:45, newest verdict FIC10301 6 Nov 23:45), and the recompute and its status. Switches:
 * `engineDown` (the engine does not answer), `metricsFail` (the metrics read fails), `oldApi` (a cplm-api before CHG-170:
 * no newestResultAt, no otherJobs), `gateResults` (what the finished run wrote), `rankingsPending` (the ranking never answers).
 */
const REQUIRED: Array<[name: string, role: 'alarm' | 'cplm' | 'platform']> = [
  ['AMS - Alarm State Machine', 'alarm'], ['AMS - IoTDB Alarm Persistence', 'alarm'], ['AMS - Live State RBE', 'alarm'],
  ['AMS - CPLM Short Feature Engine', 'cplm'], ['AMS - CPLM Long Diagnostics Engine', 'cplm'], ['AMS - CPLM Gate Fusion Engine', 'cplm'],
  ['AMS - Loop Live RBE Engine', 'cplm'], ['AMS - CPLM Condition Engine', 'cplm'], ['AMS - CPLM Instrument Context Engine', 'cplm'],
  ['AMS - CPLM Response Engine', 'cplm'],
  ['AMS - Analysis Execution Engine', 'platform'], ['AMS - Alarm KPI Engine', 'platform'], ['AMS Alarm State Export Engine', 'platform'],
];
// [name, ok, age s, duration ms, state size]
const NUMBERS: Array<[string, number, number, number, number]> = [
  ['AMS - CPLM Short Feature Engine', 25, 126, 16_200, 44_250_000], ['AMS - CPLM Long Diagnostics Engine', 15, 66, 1400, 205_500_000],
  ['AMS - CPLM Gate Fusion Engine', 25, 150, 298, 221_388], ['AMS - Loop Live RBE Engine', 76, 53, 135, 146_432],
  ['AMS - CPLM Condition Engine', 76, 42, 2000, 189_850], ['AMS - CPLM Instrument Context Engine', 15, 228, 152, 42_906],
  ['AMS - CPLM Response Engine', 15, 186, 128, 7_654_604],
];

export interface Lab {
  engineDown?: boolean;
  metricsFail?: boolean;
  oldApi?: boolean;
  gateResults?: number;
  /** The ranking read has not answered yet. */
  rankingsPending?: boolean;
  /** The ranking read fails. */
  rankingsFail?: boolean;
}
export const LAB: Lab = {};

/** The metrics read's time: three minutes before the test run. */
export const COLLECTED_AT = new Date(Date.now() - 3 * 60_000).toISOString();

const status = (lab: Lab) => {
  const running = (name: string) => !lab.engineDown && NUMBERS.some(n => n[0] === name);
  return {
    jobManagerReachable: !lab.engineDown, jobManagerUrl: 'http://flink-jobmanager:8081',
    allRequiredRunning: false, cplmRunning: !lab.engineDown, alarmRunning: false,
    jobs: REQUIRED.map(([name, role]) => ({ name, role, state: running(name) ? 'RUNNING' : 'MISSING', running: running(name) })),
    unexpectedJobs: lab.engineDown ? [] : ['AMS - CPLM On-Demand Evaluation'],
    ...(lab.oldApi ? {} : { otherJobs: lab.engineDown ? [] : [{ name: 'AMS - CPLM On-Demand Evaluation', state: 'RUNNING', running: true }] }),
  };
};

const metrics = (lab: Lab) => ({
  jobManagerReachable: !lab.engineDown, collectedAt: COLLECTED_AT, unavailable: ['watermarkLagMs', 'eventsPerSecond', 'backpressure'],
  jobs: lab.engineDown ? [] : NUMBERS.map(([name, ok, age, dur, size], i) => ({
    name, jid: `${i}0f5aa1b5c8efc8b4656824250891c56`, state: 'RUNNING', role: 'cplm', startTime: '2026-11-11T10:35:00Z', uptimeSec: 4560,
    checkpoint: { completed: ok, failed: 0, lastDurationMs: dur, lastSizeBytes: size, lastCompletedAgeSec: age },
  })),
});

const kpis = (lab: Lab) => ({
  basis: { windowKind: '12h', windows: ['12h', '24h'], freshSeconds: 3600, normalModeMin: 0.95, saturationMax: 0.1, g0CompletenessMin: 0.95,
    g0BadQualityMax: 0.5, findingBands: [], symptomBands: [], noFaultCodes: [], reference: 'kpi_calculation_logic/KPI-LOGIC.md' },
  computedAt: new Date().toISOString(), monitored: 241,
  ...(lab.oldApi ? {} : { newestResultAt: '2026-11-07T11:45:00Z' }),
  states: { assessed: 0, notAssessable: 0, stale: 165, neverEvaluated: 76 },
  notAssessableByReason: [], assessed: { acceptable: 0, noFaultLimited: 0, finding: 0, symptomOnly: 0, unrecognised: 0 }, kpis: [],
});

const ranked = (loopId: string, windowEnd: string | null, diagnosis: string) => ({
  rank: 1, loopId, displayName: `Controller ${loopId}`, site: 'hdpe', area: null, unit: null, loopType: 'FIC', criticality: 'B',
  windowEnd, diagnosis, severity: null, confidence: diagnosis === 'NOT_EVALUATED' ? null : 0.5,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: null, mae: null },
  observabilityFlags: [], leadingHypothesis: null,
});

const loop = (loopId: string, displayName: string) => ({
  loopId, assetId: null, displayName, site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', criticality: 'B', isActive: true,
  monitoringEnabled: true, tags: { pv: 'x' }, observabilityFlags: [],
});

/** The answer to one apiJson call; a failed read throws, as apiJson does. */
export async function respond(lab: Lab, url: string, init?: RequestInit): Promise<unknown> {
  const path = url.split('?')[0];
  if (init?.method === 'POST' && /\/loops\/[^/]+\/recompute$/.test(path)) {
    const parts = path.split('/');
    const loopId = decodeURIComponent(parts[parts.length - 2]);
    return { loopId, replayId: 'rp1', jobId: 'job1', analysisRunId: '7c1e04a2-9b3d-4e5f-a1b2-c3d4e5f60718', statusUrl: '/x' };
  }
  if (path.endsWith('/replays/rp1')) {
    return { replayId: 'rp1', jobId: 'job1', state: 'FINISHED', finished: true, succeeded: true, gateResults: lab.gateResults ?? 2 };
  }
  if (path.endsWith('/pipeline-status')) return status(lab);
  if (path.endsWith('/pipeline-metrics')) {
    if (lab.metricsFail) throw new Error('503 Service Unavailable');
    return metrics(lab);
  }
  if (path.endsWith('/fleet/kpis')) return kpis(lab);
  if (path.endsWith('/fleet/rankings')) {
    if (lab.rankingsPending) return new Promise(() => undefined);
    if (lab.rankingsFail) throw new Error('500 Internal Server Error');
    return { site: null, windowKind: '12h', orderBy: 'confidence', count: 3, loops: [
      ranked('FIC10101', '2026-11-06T11:45:00Z', 'NO_CALL'), ranked('FIC10301', '2026-11-06T23:45:00Z', 'SUSPECTED_OSCILLATION'),
      ranked('AIC30601', null, 'NOT_EVALUATED'),
    ] };
  }
  if (path.endsWith('/v1/cpm/loops')) {   // the API path (a bare '/cpm/...' string reads as a page address to check-redirects)
    return { count: 3, loops: [loop('AIC30601', 'Analyser AIC30601'), loop('FIC10101', 'Flow controller'), loop('FIC10301', 'Flow controller (FCS0101)')] };
  }
  throw new Error(`unexpected request ${init?.method ?? 'GET'} ${url}`);
}
