/**
 * Every text the panel prints about time, units and values. All of it runs through the site zone
 * (DEC-002 RD5, CD14); nothing here reads the browser zone.
 */
import { axisTimeFormatter, formatInZone } from '../../components/Cpm/evidence/timezone';
import { zoneAbbr } from '../../cpa/siteTime';
import type { ZoomRange } from '../../components/charts/boxZoom';
import type { Interval, TrendAxis, TrendX } from './trendTypes';

export const UNIT_NOT_SET = 'unit not set';
export const NO_SAMPLE = 'No sample';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SECONDS_BELOW_MS = 2 * 3_600_000;

const clean = (unit: string | null | undefined) => unit?.trim() || null;

/** The unit an axis may state. An output axis says "%" only when a range is declared. */
export function axisUnit(axis: TrendAxis): string | null {
  const unit = clean(axis.unit);
  if (!axis.output) return unit;
  if (axis.range) return unit ?? '%';
  return unit === '%' ? null : unit;
}

export const axisName = (axis: TrendAxis) => `${axis.label} (${axisUnit(axis) ?? UNIT_NOT_SET})`;

/** Six significant figures: enough for a reading, and no float noise. */
export const numberText = (v: number) => String(Number(v.toPrecision(6)));

export function valueText(value: number | null, unit: string | null): string {
  if (value == null) return NO_SAMPLE;
  return unit ? `${numberText(value)} ${unit}` : `${numberText(value)} (${UNIT_NOT_SET})`;
}

const clock = (ms: number, zone: string, seconds: boolean, year: boolean) => {
  const s = formatInZone(ms, zone); // YYYY-MM-DD HH:mm:ss
  const date = `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}${year ? ` ${s.slice(0, 4)}` : ''}`;
  return `${date} ${s.slice(11, seconds ? 19 : 16)}`;
};

/** "4 Nov 2026, 13:15:20 GST". */
export function siteStamp(ms: number, zone: string): string {
  const s = formatInZone(ms, zone);
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}, ${s.slice(11)} ${zoneAbbr(zone, ms)}`;
}

/**
 * "3 Nov 12:00 to 4 Nov 12:00 GST". Seconds appear on a short span, the year when it is not obvious,
 * and the abbreviation on each end when a clock change falls inside the window.
 */
export function windowText(w: Interval, zone: string, now = Date.now()): string {
  const seconds = w.to - w.from < SECONDS_BELOW_MS;
  const yearOf = (ms: number) => formatInZone(ms, zone).slice(0, 4);
  const year = yearOf(w.from) !== yearOf(w.to) || yearOf(w.from) !== yearOf(now);
  const from = clock(w.from, zone, seconds, year);
  const to = clock(w.to, zone, seconds, year);
  const a = zoneAbbr(zone, w.from);
  const b = zoneAbbr(zone, w.to);
  return a === b ? `${from} to ${to} ${a}` : `${from} ${a} to ${to} ${b}`;
}

/** The part of the domain a zoom range covers. */
export function windowOf(domain: Interval, zoom: ZoomRange): Interval {
  const span = domain.to - domain.from;
  return { from: domain.from + (span * zoom.start) / 100, to: domain.from + (span * zoom.end) / 100 };
}

export interface XFormat {
  /** Tick labels, fitted to the span on screen. */
  tick: (span: number) => (v: number) => string;
  /** The cursor position in words. */
  cursor: (v: number) => string;
  /** The plotted span, without the "Plotted:" prefix. */
  span: (w: Interval) => string;
  /** Axis title and table column, with the zone or the unit. */
  name: (w: Interval) => string;
}

export function xFormat(x: TrendX, zone: string): XFormat {
  if (x.kind === 'value') {
    const unit = clean(x.unit);
    const named = (v: number) => (unit ? `${numberText(v)} ${unit}` : numberText(v));
    return {
      tick: () => numberText,
      cursor: v => `${x.label} ${named(v)}`,
      span: w => `${numberText(w.from)} to ${named(w.to)}`,
      name: () => `${x.label} (${unit ?? UNIT_NOT_SET})`,
    };
  }
  return {
    tick: span => axisTimeFormatter(span, zone),
    cursor: v => siteStamp(v, zone),
    span: w => windowText(w, zone),
    name: w => {
      const a = zoneAbbr(zone, w.from);
      const b = zoneAbbr(zone, w.to);
      return `Time (${a === b ? a : `${a} to ${b}`})`;
    },
  };
}
