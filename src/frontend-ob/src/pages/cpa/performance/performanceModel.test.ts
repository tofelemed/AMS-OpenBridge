import { describe, expect, it } from 'vitest';
import type { CpmHeatmapLoop, CpmRankedLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { whyRows } from '../../../components/Cpm/evidence/whyRules';
import { gateFailureCounts, gateMark } from '../../../components/Cpm/gateStatus';
import {
  PAGE_SIZE, THRESHOLDS_RESTRICTED, THRESHOLDS_UNAVAILABLE, effectOnVerdict, exclusionLabel, fmtAge, honestRows,
  orderRows, pageOfLoop, rankValue, rollupColumns, sortKeyOf, verdictBadge,
} from './performanceModel';

const loop = (loopId: string, gates: Record<string, string>): CpmHeatmapLoop => ({
  loopId, displayName: loopId, loopType: 'FLOW', windowEnd: null, diagnosis: 'NO_CALL', confidence: null, gates,
});

const ranked = (over: Partial<CpmRankedLoop>): CpmRankedLoop => ({
  rank: 1, loopId: 'A', displayName: 'A', site: 's', area: null, unit: null, loopType: 'FLOW', criticality: 'LOW', windowEnd: null,
  diagnosis: 'SUSPECTED_OSCILLATION', severity: null, confidence: 0.89,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.42, mae: null },
  observabilityFlags: [], leadingHypothesis: null, ...over,
});

describe('exclusionLabel (RD11 D-15)', () => {
  it.each([
    ['EXCLUDED_MODE', 'Excluded: loop not in automatic'],
    ['EXCLUDED_OPERATING_REGION', 'Excluded: outside operating region'],
    ['EXCLUDED_INSTRUMENT_HEALTH', 'Excluded: instrument fault'],
    ['EXCLUDED_SENSOR', 'Excluded: sensor fault'],
    ['EXCLUDED_DATA_QUALITY', 'Excluded: data not qualified'],
  ])('%s has its own label', (code, label) => {
    expect(exclusionLabel(code)).toBe(label);
  });

  it('gives every code a different label, so a frozen transmitter never reads as out of automatic', () => {
    const codes = ['EXCLUDED_MODE', 'EXCLUDED_OPERATING_REGION', 'EXCLUDED_INSTRUMENT_HEALTH', 'EXCLUDED_SENSOR', 'EXCLUDED_DATA_QUALITY'];
    expect(new Set(codes.map(exclusionLabel)).size).toBe(codes.length);
  });

  it('keeps an unknown exclusion visible rather than calling it a mode problem', () => {
    expect(exclusionLabel('EXCLUDED_NEW_CAUSE')).not.toContain('automatic');
  });
});

describe('verdictBadge (CD8)', () => {
  it('uses the diagnosis tones', () => {
    expect(verdictBadge('CONFIRMED_OSCILLATION').tone).toBe('warning');
    expect(verdictBadge('SUSPECTED_OSCILLATION').tone).toBe('info');
    expect(verdictBadge('NO_CALL').tone).toBe('neutral');
    expect(verdictBadge('NOT_EVALUATED').tone).toBe('unknown');
  });

  it('labels an exclusion by its own cause and carries its gate mark', () => {
    const badge = verdictBadge('EXCLUDED_SENSOR');
    expect(badge.label).toBe('Excluded: sensor fault');
    expect(badge.glyph).toBe(gateMark('EXCLUDED_SENSOR').glyph);
  });
});

