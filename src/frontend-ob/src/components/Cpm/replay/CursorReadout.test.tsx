// Task 17: the readout under the replay cursor reads the stored sample, and says Not recorded where nothing was stored.
// CHG-189 (owner review item 12): it reads like the Loop Explorer readings (value with its unit), the mode as its word, and
// "Sample n of m"; the time prints exactly as before (Q5), not in a monospace face.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CursorReadout } from './CursorReadout';
import { cursorIndex } from './cursorIndex';
import { formatInZone, zoneLabel } from '../evidence/timezone';
import { modeWord } from '../../../utils/modeVocabulary';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';

afterEach(cleanup);
const T0 = Date.UTC(2026, 9, 5, 0, 30);
const pts = (n: number, over: Partial<CpmTrendPoint> = {}): CpmTrendPoint[] =>
  Array.from({ length: n }, (_, i) => ({ ts: T0 + i * 5000, pv: 50 + i / 1000, sp: 50, op: 40, ...over }));

/** The reading whose caption is `caption`: its value and unit, as the Loop Explorer reading shows them. */
const reading = (caption: string) => {
  const box = screen.getByText(caption).closest('.cpm-signal') as HTMLElement;
  return { value: box.querySelector('.cpm-signal__value')?.textContent, unit: box.querySelector('.cpm-signal__unit')?.textContent ?? null };
};

describe('CursorReadout', () => {
  it('reads PV, SP, OP and mode at the cursor, each value with its unit', () => {
    const points = pts(8639, { mode: 'AUT' });
    render(<CursorReadout points={points} cursorPct={100} timeZone="UTC" pvUnit="kg/h" />);
    expect(screen.getByText('Sample 8,639 of 8,639')).toBeTruthy();
    expect(reading('PV')).toEqual({ value: '58.64', unit: 'kg/h' });
    expect(reading('SP')).toEqual({ value: '50.00', unit: 'kg/h' });
    expect(reading('OP')).toEqual({ value: '40.00', unit: '%' });
    expect(reading('MODE')).toEqual({ value: 'Auto', unit: null });
    expect(screen.queryByText('AUT')).toBeNull();
  });
  it('is drawn as the Loop Explorer readings, with no monospace text', () => {
    const { container } = render(<CursorReadout points={pts(10, { mode: 'AUT' })} cursorPct={100} timeZone="UTC" />);
    expect(container.querySelectorAll('.cpm-signal-group > .cpm-signal')).toHaveLength(4);
    expect(container.querySelector('.cpm-mono')).toBeNull();
    expect(screen.queryByText(/ \/ /)).toBeNull();
  });
  it('names no unit when the loop has none registered', () => {
    render(<CursorReadout points={pts(10)} cursorPct={100} timeZone="UTC" />);
    expect(reading('PV').unit).toBeNull();
    expect(reading('OP').unit).toBe('%');
  });
  it('prints the time exactly as before: the same formatter and zone', () => {
    const points = pts(3);
    render(<CursorReadout points={points} cursorPct={100} timeZone="Asia/Tehran" />);
    expect(screen.getByText(`${formatInZone(points[2].ts, 'Asia/Tehran')} ${zoneLabel('Asia/Tehran', points[2].ts)}`)).toBeTruthy();
  });
  it('reads Not recorded for a blank mode', () => {
    for (const mode of [undefined, null, '', '  ']) {
      cleanup();
      render(<CursorReadout points={pts(10, { mode: mode as never })} cursorPct={50} timeZone="UTC" />);
      expect(reading('MODE').value).toBe('Not recorded');
      expect(screen.queryByText('Auto')).toBeNull();
    }
  });
  it('takes the nearest sample to the cursor, so the marker and the readout agree (B7)', () => {
    expect(cursorIndex(3, 75)).toBe(2);       // 1.5 rounds up; it used to floor to 1
    expect(cursorIndex(3, 74)).toBe(1);
    expect(cursorIndex(101, 50)).toBe(50);
    render(<CursorReadout points={pts(3)} cursorPct={75} timeZone="UTC" />);
    expect(screen.getByText('Sample 3 of 3')).toBeTruthy();
  });
  it('shows a numeric mode as stored, not as Not recorded (B7)', () => {
    render(<CursorReadout points={pts(10, { mode: 2 as never })} cursorPct={50} timeZone="UTC" />);
    expect(reading('MODE').value).toBe('2');
  });
  it('labels the count as loaded on a truncated slice, and only then (B7)', () => {
    render(<CursorReadout points={pts(10)} cursorPct={100} timeZone="UTC" truncated />);
    expect(screen.getByText('Sample 10 of 10 loaded')).toBeTruthy();
    cleanup();
    render(<CursorReadout points={pts(10)} cursorPct={100} timeZone="UTC" />);
    expect(screen.getByText('Sample 10 of 10')).toBeTruthy();
  });
  it('reads no value as a dash, never zero, and gives a dash no unit', () => {
    render(<CursorReadout points={pts(10, { sp: null })} cursorPct={0} timeZone="UTC" pvUnit="kg/h" />);
    expect(reading('SP')).toEqual({ value: '—', unit: null });
    expect(screen.getByText('Sample 1 of 10')).toBeTruthy();
  });
  it('never changes the saved verdict while seeking', () => {
    const points = Object.freeze(pts(100).map(p => Object.freeze(p))) as CpmTrendPoint[];
    const copy = JSON.stringify(points);
    const { rerender } = render(<CursorReadout points={points} cursorPct={0} timeZone="UTC" />);
    for (const pct of [10, 55, 100, 3]) rerender(<CursorReadout points={points} cursorPct={pct} timeZone="UTC" />);
    expect(JSON.stringify(points)).toBe(copy);
    expect(cursorIndex(100, 100)).toBe(99);
    expect(cursorIndex(0, 50)).toBe(-1);
  });
});

describe('modeWord (CHG-189)', () => {
  it('names a token with one meaning, and reads any other as stored', () => {
    expect(['AUT', 'auto', 'A', 'AUTOMATIC'].map(modeWord)).toEqual(['Auto', 'Auto', 'Auto', 'Auto']);
    expect(['CAS', 'MAN', 'man ', 'RSP'].map(modeWord)).toEqual(['Cascade', 'Manual', 'Manual', 'Remote setpoint']);
    expect(modeWord('IMAN')).toBe('IMAN');
    expect(modeWord('PLANT_X')).toBe('PLANT_X');
  });
});
