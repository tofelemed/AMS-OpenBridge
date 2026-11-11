// CHG-170 (owner answer 3b): the verification's default loop is the loop with the newest verdict in the ranking the page reads,
// not the first monitoring-enabled loop (AIC30601 on the lab, which has never had a verdict).
import { describe, expect, it } from 'vitest';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { newestVerdictLoop } from './defaultLoop';

const ranked = (loopId: string, windowEnd: string | null, diagnosis: string): CpmRankedLoop => ({
  rank: 1, loopId, displayName: loopId, site: 'hdpe', area: null, unit: null, loopType: 'FIC', criticality: 'B', windowEnd, diagnosis,
  severity: null, confidence: null,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: null, mae: null },
  observabilityFlags: [], leadingHypothesis: null,
});

describe('newestVerdictLoop', () => {
  it('picks the loop whose verdict window ended last', () => {
    expect(newestVerdictLoop([
      ranked('FIC10101', '2026-11-06T11:45:00Z', 'NO_CALL'),
      ranked('FIC10301', '2026-11-06T23:45:00Z', 'SUSPECTED_OSCILLATION'),
      ranked('FIC10401', '2026-11-05T23:45:00Z', 'EXCLUDED_MODE'),
    ])).toBe('FIC10301');
  });

  it('passes over loops without a verdict, however new their row', () => {
    expect(newestVerdictLoop([
      ranked('AIC30601', '2026-11-07T11:45:00Z', 'NOT_EVALUATED'),
      ranked('FIC20101', '2026-11-07T11:45:00Z', 'INSUFFICIENT_DATA'),
      ranked('FIC10101', '2026-11-06T11:45:00Z', 'NO_CALL'),
      ranked('FIC10102', null, 'NO_CALL'),
    ])).toBe('FIC10101');
  });

  it('has no answer when no loop has a verdict', () => {
    expect(newestVerdictLoop([ranked('AIC30601', null, 'NOT_EVALUATED')])).toBeUndefined();
    expect(newestVerdictLoop([])).toBeUndefined();
  });
});
