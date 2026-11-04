import { describe, expect, it } from 'vitest';
import { trendLayout } from './trendLayout';
import { describeTrend, lowerBound, prepareTrend, sampleAt, segmentAt, snapToPoint, snapshotAt, snapshotSentence, visibleSegments, windowTimes } from './trendModel';
import type { TrendLane, TrendPane, TrendSeries } from './trendTypes';

const pane = (series: TrendSeries[], over: Partial<TrendPane> = {}): TrendPane => ({
  id: 'p', axes: [{ id: 'pv', label: 'PV', unit: 'bar' }, { id: 'output', label: 'Output', output: true }], series, ...over,
});
const pv = (x: number[], y: Array<number | null>): TrendSeries => ({ id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x, y });

describe('prepareTrend', () => {
  it('puts each pane on its own grid and numbers the y axes across panes', () => {
    const model = prepareTrend({ panes: [pane([]), pane([], { id: 'q' })] });
    expect(model.axes.map(a => [a.index, a.gridIndex, a.side])).toEqual([[0, 0, 'left'], [1, 0, 'right'], [2, 1, 'left'], [3, 1, 'right']]);
  });

  it('refuses a series on an axis its pane does not declare, rather than reading in the wrong unit', () => {
    expect(() => prepareTrend({ panes: [pane([{ ...pv([0], [1]), axis: 'nope' }])] })).toThrow(/axis "nope"/);
  });

  it('breaks an outage by itself when the caller gives no step', () => {
    const x = [0, 10, 20, 30, 1000, 1010, 1020];
    const model = prepareTrend({ panes: [pane([pv(x, [1, 2, 3, 4, 5, 6, 7])])] });
    expect(model.series[0].data.filter(r => r[1] == null).length).toBe(1);
  });

  it('honours an explicit step, and off', () => {
    const x = [0, 10, 20, 100];
    const y = [1, 2, 3, 4];
    expect(prepareTrend({ panes: [pane([pv(x, y)])], gapStepMs: 15 }).series[0].data.length).toBe(5);
    expect(prepareTrend({ panes: [pane([pv(x, y)])], gapStepMs: null }).series[0].data.length).toBe(4);
  });

  it('pins the domain to the requested window, not to the data', () => {
    expect(prepareTrend({ panes: [pane([pv([50, 60], [1, 2])])], plotWindow: { from: 0, to: 200 } }).domain).toEqual({ from: 0, to: 200 });
  });

  it('takes the domain from the data and lanes when no window is given', () => {
    const lanes: TrendLane[] = [{ id: 'm', label: 'Mode', segments: [{ startMs: 5, endMs: 500, label: 'AUTO', tone: 'neutral' }] }];
    expect(prepareTrend({ panes: [pane([pv([50, 60], [1, 2])])], lanes }).domain).toEqual({ from: 5, to: 500 });
  });

  it('gives one lone reading an axis with a width', () => {
    const { domain } = prepareTrend({ panes: [pane([pv([1000_000], [1])])] });
    expect(domain!.to).toBeGreaterThan(domain!.from);
  });

  it('counts a chart of only nulls as no data, and a lanes-only chart as data', () => {
    expect(prepareTrend({ panes: [pane([pv([0, 10], [null, null])])] }).hasData).toBe(false);
    const lanes: TrendLane[] = [{ id: 'm', label: 'Mode', segments: [{ startMs: 0, endMs: 10, label: 'AUTO', tone: 'neutral' }] }];
    expect(prepareTrend({ panes: [], lanes }).hasData).toBe(true);
  });

  it('sorts rows that arrive out of order on a time axis, and keeps the caller index for meta', () => {
    const series: TrendSeries = { ...pv([20, 0, 10], [3, 1, 2]), meta: i => [`row ${i}`] };
    const model = prepareTrend({ panes: [pane([series])], gapStepMs: null });
    expect(model.series[0].data).toEqual([[0, 1], [10, 2], [20, 3]]);
    expect(sampleAt(model.series[0], 20)).toEqual({ index: 0, value: 3 });
    expect(snapshotAt(model, 20, 'UTC').values[0].meta).toEqual(['row 0']);
  });

  it('keeps sample order on a value axis, which a trajectory needs', () => {
    const model = prepareTrend({ x: { kind: 'value', label: 'OP' }, panes: [pane([pv([40, 42, 41], [1, 2, 3])])] });
    expect(model.series[0].data.map(r => r[0])).toEqual([40, 42, 41]);
    expect(Array.from(model.times)).toEqual([40, 41, 42]);
  });

  it('drops lanes on a value axis: they are time bands', () => {
    const lanes: TrendLane[] = [{ id: 'm', label: 'Mode', segments: [{ startMs: 0, endMs: 10, label: 'AUTO', tone: 'neutral' }] }];
    expect(prepareTrend({ x: { kind: 'value', label: 'lag' }, panes: [pane([pv([1, 2], [1, 2])])], lanes }).lanes).toEqual([]);
  });

  it('collects sorted unique sample points, without the null rows', () => {
    const a = pv([0, 10, 20], [1, null, 3]);
    const b: TrendSeries = { id: 'sp', label: 'SP', role: 'sp', axis: 'pv', x: [0, 5, 20], y: [1, 1, 1] };
    expect(Array.from(prepareTrend({ panes: [pane([a, b])] }).times)).toEqual([0, 5, 20]);
  });
});