describe('orderRows', () => {
  const rows = [loop('A', {}), loop('B', {}), loop('C', {}), loop('D', {})];

  it('follows the server ranking, matching tags in any case', () => {
    expect(orderRows(rows, [{ loopId: 'c' }, { loopId: 'A' }]).map(r => r.loopId)).toEqual(['C', 'A', 'B', 'D']);
  });

  it('keeps unranked rows in served order behind the ranked ones', () => {
    expect(orderRows(rows, [{ loopId: 'D' }]).map(r => r.loopId)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('leaves the rows alone with no ranking', () => {
    expect(orderRows(rows, undefined)).toBe(rows);
    expect(orderRows(rows, [])).toBe(rows);
  });

  it('does not change the rows it was given', () => {
    orderRows(rows, [{ loopId: 'D' }]);
    expect(rows.map(r => r.loopId)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('rankValue', () => {
  it('shows the value the row was ranked on', () => {
    expect(rankValue(ranked({}), 'confidence')).toBe('evidence score 89');
    expect(rankValue(ranked({}), 'error')).toBe('42 % in band');
  });

  it('keeps a real 0', () => {
    const zero = ranked({ metrics: { ...ranked({}).metrics, goodErrorPct: 0 } });
    expect(rankValue(zero, 'error')).toBe('0 % in band');
  });

  it('never turns a missing value into 0', () => {
    const none = ranked({ metrics: { ...ranked({}).metrics, goodErrorPct: null }, confidence: null });
    expect(rankValue(none, 'error')).toBeNull();
    expect(rankValue(none, 'confidence')).toBeNull();
    expect(rankValue(undefined, 'error')).toBeNull();
  });

  it('gives no score to a window without a verdict', () => {
    expect(rankValue(ranked({ diagnosis: 'EXCLUDED_MODE' }), 'confidence')).toBeNull();
  });
});

describe('rollupColumns', () => {
  const keys = ['G0', 'G1', 'G7'];
  const loops = [
    loop('A', { G0: 'FAIL', G1: 'EXCLUDED_MODE', G7: 'WARN' }),
    loop('B', { G0: 'PASS', G1: 'EXCLUDED_SENSOR', G7: 'STRONG' }),
    loop('C', { G0: 'WARN', G1: 'PASS', G7: 'FAIL' }),
  ];

  it('counts the loops held back exactly as the old roll-up did', () => {
    const totals = rollupColumns(loops, keys).map(c => c.total);
    expect(totals).toEqual(gateFailureCounts(loops, keys).map(c => c.total));
  });

  it('tells the held-back loops apart by the same marks the cells show', () => {
    const [g0, g1] = rollupColumns(loops, keys);
    expect(g0.parts.map(p => p.glyph).sort()).toEqual([gateMark('FAIL', 'G0').glyph, gateMark('WARN', 'G0').glyph].sort());
    expect(g1.parts).toEqual([expect.objectContaining({ meaning: 'excluded', glyph: gateMark('EXCLUDED_MODE', 'G1').glyph, count: 2 })]);
  });

  it('counts a strong symptom as one meaning, in the warning tone (D-08)', () => {
    const g7 = rollupColumns(loops, keys)[2];
    expect(g7.parts.find(p => p.meaning === 'strong')).toEqual(expect.objectContaining({ tone: 'warning', count: 2 }));
  });

  it('lists nothing for a gate holding no loop back', () => {
    expect(rollupColumns([loop('A', { G0: 'PASS' })], ['G0'])[0]).toEqual(expect.objectContaining({ total: 0, parts: [] }));
  });
});

describe('pageOfLoop', () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ loopId: `L${i}` }));

  it('finds the page a loop sits on, in any case', () => {
    expect(pageOfLoop(rows, 'l0')).toBe(1);
    expect(pageOfLoop(rows, `L${PAGE_SIZE}`)).toBe(2);
  });

  it('is null for a loop not in the rows', () => {
    expect(pageOfLoop(rows, 'nope')).toBeNull();
    expect(pageOfLoop(rows, null)).toBeNull();
  });
});

describe('effectOnVerdict', () => {
  const matrix = (over: Partial<CpmGateMatrix>) => ({ hasPeerLinks: false, verdictV2: { legacy: true }, ...over }) as unknown as CpmGateMatrix;

  it('reads the served role', () => {
    expect(effectOnVerdict('G0', 'BLOCKING', undefined, undefined)).toContain('excludes the whole window');
    expect(effectOnVerdict('G15', 'FUSION', undefined, undefined)).toContain('final banded verdict');
    expect(effectOnVerdict('G5', 'PRIMARY', undefined, undefined)).toContain('primary evidence');
  });

  it('says nothing rather than guess from an unknown role', () => {
    expect(effectOnVerdict('G5', null, undefined, undefined)).toBeNull();
  });

  it('does not claim "no peer links" before the result has arrived', () => {
    expect(effectOnVerdict('G13', 'CONTEXT', undefined, undefined)).toBeNull();
    expect(effectOnVerdict('G13', 'CONTEXT', matrix({ hasPeerLinks: false }), undefined)).toContain('No peer links');
  });

  it('shows no raw enum', () => {
    const text = effectOnVerdict('G13', 'CONTEXT', matrix({ hasPeerLinks: true }), undefined) ?? '';
    expect(text).not.toMatch(/[A-Z]+_[A-Z]+/);
  });
});

describe('honestRows', () => {
  // Real whyRows output, so this fails if the words it must catch ever change.
  const g7 = whyRows('G7', {
    prov: () => undefined,
    cfg: () => undefined,
    row: { metrics: { valid_cycles: 3 }, gates: [], observabilityFlags: [], familyDisqualifiers: [] } as unknown as CpmGateMatrix,
  });

  it('D-20: without the permission, a threshold is restricted, not missing', () => {
    expect(g7[0].against).toContain('no threshold configured');
    const rows = honestRows(g7, { canReadConfig: false, configFailed: false, diagnosis: 'NO_CALL' });
    expect(rows[0].against).toBe(THRESHOLDS_RESTRICTED);
  });

  it('a configuration that failed to load is not called unconfigured', () => {
    const rows = honestRows(g7, { canReadConfig: true, configFailed: true, diagnosis: 'NO_CALL' });
    expect(rows[0].against).toBe(THRESHOLDS_UNAVAILABLE);
  });

  it('keeps the statement when a permitted reader got a configuration with no such threshold', () => {
    const rows = honestRows(g7, { canReadConfig: true, configFailed: false, diagnosis: 'NO_CALL' });
    expect(rows[0].against).toContain('no threshold configured');
  });

  it('D-15: a metric on an excluded window names the real cause', () => {
    const row = { metrics: {}, gates: [], diagnosis: 'EXCLUDED_SENSOR', observabilityFlags: [], familyDisqualifiers: [] } as unknown as CpmGateMatrix;
    const rows = whyRows('G6', { prov: () => undefined, cfg: () => undefined, row });
    expect(rows[0].value).toContain('loop not in automatic');
    const honest = honestRows(rows, { canReadConfig: false, configFailed: false, diagnosis: 'EXCLUDED_SENSOR' });
    expect(honest[0].value).toContain('excluded: sensor fault');
    expect(honest[0].value).not.toContain('automatic');
  });
});

describe('small rules', () => {
  it('sortKeyOf defaults to the evidence score', () => {
    expect(sortKeyOf(null)).toBe('confidence');
    expect(sortKeyOf('nonsense')).toBe('confidence');
    expect(sortKeyOf('error')).toBe('error');
  });

  it('fmtAge reads minutes, then hours', () => {
    expect(fmtAge(5 * 60_000)).toBe('5 min');
    expect(fmtAge(5.2 * 3_600_000)).toBe('5.2 h');
  });
});
