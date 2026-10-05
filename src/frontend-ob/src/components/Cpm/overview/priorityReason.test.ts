import { describe, expect, it } from 'vitest';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { priorityBadge, priorityReasons } from './priorityReason';

const NOW = Date.parse('2026-10-05T12:00:00Z');

const row = (over: Partial<CpmRankedLoop> = {}): CpmRankedLoop => ({
  rank: 1, loopId: 'LIC10404', displayName: 'Level', site: 'hdpe', area: null, unit: null, loopType: 'LIC',
  criticality: 'critical', windowEnd: null, diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.21, mae: null },
  observabilityFlags: [], leadingHypothesis: null,
  priority: 'HIGH', episodeOpenedAt: '2026-10-02T12:00:00Z', episodeWindowCount: 12, ackState: 'UNACKNOWLEDGED',
  ...over,
});

describe('priorityReasons', () => {
  it('states criticality, severity, impact, persistence and evidence score in ranking order', () => {
    expect(priorityReasons(row(), NOW)).toEqual([
      'Critical loop', 'High severity', '21% in band', 'persisting 3 days (12 windows)', 'evidence score 100',
    ]);
  });

  it('leaves missing facts out instead of showing zero', () => {
    expect(priorityReasons(row({ severity: null, episodeOpenedAt: null, confidence: null,
      metrics: { ...row().metrics, goodErrorPct: null } }), NOW)).toEqual(['Critical loop']);
  });

  it('can leave impact to the bar beside it', () => {
    expect(priorityReasons(row(), NOW, { impact: false })).not.toContain('21% in band');
  });

  it('names a non-critical loop by its criticality', () => {
    expect(priorityReasons(row({ criticality: 'medium' }), NOW)[0]).toBe('Medium-criticality loop');
  });

  it('uses singular for one window and hours for a young episode', () => {
    expect(priorityReasons(row({ episodeOpenedAt: '2026-10-05T08:00:00Z', episodeWindowCount: 1 }), NOW))
      .toContain('persisting 4 h (1 window)');
  });
});

describe('priorityBadge', () => {
  it('maps the three levels to the alert tones, unknown to neutral', () => {
    expect(priorityBadge('HIGH')).toEqual({ label: 'High priority', tone: 'bad' });
    expect(priorityBadge('MEDIUM').tone).toBe('warn');
    expect(priorityBadge('LOW').tone).toBe('muted');
    expect(priorityBadge(null).label).toBe('Not prioritised');
  });
});
