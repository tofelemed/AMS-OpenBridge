import { describe, expect, it, vi } from 'vitest';
import { helpFor } from '../../../help/registry';
import { fillPlaceholders } from '../../../ui/Toggletip';
import { episodeBadge, recentInRange } from './episodeView';
import { QUEUE_RULE, ruleText } from './FilterProof';
import { helpValues, nameGates } from './helpFill';
import { dailyTrendModel } from './kpiTrendModel';
import { alsoCheck, gateFacts, loopStatistics, whyLines } from './loopFacts';
import { BASIS, EMPTY_KPIS, episode, fleetRow, KPIS, kpiLoops, NOW, ranked, TREND } from './overviewFixtures';
import { clockStamp, fractionText, percentOf, rangeBounds, shareText, shortStamp, windowBounds, windowPhrase } from './overviewFormat';
import { distribution, EXTRA_FILTERS, NEEDING, readReview, REVIEW_FILTERS, reviewCount, reviewParam, trendCarries, trendKeyFor } from './reviewFilters';
import { ackBadge, conditionFor, fromKpi, fromRanked, nextSort, persistenceText, searchRows, sortRows } from './reviewRows';
import { newestWindowEnd, walkFleetRows } from './useOverviewData';

const HOUR = 3_600_000;

describe('shares and D-39', () => {
  it('a denominator of 0 says there is nothing to judge, never "0 % of 0"', () => {
    expect(percentOf(0, 0)).toBeNull();
    expect(shareText(0, 0, 'monitored')).toBe('Nothing to judge');
    expect(shareText(0, 0, 'monitored', 'No loops in scope')).toBe('No loops in scope');
  });

  it('a real 0 of something stays 0', () => {
    expect(percentOf(0, 241)).toBe(0);
    expect(shareText(0, 241, 'monitored')).toBe('0 % of 241 monitored');
  });

  it('a missing fraction stays missing, and a real 0 does not', () => {
    expect(fractionText(null)).toBeNull();
    expect(fractionText(undefined)).toBeNull();
    expect(fractionText(0)).toBe('0 %');
    expect(fractionText(0.42)).toBe('42 %');
  });
});