describe('no-sample intervals', () => {
  it('needs every measured series silent', () => {
    const a = pv([0, 10, 100, 110], [1, 2, 3, 4]);
    const b: TrendSeries = { id: 'op', label: 'OP', role: 'op', axis: 'output', x: [0, 50, 60, 110], y: [1, 2, 3, 4] };
    const model = prepareTrend({ panes: [pane([a, b])], gapStepMs: 15 });
    expect(model.panes[0].noSample).toEqual([{ from: 10, to: 50 }, { from: 60, to: 100 }]);
  });

  it('does not let a held setpoint hide a PV outage', () => {
    const a = pv([0, 10, 100, 110], [1, 2, 3, 4]);
    // SP keeps reporting right through the outage, so a plain intersection would find no gap at all.
    const sp: TrendSeries = { id: 'sp', label: 'SP', role: 'sp', axis: 'pv', held: true, x: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], y: Array(12).fill(5) };
    const model = prepareTrend({ panes: [pane([a, sp])], gapStepMs: 15 });
    expect(model.panes[0].noSample).toEqual([{ from: 10, to: 100 }]);
  });

  it('takes explicit intervals, clipped to the window', () => {
    const model = prepareTrend({ panes: [pane([pv([0, 10], [1, 2])])], plotWindow: { from: 0, to: 100 }, noSample: [{ from: 50, to: 500 }] });
    expect(model.panes[0].noSample).toEqual([{ from: 50, to: 100 }]);
  });

  it('marks the part of the window before the feed began', () => {
    const model = prepareTrend({ panes: [pane([pv([50, 60, 70, 80], [1, 2, 3, 4])])], plotWindow: { from: 0, to: 80 } });
    expect(model.panes[0].noSample).toEqual([{ from: 0, to: 50 }]);
  });

  it('has none on a value axis', () => {
    expect(prepareTrend({ x: { kind: 'value', label: 'lag' }, panes: [pane([pv([0, 100], [1, 2])])] }).panes[0].noSample).toEqual([]);
  });
});

describe('readings', () => {
  const model = prepareTrend({ panes: [pane([pv([0, 10, 20, 100, 110], [1, 2, null, 4, 5])])], gapStepMs: 15 });
  const series = model.series[0];

  it('reads an exact sample and a nearby one, and never interpolates', () => {
    expect(sampleAt(series, 10)?.value).toBe(2);
    expect(sampleAt(series, 7)?.value).toBe(2);
    expect(sampleAt(series, 3)?.value).toBe(1);
  });

  it('reads a null as no sample', () => {
    expect(sampleAt(series, 20)).toBeNull();
  });

  it('reads the middle of a gap as no sample', () => {
    expect(sampleAt(series, 60)).toBeNull();
  });

  it('holds a held value up to the next sample, and not across a gap step', () => {
    const held: TrendSeries = { ...pv([0, 100], [5, 6]), held: true };
    const free = prepareTrend({ panes: [pane([held])], gapStepMs: null }).series[0];
    expect(sampleAt(free, 99)?.value).toBe(5);
    expect(sampleAt(free, 100)?.value).toBe(6);
    const stepped = prepareTrend({ panes: [pane([held])], gapStepMs: 50 }).series[0];
    expect(sampleAt(stepped, 99)).toBeNull();
  });

  it('does not read a held value before its first sample', () => {
    const later = prepareTrend({ panes: [pane([{ ...pv([50, 100], [5, 6]), held: true }])], gapStepMs: null }).series[0];
    expect(sampleAt(later, 10)).toBeNull();
  });
});

describe('snapToPoint', () => {
  const model = prepareTrend({ panes: [pane([pv([0, 10, 20, 1000, 1010], [1, 2, 3, 4, 5])])], gapStepMs: 15 });
  const all = { from: 0, to: 1010 };

  it('moves a pointer onto a nearby sample', () => {
    expect(snapToPoint(model, all, 12)).toBe(10);
  });

  it('stays put inside a gap, so the reading says no sample', () => {
    expect(snapToPoint(model, all, 500)).toBe(500);
    const reading = snapshotAt(model, snapToPoint(model, all, 500), 'UTC');
    expect(reading.values[0].text).toBe('No sample');
  });
});

