/**
 * CHG-200 (final test #2, #4, #15; controller C2): where each label of a response trend goes, so that no label sits on a drawn
 * line (the curves, the step, guides, spans, brackets, slope lines), on a dot or on another label, at any width. The trend's axes
 * are fixed (time range and value range), so every mark's place in pixels is known before ECharts draws it.
 * Each label tries its usual place first (the place it had before), then the free places around what it names (the other side,
 * above or below, further out), clamped to the plot. A label that fits nowhere is listed under the chart instead; on a narrow
 * chart every label that carries a value is listed there (the marks stay drawn). Placement only: no value changes.
 */
import type { CpmSeries } from '../../evidence/CpmChart';
import type { Mark, MarkLabel } from './annotations';

/** The plot (px) and the data range it shows; `narrow` lists the labels with a value under the chart. */
export interface Frame { width: number; height: number; x: [number, number]; y: [number, number]; narrow?: boolean }
export interface Rect { x: number; y: number; w: number; h: number }
/** A placed label: `at` is its top-left corner in data units, `box` the same in px. */
export interface PlacedLabel { label: MarkLabel; at: [number, number]; box: Rect }
export interface LabelLayout { placed: PlacedLabel[]; notes: MarkLabel[] }

const LINE = 15;   // a 12 px label's line
const GAP = 4;     // between a label and the line it names
const CLEAR = 2;   // room kept free around a label
const DOT = 4;     // half a dot

