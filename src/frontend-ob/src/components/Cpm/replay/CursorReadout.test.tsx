// Task 17: the readout under the replay cursor reads the stored sample, and says Not recorded where nothing was stored.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CursorReadout } from './CursorReadout';
import { cursorIndex } from './cursorIndex';
import type { CpmTrendPoint } from '../../../api/cpm/kpis';

afterEach(cleanup);
const T0 = Date.UTC(2026, 9, 5, 0, 30);
const pts = (n: number, over: Partial<CpmTrendPoint> = {}): CpmTrendPoint[] =>
  Array.from({ length: n }, (_, i) => ({ ts: T0 + i * 5000, pv: 50 + i / 1000, sp: 50, op: 40, ...over }));

describe('CursorReadout', () => {
  it('reads PV, SP, OP and mode at the cursor', () => {
    const points = pts(8639, { mode: 'AUT' });
    render(<CursorReadout points={points} cursorPct={100} timeZone="UTC" />);
    expect(screen.getByText('Sample 8,639 / 8,639')).toBeTruthy();
    expect(screen.getByText('PV').nextSibling?.textContent).toBe('58.64');
    expect(screen.getByText('SP').nextSibling?.textContent).toBe('50.00');
    expect(screen.getByText('OP').nextSibling?.textContent).toBe('40.00');
    expect(screen.getByText('Mode').nextSibling?.textContent).toBe('AUT');
  });
  it('reads Not recorded for a blank mode', () => {
    for (const mode of [undefined, null, '', '  ']) {
      cleanup();
      render(<CursorReadout points={pts(10, { mode: mode as never })} cursorPct={50} timeZone="UTC" />);
      expect(screen.getByText('Mode').nextSibling?.textContent).toBe('Not recorded');
      expect(screen.queryByText('AUT')).toBeNull();
    }
  });
  it('reads no value as a dash, never zero', () => {
    render(<CursorReadout points={pts(10, { sp: null })} cursorPct={0} timeZone="UTC" />);
    expect(screen.getByText('SP').nextSibling?.textContent).toBe('—');
    expect(screen.getByText('Sample 1 / 10')).toBeTruthy();
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
