// @vitest-environment jsdom
/** PV, SP, OP and Mode in one row with the signal quality; where each value comes from under it; the no-publisher state stays. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';

const hooks = vi.hoisted(() => ({ live: vi.fn(), trend: vi.fn(), last: vi.fn() }));
vi.mock('../../../../hooks/useCpm', () => ({ useCpmTrend: hooks.trend, useLoopLastValues: hooks.last }));
vi.mock('../../../../hooks/useLoopLive', () => ({
  useLoopLive: hooks.live,
  liveQuality: () => ({ label: 'GOOD', tone: 'good' }),
}));
vi.mock('../../trend/useTrendRange', () => ({ useTrendRange: () => ({ from: new Date(0), to: new Date(1), live: true }) }));

import { SignalStrip, SignalStripAt } from './SignalStrip';

const LOOP = { loopId: 'FIC00701' } as CpmLoop;
const NOW = Date.now();
const metric = (value: number | string, ts = NOW) => ({ value, ts, sourceTs: ts });
const strip = () => render(<MemoryRouter><SignalStrip loop={LOOP} /></MemoryRouter>);

beforeEach(() => {
  hooks.live.mockReturnValue({ pv: metric(12.345), sp: metric(12), op: metric(48.2), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
  hooks.trend.mockReturnValue({ data: { points: [] }, isLoading: false, isError: false });
  hooks.last.mockReturnValue({ data: { values: {} }, isLoading: false });
});
afterEach(cleanup);

describe('SignalStrip', () => {
  const subs = (c: HTMLElement) => [...c.querySelectorAll('.cpm-signal-strip .cpm-signal')].map(i => i.querySelector('.cpm-signal__sub')?.textContent ?? '');

  it('shows PV, SP, OP and Mode in one row with the signal quality, not four cards', () => {
    const { container } = strip();
    expect(container.querySelectorAll('.cpm-signal-strip')).toHaveLength(1);
    const items = [...container.querySelectorAll('.cpm-signal-strip .cpm-signal')];
    expect(items.map(i => i.querySelector('.cpm-signal__caption')?.textContent)).toEqual(['PV', 'SP', 'OP', 'MODE']);
    expect(items.map(i => i.querySelector('.cpm-signal__value')?.textContent)).toEqual(['12.35', '12.00', '48.20', 'AUTO']);
    expect(container.querySelector('.cpm-kpi')).toBeNull();
    expect(container.querySelector('.cpm-signal-strip')?.textContent).toMatch(/Signal quality.*Good/);
  });

  // CHG-158 (owner review): the source line under every value is back, as before the redesign
  it('says live under each value while the feed is current', () => {
    const { container } = strip();
    expect(subs(container)).toEqual(['live', 'live', 'live', 'live']);
  });

  it('puts the OP unit beside the number', () => {
    const { container } = strip();
    const op = [...container.querySelectorAll('.cpm-signal')][2];
    expect(op.querySelector('.cpm-signal__unit')?.textContent).toBe('%');
    expect(op.querySelector('.cpm-signal__sub')?.textContent).toBe('live');
  });

  it('says No live publisher and the stored age under each value, not again beside the quality', () => {
    const ts = NOW - 13 * 86_400_000;
    hooks.live.mockReturnValue({ hasData: false, lastSourceTs: null });
    hooks.last.mockReturnValue({ isLoading: false, data: { values: { pv: { value: 5, ts }, sp: { value: 5, ts }, op: { value: 40, ts }, mode: { value: 'AUTO', ts } } } });
    const { container } = strip();
    expect(container.textContent).toMatch(/No live publisher/);
    expect(subs(container)).toEqual(Array(4).fill('last stored 13 days ago'));
    expect(container.querySelector('.cpm-signal-strip__quality')?.textContent).not.toMatch(/last stored/);
  });

  it('says "last received …" under a live value whose feed has stalled, and live under a current one', () => {
    const stalled = NOW - 3 * 86_400_000;
    hooks.live.mockReturnValue({ pv: metric(12.345, stalled), sp: metric(12), op: metric(48.2), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
    const { container } = strip();
    expect(subs(container)[0]).toBe('last received 3 days ago');
    expect(subs(container)[1]).toBe('live');
    expect(container.textContent).not.toMatch(/last stored/);
  });

  it('says from historian under a value read from the newest trend bucket', () => {
    hooks.live.mockReturnValue({ hasData: false, lastSourceTs: null });
    hooks.trend.mockReturnValue({ data: { points: [{ ts: NOW, pv_avg: 3, sp: 4, op_avg: 5, mode: 'AUTO' }] }, isLoading: false, isError: false });
    const { container } = strip();
    expect(subs(container)).toEqual(Array(4).fill('from historian'));
  });

  // CHG-185 (owner review item 5, Q3): amber + a word on a live reading only; neutral otherwise, no green
  describe('state colour', () => {
    const ranged = (over: Partial<CpmLoop> = {}) => render(
      <MemoryRouter><SignalStrip loop={{ ...LOOP, engineering: { opMin: 0, opMax: 100 }, ...over } as CpmLoop} /></MemoryRouter>);
    const box = (c: HTMLElement, i: number) => [...c.querySelectorAll('.cpm-signal-strip .cpm-signal')][i] as HTMLElement;

    it('marks a live OP at a registered range bound amber, with the words At limit', () => {
      hooks.live.mockReturnValue({ pv: metric(12.345), sp: metric(12), op: metric(100), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
      const { container } = ranged();
      expect(box(container, 2).classList.contains('cpm-signal--warning')).toBe(true);
      expect(box(container, 2).querySelector('.cpm-signal__state')?.textContent).toBe('!At limit');
    });

    it('leaves OP neutral inside the range, without a registered range, or when it is not live', () => {
      const op100 = (ts = NOW) => ({ pv: metric(12.345), sp: metric(12), op: metric(100, ts), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
      const inside = ranged();
      expect(box(inside.container, 2).classList.contains('cpm-signal--warning')).toBe(false);
      cleanup();
      hooks.live.mockReturnValue(op100());
      const { container } = strip();
      expect(box(container, 2).classList.contains('cpm-signal--warning')).toBe(false);
      cleanup();
      hooks.live.mockReturnValue(op100(NOW - 3 * 86_400_000));
      const stale = ranged();
      expect(subs(stale.container)[2]).toBe('last received 3 days ago');
      expect(box(stale.container, 2).classList.contains('cpm-signal--warning')).toBe(false);
    });

    it('marks a live mode that is not a normal mode amber, its name and note being the words', () => {
      hooks.live.mockReturnValue({ pv: metric(12.345), sp: metric(12), op: metric(48.2), mode: metric('MAN'), hasData: true, lastSourceTs: NOW });
      const { container } = ranged();
      const mode = box(container, 3);
      expect(mode.classList.contains('cpm-signal--warning')).toBe(true);
      expect(mode.querySelector('.cpm-signal__value')?.textContent).toBe('MAN');
      expect(mode.querySelector('.cpm-signal__sub')?.textContent).toBe('manual · excluded at G1 · live');
    });

    it('never colours a stored mode, nor PV and SP (PV\'s good band is not on this page), and nothing is green', () => {
      hooks.live.mockReturnValue({ hasData: false, lastSourceTs: null });
      hooks.last.mockReturnValue({ isLoading: false, data: { values: { pv: { value: 90, ts: NOW }, sp: { value: 10, ts: NOW }, op: { value: 100, ts: NOW }, mode: { value: 'MAN', ts: NOW } } } });
      const { container } = ranged();
      expect(container.querySelectorAll('.cpm-signal--warning')).toHaveLength(0);
      cleanup();
      hooks.live.mockReturnValue({ pv: metric(90), sp: metric(10), op: metric(48.2), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
      const live = ranged();
      expect(live.container.querySelectorAll('.cpm-signal--warning')).toHaveLength(0);
      expect(live.container.querySelector('.cpm-signal-group [class*="success"], .cpm-signal-group [class*="--good"]')).toBeNull();
    });
  });

  it('keeps the honest empty state when nothing was ever published or stored', () => {
    hooks.live.mockReturnValue({ hasData: false, lastSourceTs: null });
    const { container } = strip();
    expect(container.textContent).toMatch(/No operating data/);
    expect(container.querySelector('.cpm-signal')).toBeNull();
  });
});

describe('SignalStripAt', () => {
  it('reads one trend bucket, the same aggregates the pens draw, and says when', () => {
    const { container } = render(<SignalStripAt point={{ ts: 1, pv: 9, pv_avg: 12.345, sp: 12, op_avg: 48.2, mode: 'MAN' }} />);
    const items = [...container.querySelectorAll('.cpm-signal')];
    expect(items.map(i => i.querySelector('.cpm-signal__caption')?.textContent)).toEqual(['PV', 'SP', 'OP', 'MODE']);
    expect(items.map(i => i.querySelector('.cpm-signal__value')?.textContent)).toEqual(['12.35', '12.00', '48.20', 'MAN']);
    expect(container.textContent).toContain('at window end');
  });

  it('never reads the live feed: an older window keeps its own values', () => {
    hooks.live.mockClear();
    render(<SignalStripAt point={{ ts: 1, pv: 1, sp: 2, op: 3, mode: 'AUTO' }} />);
    expect(hooks.live).not.toHaveBeenCalled();
  });

  it('shows a value that was not stored as a dash, never 0', () => {
    const { container } = render(<SignalStripAt point={{ ts: 1, pv: 4, sp: null, op: null, mode: null }} />);
    expect([...container.querySelectorAll('.cpm-signal__value')].map(v => v.textContent)).toEqual(['4.00', '—', '—', '—']);
  });
});
