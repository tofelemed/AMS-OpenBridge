// CHG-200 (final test #2, #4, #15; controller C2): a trend's labels never sit on a drawn line or on another label, at any width.
// Each label tries its usual place first, then the free places around what it names; one that fits nowhere (and, on a narrow
// chart, every label that carries a value) is listed under the chart instead. A placed label stays inside the plot.
import { describe, expect, it } from 'vitest';
import type { CpmSeries } from '../../evidence/CpmChart';
import type { Mark } from './annotations';
import { labelWidth, layoutLabels, type Frame, type Rect } from './labelLayout';

// 800 × 200 px over x 0..1000 and y 0..100: x px = x × 0.8, y px = (100 − y) × 2
const frame: Frame = { width: 800, height: 200, x: [0, 1000], y: [0, 100] };
const line = (id: string, pts: Array<[number, number]>): CpmSeries => ({ id, label: id, unit: 'u', x: pts.map(p => p[0]), y: pts.map(p => p[1]), pen: 'pv' });
const diagonal = line('pv', [[0, 0], [1000, 100]]);

/** True when the series' line passes through the box (checked at every half pixel across it). */
function crosses(s: CpmSeries, r: Rect): boolean {
  for (let i = 0; i + 1 < s.x.length; i++) {
    const [ax, ay, bx, by] = [s.x[i] * 0.8, (100 - (s.y[i] as number)) * 2, s.x[i + 1] * 0.8, (100 - (s.y[i + 1] as number)) * 2];
    for (let px = Math.max(r.x, Math.min(ax, bx)); px <= Math.min(r.x + r.w, Math.max(ax, bx)); px += 0.5) {
      const py = bx === ax ? ay : ay + (by - ay) * (px - ax) / (bx - ax);
      if (py >= r.y && py <= r.y + r.h) return true;
    }
  }
  return false;
}
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= frame.width && r.y + r.h <= frame.height;

describe('trend label layout', () => {
  it('a label whose usual place sits on the curve moves to a free place next to its mark', () => {
    const marks: Mark[] = [{ kind: 'dot', x: 500, y: 50, label: { text: 'Measured 63 %', value: '24 s' }, side: 'right' }];
    const { placed, notes } = layoutLabels(marks, [diagonal], frame);
    expect(notes).toEqual([]);
    expect(placed).toHaveLength(1);
    expect(crosses(diagonal, placed[0].box)).toBe(false);
    expect(inside(placed[0].box)).toBe(true);
    // still next to its dot (within two lines of it)
    expect(Math.abs(placed[0].box.y + placed[0].box.h / 2 - 100)).toBeLessThan(40);
  });

  it('keeps the usual place when it is free', () => {
    const flat = line('pv', [[0, 10], [1000, 10]]);
    const { placed } = layoutLabels([{ kind: 'guide', y: 80, label: { text: 'Final value', value: '115' } }], [flat], frame);
    // the start of the line, just above it
    expect(placed[0].box.x).toBeLessThan(10);
    expect(placed[0].box.y + placed[0].box.h).toBeLessThanOrEqual(40);
  });

  it('two band labels on the same right edge are stacked, never drawn on top of each other', () => {
    const pv = line('pv', [[0, 20], [300, 60], [1000, 60]]);
    const marks: Mark[] = [
      { kind: 'band', x1: 300, x2: 1000, y1: 59.5, y2: 60.5, label: { text: 'Setpoint band', value: '±0.5 PV unit' } },
      { kind: 'band', x1: 300, x2: 1000, y1: 59.8, y2: 60.2, label: { text: 'Settling band', value: '±0.1946 PV unit' } },
    ];
    const { placed, notes } = layoutLabels(marks, [pv], frame);
    expect(notes).toEqual([]);
    expect(overlap(placed[0].box, placed[1].box)).toBe(false);
    for (const p of placed) expect(crosses(pv, p.box)).toBe(false);
  });

  it('a span of no length at the step (dead time 0 s) is not crossed by the step line', () => {
    const marks: Mark[] = [{ kind: 'step', x: 300, label: 'Step' }, { kind: 'span', x1: 300, x2: 300, y: 10, label: { text: 'Dead time', value: '0 s' }, short: true }];
    const { placed } = layoutLabels(marks, [line('pv', [[0, 5], [1000, 5]])], frame);
    const box = placed[0].box;
    expect(box.x > 240 || box.x + box.w < 240).toBe(true);   // the step line is at 240 px
  });

  it('on a narrow chart every label with a value is listed under the chart; a word-only label stays on the plot', () => {
    const marks: Mark[] = [
      { kind: 'guide', y: 80, label: { text: 'Final value', value: '115' } },
      { kind: 'dot', x: 200, y: 20, label: { text: '10 %' }, side: 'right' },
    ];
    const { placed, notes } = layoutLabels(marks, [diagonal], { ...frame, width: 300, narrow: true });
    expect(notes).toEqual([{ text: 'Final value', value: '115' }]);
    expect(placed.map(p => p.label.text)).toEqual(['10 %']);
  });

  it('a label that fits nowhere free is listed under the chart, and nothing is placed outside the plot', () => {
    const rules = Array.from({ length: 21 }, (_, i) => line(`r${i}`, [[0, i * 5], [1000, i * 5]]));   // a line every 10 px
    const marks: Mark[] = [
      { kind: 'text', x: 500, y: 52, label: { text: 'Gain (model)', value: '3 PV unit/% OP' }, side: 'right' },
      { kind: 'text', x: 990, y: 50, label: { text: 'Final' }, side: 'right' },
    ];
    const { placed, notes } = layoutLabels(marks, rules, frame);
    expect(notes.map(n => n.text)).toEqual(['Gain (model)', 'Final']);
    expect(placed).toEqual([]);
    const free = layoutLabels([{ kind: 'text', x: 995, y: 50, label: { text: 'Final' }, side: 'right' }], [], frame);
    expect(inside(free.placed[0].box)).toBe(true);   // clamped back inside at the right edge
  });

  it('estimates a label wider for more and wider letters', () => {
    expect(labelWidth({ text: 'Dead time', value: '34 s' })).toBeGreaterThan(labelWidth({ text: 'Dead time' }));
    expect(labelWidth({ text: 'WWW' })).toBeGreaterThan(labelWidth({ text: 'iii' }));
  });
});
