import { describe, expect, it } from 'vitest';
import { axisName, axisUnit, numberText, siteStamp, valueText, windowOf, windowText, xFormat } from './trendFormat';

const NOV3_NOON_GST = Date.UTC(2026, 10, 3, 8, 0);
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 4);

describe('windowText', () => {
  it('states the window in the site zone with its abbreviation', () => {
    expect(windowText({ from: NOV3_NOON_GST, to: NOV3_NOON_GST + 24 * HOUR }, 'Asia/Dubai', NOW)).toBe('3 Nov 12:00 to 4 Nov 12:00 GST');
  });

  it('gives a different clock in another zone: the zone is applied, not the browser', () => {
    expect(windowText({ from: NOV3_NOON_GST, to: NOV3_NOON_GST + 24 * HOUR }, 'UTC', NOW)).toBe('3 Nov 08:00 to 4 Nov 08:00 UTC');
  });

  it('adds seconds on a short span, where minutes would misstate it', () => {
    expect(windowText({ from: NOV3_NOON_GST + 5000, to: NOV3_NOON_GST + 95_000 }, 'Asia/Dubai', NOW)).toBe('3 Nov 12:00:05 to 3 Nov 12:01:35 GST');
  });

  it('names both abbreviations when a clock change falls inside the window', () => {
    const before = Date.UTC(2026, 2, 28, 12);
    expect(windowText({ from: before, to: before + 24 * HOUR }, 'Europe/Oslo', Date.UTC(2026, 3, 1))).toBe('28 Mar 13:00 CET to 29 Mar 14:00 CEST');
  });

  it('shows the year across a new year, and on a window from another year', () => {
    expect(windowText({ from: Date.UTC(2026, 11, 31, 12), to: Date.UTC(2027, 0, 1, 12) }, 'UTC', NOW)).toBe('31 Dec 2026 12:00 to 1 Jan 2027 12:00 UTC');
    expect(windowText({ from: Date.UTC(2025, 5, 1), to: Date.UTC(2025, 5, 2) }, 'UTC', NOW)).toBe('1 Jun 2025 00:00 to 2 Jun 2025 00:00 UTC');
  });

  it('falls back to UTC, and says so, for a zone that does not exist', () => {
    expect(windowText({ from: NOV3_NOON_GST, to: NOV3_NOON_GST + 24 * HOUR }, 'Not/AZone', NOW)).toBe('3 Nov 08:00 to 4 Nov 08:00 UTC');
  });
});

describe('windowOf', () => {
  it('turns a zoom percentage into the span on screen', () => {
    expect(windowOf({ from: 1000, to: 2000 }, { start: 0, end: 100 })).toEqual({ from: 1000, to: 2000 });
    expect(windowOf({ from: 1000, to: 2000 }, { start: 25, end: 50 })).toEqual({ from: 1250, to: 1500 });
  });
});

describe('units', () => {
  it('names an axis with its unit, or says the unit is not set', () => {
    expect(axisName({ id: 'a', label: 'PV / SP', unit: 'kg/h' })).toBe('PV / SP (kg/h)');
    expect(axisName({ id: 'a', label: 'PV / SP' })).toBe('PV / SP (unit not set)');
    expect(axisName({ id: 'a', label: 'PV / SP', unit: '   ' })).toBe('PV / SP (unit not set)');
  });

  it('says % on an output axis only when a range is declared', () => {
    expect(axisUnit({ id: 'o', label: 'Output', output: true })).toBeNull();
    expect(axisName({ id: 'o', label: 'Output', output: true })).toBe('Output (unit not set)');
    expect(axisName({ id: 'o', label: 'Output', output: true, unit: '%' })).toBe('Output (unit not set)');
    expect(axisName({ id: 'o', label: 'Output', output: true, range: { min: 0, max: 100 } })).toBe('Output (%)');
  });

  it('keeps a declared non-percent output unit', () => {
    expect(axisName({ id: 'o', label: 'Output', output: true, unit: 'mA' })).toBe('Output (mA)');
  });

  it('trims float noise without rounding a reading away', () => {
    expect(numberText(12.300000000000001)).toBe('12.3');
    expect(numberText(0.00123456)).toBe('0.00123456');
  });

  it('writes a reading with its unit, and a gap as words', () => {
    expect(valueText(12.3, 'kg/h')).toBe('12.3 kg/h');
    expect(valueText(12.3, null)).toBe('12.3 (unit not set)');
    expect(valueText(null, 'kg/h')).toBe('No sample');
    expect(valueText(0, 'kg/h')).toBe('0 kg/h');
  });
});

describe('xFormat', () => {
  it('stamps a time in the site zone', () => {
    expect(siteStamp(NOV3_NOON_GST + 20_000, 'Asia/Dubai')).toBe('3 Nov 2026, 12:00:20 GST');
  });

  it('names the time axis with the zone', () => {
    expect(xFormat({ kind: 'time' }, 'Asia/Dubai').name({ from: NOV3_NOON_GST, to: NOV3_NOON_GST + HOUR })).toBe('Time (GST)');
  });

  it('fits ticks to the span on screen, so a zoomed axis does not repeat one date', () => {
    const format = xFormat({ kind: 'time' }, 'Asia/Dubai');
    expect(format.tick(24 * HOUR)(NOV3_NOON_GST)).toBe('11-03 12:00');
    expect(format.tick(6 * HOUR)(NOV3_NOON_GST)).toBe('12:00');
    expect(format.tick(0.5 * HOUR)(NOV3_NOON_GST + 7000)).toBe('12:00:07');
  });

  it('reads a value axis in its own unit', () => {
    const format = xFormat({ kind: 'value', label: 'frequency', unit: 'Hz' }, 'UTC');
    expect(format.name({ from: 0, to: 1 })).toBe('frequency (Hz)');
    expect(format.span({ from: 0.25, to: 1.5 })).toBe('0.25 to 1.5 Hz');
    expect(format.cursor(0.5)).toBe('frequency 0.5 Hz');
  });
});