/** About how wide a 12 px label is drawn (the value at weight 600): narrow and wide letters apart, never measured. */
export function labelWidth(l: MarkLabel): number {
  const w = (s: string) => [...s].reduce((n, c) =>
    n + (/[ilj.,:;'|!·]/.test(c) ? 3.4 : /[ftrI()/[\] ±]/.test(c) ? 4.4 : /[mwMW%]/.test(c) ? 10 : /[A-Z]/.test(c) ? 8 : 6.9), 0);
  return Math.ceil(w(l.text) + (l.value ? 4 + w(l.value) * 1.06 : 0));
}

/** One drawn line as the lowest and highest pixel it covers in each pixel column. */
class Stroke {
  readonly lo: Float32Array; readonly hi: Float32Array;
  constructor(private cols: number) { this.lo = new Float32Array(cols + 1).fill(Infinity); this.hi = new Float32Array(cols + 1).fill(-Infinity); }
  seg(x1: number, y1: number, x2: number, y2: number) {
    if (x2 < x1) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    for (let c = Math.max(0, Math.floor(x1)); c <= Math.min(this.cols, Math.floor(x2)); c++) {
      const at = (x: number) => (x2 === x1 ? NaN : y1 + (y2 - y1) * (x - x1) / (x2 - x1));
      const ya = x2 === x1 ? y1 : at(Math.max(x1, c)), yb = x2 === x1 ? y2 : at(Math.min(x2, c + 1));
      this.lo[c] = Math.min(this.lo[c], ya, yb); this.hi[c] = Math.max(this.hi[c], ya, yb);
    }
  }
  hits(r: Rect): boolean {
    for (let c = Math.max(0, Math.floor(r.x - CLEAR)); c <= Math.min(this.cols, Math.ceil(r.x + r.w + CLEAR)); c++) {
      if (this.lo[c] <= r.y + r.h + CLEAR && this.hi[c] >= r.y - CLEAR) return true;
    }
    return false;
  }
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + CLEAR && b.x < a.x + a.w + CLEAR && a.y < b.y + b.h + CLEAR && b.y < a.y + a.h + CLEAR;
type Side = 'top' | 'bottom' | 'left' | 'right';

export function layoutLabels(marks: Mark[], series: CpmSeries[], f: Frame): LabelLayout {
  const W = f.width, H = f.height;
  const [x0, x1] = f.x, [y0, y1] = f.y;
  const px = (x: number) => ((x - x0) / (x1 - x0 || 1)) * W;
  const py = (y: number) => ((y1 - y) / (y1 - y0 || 1)) * H;
  const cols = Math.max(1, Math.ceil(W));
  const strokes: Stroke[] = [];
  const stroke = () => { const s = new Stroke(cols); strokes.push(s); return s; };
  for (const s of series) {
    const k = stroke();
    for (let i = 0; i + 1 < s.x.length; i++) {
      const a = s.y[i], b = s.y[i + 1];
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (s.held) { k.seg(px(s.x[i]), py(a), px(s.x[i + 1]), py(a)); k.seg(px(s.x[i + 1]), py(a), px(s.x[i + 1]), py(b)); }
      else k.seg(px(s.x[i]), py(a), px(s.x[i + 1]), py(b));
    }
  }
  const dots: Rect[] = [];
  for (const m of marks) {
    if (m.kind === 'step' || m.kind === 'vguide') stroke().seg(px(m.x), 0, px(m.x), H);
    else if (m.kind === 'guide') stroke().seg(m.from == null ? 0 : px(m.from), py(m.y), m.to == null ? W : px(m.to), py(m.y));
    else if (m.kind === 'span') stroke().seg(px(m.x1), py(m.y), px(m.x2), py(m.y));
    else if (m.kind === 'bracket') stroke().seg(px(m.x), py(m.y1), px(m.x), py(m.y2));
    else if (m.kind === 'segment') stroke().seg(px(m.x1), py(m.y1), px(m.x2), py(m.y2));
    else if (m.kind === 'dot') dots.push({ x: px(m.x) - DOT, y: py(m.y) - DOT, w: 2 * DOT, h: 2 * DOT });
  }
  const placed: PlacedLabel[] = [], notes: MarkLabel[] = [];
  const free = (r: Rect) => !strokes.some(s => s.hits(r)) && !dots.some(d => overlaps(r, d)) && !placed.some(p => overlaps(r, p.box));
  for (const m of marks) {
    const label = m.kind === 'step' || m.kind === 'vguide' || m.kind === 'segment' ? undefined : m.label;
    if (!label) continue;
    const w = labelWidth(label), h = LINE;
    if ((f.narrow && label.value) || w > W || h > H) { notes.push(label); continue; }
    const box = candidates(m, w, h, px, py, W)
      .map(([x, y]) => ({ x: Math.min(Math.max(0, x), W - w), y: Math.min(Math.max(0, y), H - h), w, h }))
      .find(free);
    if (!box) { notes.push(label); continue; }
    placed.push({ label, box, at: [x0 + (box.x / W) * (x1 - x0), y1 - (box.y / H) * (y1 - y0)] });
  }
  return { placed, notes };
}

/** The places a mark's label may take (top-left corners, px), its usual place first. */
function candidates(m: Mark, w: number, h: number, px: (x: number) => number, py: (y: number) => number, W: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  switch (m.kind) {
    case 'guide': {
      const a = m.from == null ? 0 : px(m.from), b = m.to == null ? W : px(m.to), y = py(m.y);
      for (const x of [a + GAP, b - w - GAP, a + (b - a) * 0.25 - w / 2, a + (b - a) * 0.5 - w / 2, a + (b - a) * 0.75 - w / 2]) out.push([x, y - h - GAP], [x, y + GAP]);
      return out;
    }
    case 'span': {
      const a = Math.min(px(m.x1), px(m.x2)), b = Math.max(px(m.x1), px(m.x2)), y = py(m.y), mid = (a + b) / 2;
      const above = (k: number): [number, number] => [mid - w / 2, y - h - GAP - k * h];
      const below = (k: number): [number, number] => [mid - w / 2, y + GAP + k * h];
      const after = (k: number): [number, number] => [b + GAP, y - h / 2 + k * h];
      const before = (k: number): [number, number] => [a - GAP - w, y - h / 2 + k * h];
      return m.short
        ? [after(0), before(0), above(0), below(0), after(-1), after(1), above(1), below(1), above(2), below(2)]
        : [above(0), below(0), after(0), before(0), above(1), below(1), above(2), below(2), after(-1), after(1)];
    }
    case 'bracket': {
      const x = px(m.x), ym = (py(m.y1) + py(m.y2)) / 2;
      const left = (k: number): [number, number] => [x - GAP - w, ym - h / 2 + k * h];
      const right = (k: number): [number, number] => [x + GAP, ym - h / 2 + k * h];
      const [pref, other] = m.side === 'right' ? [right, left] : [left, right];
      return [pref(0), other(0), pref(-1), pref(1), pref(-2), pref(2), other(-1), other(1)];
    }
    case 'band': {
      const top = py(Math.max(m.y1, m.y2)), bottom = py(Math.min(m.y1, m.y2));
      for (const x of [px(Math.max(m.x1, m.x2)) - w - GAP, px(Math.min(m.x1, m.x2)) + GAP]) out.push([x, top + GAP], [x, top - h - GAP], [x, bottom + GAP]);
      const right = px(Math.max(m.x1, m.x2)) - w - GAP;
      for (let k = 1; k <= 3; k++) out.push([right, top - h - GAP - k * h], [right, bottom + GAP + k * h]);
      return out;
    }
    case 'dot': case 'text':
      return around(px(m.x), py(m.y), w, h, m.side ?? (m.kind === 'dot' ? 'top' : 'right'), m.kind === 'dot' ? DOT + GAP : GAP);
    default:
      return out;
  }
}

/** Around a point: the preferred side, the other sides, the corners, then the same further out. */
function around(x: number, y: number, w: number, h: number, side: Side, r0: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const r of [r0, r0 + h, r0 + 2 * h]) {
    const at: Record<string, [number, number]> = {
      right: [x + r, y - h / 2], left: [x - r - w, y - h / 2], top: [x - w / 2, y - r - h], bottom: [x - w / 2, y + r],
      topRight: [x + r, y - r - h], bottomRight: [x + r, y + r], topLeft: [x - r - w, y - r - h], bottomLeft: [x - r - w, y + r],
    };
    out.push(at[side], ...['right', 'left', 'top', 'bottom', 'topRight', 'bottomRight', 'topLeft', 'bottomLeft'].filter(k => k !== side).map(k => at[k]));
  }
  return out;
}