describe('snapshotAt', () => {
  const lanes: TrendLane[] = [
    { id: 'mode', label: 'Mode', kind: 'mode', segments: [{ startMs: 0, endMs: 50, label: 'AUTO', tone: 'neutral' }] },
    { id: 'verdict', label: 'Verdict', kind: 'verdict', segments: [{ startMs: 100, endMs: 200, label: 'OK', tone: 'good' }] },
  ];
  const model = prepareTrend({
    panes: [pane(
      [pv([0, 10], [1.5, 2]), { id: 'op', label: 'OP', role: 'op', axis: 'output', x: [0, 10], y: [null, 40] }],
      { bands: [{ id: 'b', label: 'PV span', axis: 'pv', x: [0, 10], lo: [1, 1.5], hi: [2, 2.5] }] },
    )],
    lanes, gapStepMs: null,
  });

  it('gives each reading its unit, a gap in words, and the lanes in text', () => {
    const s = snapshotAt(model, 0, 'UTC');
    expect(s.values.map(v => v.text)).toEqual(['1.5 bar', 'No sample']);
    expect(s.bands[0].text).toBe('1 to 2 bar');
    expect(s.lanes.map(l => l.text)).toEqual(['AUTO', 'No value']);
  });

  it('reads as one sentence for a screen reader', () => {
    expect(snapshotSentence(snapshotAt(model, 0, 'UTC'))).toBe('1 Jan 1970, 00:00:00 UTC. PV 1.5 bar. OP No sample. PV span 1 to 2 bar. Mode AUTO. Verdict No value.');
  });
});

describe('search helpers', () => {
  it('finds positions in sorted data', () => {
    expect(lowerBound([1, 3, 5], 3)).toBe(1);
    expect(lowerBound([1, 3, 5], 4)).toBe(2);
    expect(lowerBound([1, 3, 5], 9)).toBe(3);
  });

  it('limits the points to a window, ends included', () => {
    expect(Array.from(windowTimes(new Float64Array([0, 10, 20, 30]), { from: 10, to: 20 }))).toEqual([10, 20]);
  });

  it('finds the segment at an instant, end exclusive, with a hole left empty', () => {
    const lane: TrendLane = { id: 'l', label: 'L', segments: [{ startMs: 0, endMs: 10, label: 'a', tone: 'good' }, { startMs: 20, endMs: 30, label: 'b', tone: 'bad' }] };
    expect(segmentAt(lane, 5)?.label).toBe('a');
    expect(segmentAt(lane, 10)).toBeNull();
    expect(segmentAt(lane, 15)).toBeNull();
    expect(visibleSegments(lane, { from: 12, to: 40 }).map(s => s.label)).toEqual(['b']);
  });
});

describe('describeTrend', () => {
  it('names the signals, the units, the gaps and the lanes', () => {
    const lanes: TrendLane[] = [{ id: 'v', label: 'Verdict', kind: 'verdict', segments: [{ startMs: 0, endMs: 10, label: 'OK', tone: 'good' }] }];
    const model = prepareTrend({
      panes: [pane([pv([0, 10, 100, 110], [1, 2, 3, 4]), { id: 'op', label: 'OP', role: 'op', axis: 'output', x: [0, 110], y: [1, 2] }])],
      lanes, noSample: [{ from: 10, to: 100 }], plotWindow: { from: 0, to: 110 },
    });
    expect(describeTrend(model, 'FIC101 signals', 'Plotted: x to y GST')).toBe(
      'Trend chart: FIC101 signals. Signals: PV in bar, OP, unit not set. Plotted: x to y GST. 1 interval with no sample. Verdict lane with 1 segment.',
    );
  });
});

describe('trendLayout', () => {
  it('stacks panes then lanes, with the same margins on every grid', () => {
    const l = trendLayout([{ axisCount: 2 }, { axisCount: 1, height: 80 }], ['Mode', 'Verdict']);
    expect(l.grids.length).toBe(4);
    expect(new Set(l.grids.map(g => g.left)).size).toBe(1);
    expect(new Set(l.grids.map(g => g.right)).size).toBe(1);
    expect(l.panes[0].height).toBe(240);
    expect(l.panes[1].height).toBe(80);
    for (let i = 1; i < l.grids.length; i++) expect(l.grids[i].top).toBeGreaterThanOrEqual(l.grids[i - 1].top + l.grids[i - 1].height);
    expect(l.height).toBeGreaterThan(l.grids[3].top + l.grids[3].height);
  });

  it('widens the gutter for a long lane name, within a limit', () => {
    expect(trendLayout([], ['Instrument health']).grids[0].left).toBeGreaterThan(trendLayout([], ['Mode']).grids[0].left);
    expect(trendLayout([], ['A very long lane name that goes on and on and on']).grids[0].left).toBe(140);
  });

  it('adds room for extra axes on both sides', () => {
    expect(trendLayout([{ axisCount: 4 }], []).panes[0].left).toBeGreaterThan(trendLayout([{ axisCount: 2 }], []).panes[0].left);
    expect(trendLayout([{ axisCount: 4 }], []).panes[0].right).toBeGreaterThan(trendLayout([{ axisCount: 2 }], []).panes[0].right);
  });
});