describe('times', () => {
  it('shows the site zone, never the browser zone', () => {
    expect(shortStamp('2026-11-04T10:15:00Z', 'Asia/Dubai')).toMatch(/^4 Nov 14:15 (GST|GMT\+4)$/);
    expect(clockStamp('2026-11-04T10:15:00Z', 'Asia/Dubai')).toMatch(/^14:15 (GST|GMT\+4)$/);
  });

  it('a missing time is a dash', () => {
    expect(shortStamp(null, 'UTC')).toBe('—');
    expect(shortStamp('not a time', 'UTC')).toBe('—');
  });

  it('states a window with its size and end', () => {
    expect(windowPhrase('12h', '2026-11-04T10:15:00Z', 'UTC')).toBe('12 h window ending 4 Nov 10:15 UTC');
  });

  it('the evaluated window is its size back from its end', () => {
    expect(windowBounds('2026-11-04T12:00:00Z', '12h')).toEqual({ from: Date.parse('2026-11-04T00:00:00Z'), to: Date.parse('2026-11-04T12:00:00Z') });
    expect(windowBounds('2026-11-04T12:00:00Z', '24h')?.from).toBe(Date.parse('2026-11-03T12:00:00Z'));
    expect(windowBounds(null, '12h')).toBeNull();
  });

  it('reads the header range as instants', () => {
    expect(rangeBounds({ key: '8h', from: null, to: null }, NOW)).toEqual({ from: NOW - 8 * HOUR, to: NOW });
    expect(rangeBounds({ key: 'custom', from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z' }, NOW))
      .toEqual({ from: Date.parse('2026-11-01T00:00:00Z'), to: Date.parse('2026-11-02T00:00:00Z') });
    expect(rangeBounds({ key: 'custom', from: 'x', to: null }, NOW)).toBeNull();
  });
});

describe('filters', () => {
  it('has the SPEC set in the SPEC order', () => {
    expect(REVIEW_FILTERS.map(f => f.label)).toEqual([
      'Needing review', 'Oscillating', 'Suspected valve problem', 'Excessive actuator effort', 'Saturated / at limit', 'In manual',
      'Out of normal mode', 'Performing acceptably', 'Not assessable', 'Stale', 'Never evaluated',
    ]);
  });

  it('keeps every key the old /cpm/kpi page accepted', () => {
    for (const key of ['finding', 'symptom', 'no-fault-limited', 'normal-mode', 'assessed', 'all', 'oscillating']) expect(readReview(key)).toBe(key);
  });

  it('an unknown or absent value is the default, which the URL does not carry', () => {
    expect(readReview('nonsense')).toBe(NEEDING);
    expect(readReview(null)).toBe(NEEDING);
    expect(reviewParam(NEEDING)).toBeNull();
    expect(reviewParam('stale')).toBe('stale');
  });

  it('takes each count from the server', () => {
    const s = { kpis: KPIS, queueCount: 19, outOfMode: 10 };
    expect(reviewCount(NEEDING, s)).toBe(19);
    expect(reviewCount('oscillating', s)).toBe(6);
    expect(reviewCount('out-of-mode', s)).toBe(10);
    expect(reviewCount('finding', s)).toBe(15);
    expect(reviewCount('symptom', s)).toBe(4);
    expect(reviewCount('no-fault-limited', s)).toBe(20);
    expect(reviewCount('assessed', s)).toBe(160);
    expect(reviewCount('all', s)).toBe(241);
  });

  it('a count the server has not given is null, never 0', () => {
    expect(reviewCount('oscillating', { queueCount: null, outOfMode: null })).toBeNull();
    expect(reviewCount(NEEDING, { queueCount: null, outOfMode: null })).toBeNull();
  });

  it('the distribution sums to monitored, with the unrecognised loop the old bar left out', () => {
    expect(distribution(KPIS).reduce((sum, s) => sum + s.count, 0)).toBe(KPIS.monitored);
  });

  it('every legend item filters the table, except a state the server has no list for', () => {
    const segments = distribution(KPIS);
    expect(segments.filter(s => !s.filter).map(s => s.key)).toEqual(['unrecognised']);
    expect(segments.find(s => s.key === 'acceptable')?.tone).toBe('normal');
  });

  it('shows no segment for a state with no loops', () => {
    expect(distribution(EMPTY_KPIS)).toEqual([]);
  });

  it('out of normal mode draws its served mirror, and the queue has no daily series', () => {
    expect(trendKeyFor('out-of-mode')).toBe('normal-mode');
    expect(trendKeyFor(NEEDING)).toBeNull();
    expect(trendCarries(TREND, 'oscillating')).toBe(true);
    expect(trendCarries(TREND, 'finding')).toBe(false);
  });
});

describe('help placeholders (UI-037)', () => {
  const pageMetrics = [...REVIEW_FILTERS, ...EXTRA_FILTERS].map(f => f.metric)
    .concat(['M-003', 'M-004', 'M-005', 'M-021', 'M-023', 'M-026', 'M-032', 'M-033', 'M-066', 'M-078', 'M-080', 'M-088', 'M-093', 'M-014']);
  const FIELDS = ['what', 'formula', 'window', 'unit', 'source'] as const;
  const extra = { range: '30 days', 'plant day': 'UTC day' };

  it.each([...new Set(pageMetrics)])('%s shows no raw placeholder, with or without a basis', id => {
    const entry = helpFor(id);
    expect(entry).toBeTruthy();
    for (const basis of [BASIS, undefined]) {
      for (const field of FIELDS) {
        const shown = fillPlaceholders(entry?.[field] ?? '', helpValues(basis, extra));
        // Set notation in a formula is part of the formula: `{NO_CALL, INSUFFICIENT_EVIDENCE}`.
        expect(shown.replace(/\{[A-Z_, ]+\}/g, '')).not.toMatch(/\{[^{}]*\}/);
      }
    }
  });

  it('fills a threshold from the served basis', () => {
    expect(fillPlaceholders('in normal mode ≥ {NormalModeMin:P0}, {fresh}', helpValues(BASIS))).toBe('in normal mode ≥ 95 %, newest 12h result ≤ 60 min old');
  });

  it('names no number it was not given', () => {
    expect(fillPlaceholders('≥ {NormalModeMin:P0}', helpValues(undefined))).toBe('≥ the configured limit');
  });
});

describe('gate references and raw codes', () => {
  it('reads name first', () => {
    expect(nameGates('good-error share ≥ floor (G3)')).toBe('good-error share ≥ floor (Base performance · G3)');
  });

  it('takes raw codes out of a served rule', () => {
    const rule = ruleText(KPIS.kpis[0].rule);
    expect(rule).not.toContain('NO_CALL');
    expect(rule).toContain('Base performance · G3 pass');
  });

  it('the queue rule has no pattern or code in it', () => {
    expect(QUEUE_RULE).not.toMatch(/[A-Z]{3,}_|\^/);
  });
});

describe('conditions', () => {
  it('keeps the unassessed states apart from a verdict (R5)', () => {
    expect(conditionFor('SUSPECTED_OSCILLATION', 'NotAssessable')).toEqual({ label: 'Not assessable', tone: 'unknown' });
    expect(conditionFor('SUSPECTED_OSCILLATION', 'Stale')).toEqual({ label: 'Stale', tone: 'warning' });
    expect(conditionFor(null, 'NeverEvaluated')).toEqual({ label: 'Never evaluated', tone: 'unknown' });
  });

  it('a confirmed finding is warning and a suspected one info (CD8)', () => {
    expect(conditionFor('CONFIRMED_OSCILLATION').tone).toBe('warning');
    expect(conditionFor('SUSPECTED_OSCILLATION').tone).toBe('info');
  });

  it('no fault is neutral, not success: it is a computed result (CD11)', () => {
    expect(conditionFor('NO_CALL')).toEqual({ label: 'No fault identified', tone: 'neutral' });
  });

  it('never prints a raw acknowledgement code', () => {
    expect(ackBadge('UNACKNOWLEDGED')).toEqual({ label: 'Unacknowledged', tone: 'warning' });
    expect(ackBadge('ACKNOWLEDGED')?.tone).toBe('info');
    expect(ackBadge(null)).toBeNull();
  });
});

describe('rows', () => {
  it('takes each field from the source that serves it', () => {
    const row = fromRanked(ranked({ loopId: 'FIC101' }), fleetRow({ loopId: 'FIC101' }), '12h');
    expect(row).toMatchObject({ priority: 'HIGH', coverage: 0.97, goodError: 0.42, ack: 'UNACKNOWLEDGED', asset: 'HDPE › Section 600 › U6002' });
  });

  it('a queue row with no KPI row has no coverage, rather than 0', () => {
    expect(fromRanked(ranked({ loopId: 'FIC101' }), null, '12h').coverage).toBeNull();
  });

  it('a KPI row outside the queue has no priority, age or acknowledgement', () => {
    expect(fromKpi(fleetRow({ loopId: 'TIC1' }), null)).toMatchObject({ priority: null, episodeOpenedAt: null, ack: null });
  });

  it('states how long the episode has stood', () => {
    expect(persistenceText({ episodeOpenedAt: '2026-11-01T10:30:00Z', episodeWindows: 12 }, NOW)).toBe('3 days · 12 windows');
    expect(persistenceText({ episodeOpenedAt: null, episodeWindows: null }, NOW)).toBeNull();
  });

  it('searches tag and service name', () => {
    const rows = [fromKpi(fleetRow({ loopId: 'FIC101', displayName: 'Reactor feed' }), null), fromKpi(fleetRow({ loopId: 'TIC202', displayName: 'Dryer' }), null)];
    expect(searchRows(rows, 'tic').map(r => r.loopId)).toEqual(['TIC202']);
    expect(searchRows(rows, 'REACTOR').map(r => r.loopId)).toEqual(['FIC101']);
  });

  it('sorts missing values last in both directions', () => {
    const rows = [
      fromRanked(ranked({ loopId: 'A', metrics: { ...ranked({ loopId: 'A' }).metrics, goodErrorPct: null } }), null, '12h'),
      fromRanked(ranked({ loopId: 'B', metrics: { ...ranked({ loopId: 'B' }).metrics, goodErrorPct: 0.9 } }), null, '12h'),
      fromRanked(ranked({ loopId: 'C', metrics: { ...ranked({ loopId: 'C' }).metrics, goodErrorPct: 0.1 } }), null, '12h'),
    ];
    expect(sortRows(rows, { key: 'metric', dir: 'asc' }).map(r => r.loopId)).toEqual(['C', 'B', 'A']);
    expect(sortRows(rows, { key: 'metric', dir: 'desc' }).map(r => r.loopId)).toEqual(['B', 'C', 'A']);
  });

  it('keeps the server order with no sort', () => {
    const rows = [fromKpi(fleetRow({ loopId: 'Z' }), null), fromKpi(fleetRow({ loopId: 'A' }), null)];
    expect(sortRows(rows, null)).toBe(rows);
  });

  it('a heading sorts up, then down, then returns to the server order', () => {
    expect(nextSort(null, 'loop')).toEqual({ key: 'loop', dir: 'asc' });
    expect(nextSort({ key: 'loop', dir: 'asc' }, 'loop')).toEqual({ key: 'loop', dir: 'desc' });
    expect(nextSort({ key: 'loop', dir: 'desc' }, 'loop')).toBeNull();
  });
});

describe('inspector facts', () => {
  const queued = fromRanked(ranked({ loopId: 'FIC101' }), fleetRow({ loopId: 'FIC101' }), '12h');

  it('says what selected a queued loop', () => {
    expect(whyLines(queued, NEEDING, NOW)[0]).toContain('High severity');
  });

  it('says what selected a filtered loop, against its rule', () => {
    expect(whyLines(fromKpi(fleetRow({ loopId: 'FIC101' }), null), 'oscillating', NOW)[0]).toBe('Evidence score 90 — at or above 75');
  });

  it('names the performance criterion a no-fault loop missed, gate name first', () => {
    const row = fromKpi(fleetRow({ loopId: 'FIC101', outcome: 'NoFaultLimited', limitedBy: ['G3_BELOW_FLOOR'] }), null);
    expect(whyLines(row, 'no-fault-limited', NOW).join(' ')).toContain('Base performance · G3');
  });

  it('a loop opened by link and outside the queue says so', () => {
    expect(whyLines(fromKpi(fleetRow({ loopId: 'X', state: 'Stale', ageSeconds: 7200 }), null), NEEDING, NOW)[0]).toBe('Not in the review queue');
  });

  it('a statistic the window did not store is null, never 0', () => {
    const row = fromRanked(ranked({ loopId: 'FIC101' }), fleetRow({ loopId: 'FIC101', inputs: { goodErrorPct: 0.42 } }), '12h');
    const byKey = Object.fromEntries(loopStatistics(row).map(s => [s.key, s.value]));
    expect(byKey['normal-mode']).toBeNull();
    expect(byKey.coverage).toBeNull();
    expect(byKey['good-error']).toBe('42 %');
  });

  it('a real 0 statistic stays 0', () => {
    const row = fromKpi(fleetRow({ loopId: 'FIC101', inputs: { saturationPct: 0 } }), null);
    expect(loopStatistics(row).find(s => s.key === 'op-limit')?.value).toBe('0 %');
  });

  it('shows the samples behind coverage', () => {
    expect(loopStatistics(queued).find(s => s.key === 'coverage')?.value).toBe('97 % (40000 of 43200 samples)');
  });

  it('hands gate results to GateBadge and adds the valve gate on a valve row', () => {
    expect(gateFacts(queued, NEEDING).map(g => g.gate)).toEqual(['G3', 'G4']);
    const valve = fromKpi(fleetRow({ loopId: 'V', family: 'FINAL_ELEMENT_NONLINEARITY', inputs: { g14State: 'NOT_CONFIRMED' } }), null);
    expect(gateFacts(valve, 'valve')).toEqual([{ gate: 'G14', status: 'NOT_CONFIRMED' }]);
  });

  it('keeps gate words out of the free text line', () => {
    const row = fromKpi(fleetRow({ loopId: 'V', family: 'FINAL_ELEMENT_NONLINEARITY', inputs: { g14State: 'NOT_CONFIRMED' } }), null);
    expect(alsoCheck(row, 'valve') ?? '').not.toMatch(/G14/);
  });

  it('lists the inputs a reviewer checks next', () => {
    const row = fromKpi(fleetRow({ loopId: 'F', inputs: { periodS: 120, acfRegularity: 0.8 } }), null);
    expect(alsoCheck(row, 'oscillating')).toBe('period 120 s · regularity 0.80');
  });
});

describe('recent episodes', () => {
  const bounds = { from: NOW - 8 * HOUR, to: NOW };

  it('keeps episodes active in the range, including one that opened before it and is still open', () => {
    const rows = [
      episode({ id: 3, opened_at: new Date(NOW - HOUR).toISOString() }),
      episode({ id: 2, opened_at: new Date(NOW - 20 * HOUR).toISOString(), closed_at: new Date(NOW - 10 * HOUR).toISOString() }),
      episode({ id: 1, opened_at: new Date(NOW - 30 * HOUR).toISOString() }),
    ];
    expect(recentInRange(rows, bounds, 3).rows.map(e => e.id)).toEqual([3, 1]);
  });

  it('leaves out an episode opened after a custom range ended', () => {
    const rows = [episode({ id: 1, opened_at: new Date(NOW + HOUR).toISOString() })];
    expect(recentInRange(rows, bounds, 1).rows).toEqual([]);
  });

  it('shows at most ten', () => {
    const rows = Array.from({ length: 14 }, (_, i) => episode({ id: i, opened_at: new Date(NOW - i * 60_000).toISOString() }));
    expect(recentInRange(rows, bounds, 14).rows).toHaveLength(10);
  });

  it('says when the server held more than it searched and fewer than ten were found', () => {
    expect(recentInRange([episode({ id: 1 })], null, 500).partial).toBe(true);
    expect(recentInRange([episode({ id: 1 })], null, 1).partial).toBe(false);
  });

  it('colours episode review states by CD8', () => {
    expect(episodeBadge(episode({ id: 1 }), NOW)).toEqual({ label: 'Unacknowledged', tone: 'warning' });
    expect(episodeBadge(episode({ id: 1, ack_state: 'ACKNOWLEDGED' }), NOW)).toEqual({ label: 'Acknowledged', tone: 'info' });
  });
});

describe('the fleet walk', () => {
  it('reads page after page until the server has none left', async () => {
    const fetchPage = vi.fn(async (page: number) => kpiLoops({ matched: 3, rows: page === 1 ? [fleetRow({ loopId: 'A' }), fleetRow({ loopId: 'B' })] : [fleetRow({ loopId: 'C' })] }));
    const walked = await walkFleetRows(fetchPage);
    expect(walked.rows.map(r => r.loopId)).toEqual(['A', 'B', 'C']);
    expect(walked.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('stops at an empty page rather than asking for ever', async () => {
    const fetchPage = vi.fn(async () => kpiLoops({ matched: 9, rows: [] }));
    expect((await walkFleetRows(fetchPage)).rows).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('says when it stopped short', async () => {
    const fetchPage = vi.fn(async () => kpiLoops({ matched: 99_999 }));
    expect((await walkFleetRows(fetchPage)).truncated).toBe(true);
  });

  it('finds the newest window, and null when no loop has one', () => {
    expect(newestWindowEnd([fleetRow({ loopId: 'A', windowEnd: '2026-11-04T09:00:00Z' }), fleetRow({ loopId: 'B', windowEnd: '2026-11-04T10:00:00Z' })]))
      .toBe(Date.parse('2026-11-04T10:00:00Z'));
    expect(newestWindowEnd([fleetRow({ loopId: 'A', windowEnd: null })])).toBeNull();
  });
});

describe('the daily trend', () => {
  const model = dailyTrendModel(TREND, 'oscillating', 'Oscillating');

  it('leaves a no-data day as a gap, never 0', () => {
    expect(model.panes[0].series[0].y).toEqual([5, null, 2.5, 3.8]);
  });

  it('offers only days with data to pick', () => {
    expect(model.lanes[0].kind).toBe('verdict');
    expect(model.lanes[0].segments.map(s => s.id)).toEqual(['2026-11-02T00:00:00Z', '2026-11-04T00:00:00Z', '2026-11-04T10:29:00Z']);
  });

  it('each picked day keeps the exact instant the server listed it at', () => {
    expect(model.days[0].asOf).toBe('2026-11-02T00:00:00Z');
  });

  it('states the range over days with data only', () => {
    expect(model.range).toEqual({ min: 2.5, max: 5 });
  });

  it('pins the axis to the whole span, so missing days read as a gap', () => {
    expect(model.plotWindow?.to).toBe(Date.parse('2026-11-04T10:29:00Z'));
    expect(model.plotWindow?.from).toBe(Date.parse('2026-11-01T00:00:00Z'));
  });
});
