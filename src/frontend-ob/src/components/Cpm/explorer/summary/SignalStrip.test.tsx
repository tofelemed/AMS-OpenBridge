// @vitest-environment jsdom
/** PV, SP, OP and Mode as small cards in one row with the signal quality; one stored age; the no-publisher state stays. */
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
  it('shows PV, SP, OP and Mode in one row with the signal quality, not four cards', () => {
    const { container } = strip();
    expect(container.querySelectorAll('.cpm-signal-strip')).toHaveLength(1);
    const items = [...container.querySelectorAll('.cpm-signal-strip .cpm-signal')];
    expect(items.map(i => i.querySelector('.cpm-signal__caption')?.textContent)).toEqual(['PV', 'SP', 'OP', 'MODE']);
    expect(items.map(i => i.querySelector('.cpm-signal__value')?.textContent)).toEqual(['12.35', '12.00', '48.20', 'AUTO']);
    expect(container.querySelector('.cpm-kpi')).toBeNull();
    expect(container.querySelector('.cpm-signal-strip')?.textContent).toMatch(/Signal quality.*Good/);
  });

  it('says No live publisher and gives the stored age once, without per-card sources', () => {
    const ts = NOW - 13 * 86_400_000;
    hooks.live.mockReturnValue({ hasData: false, lastSourceTs: null });
    hooks.last.mockReturnValue({ isLoading: false, data: { values: { pv: { value: 5, ts }, sp: { value: 5, ts }, op: { value: 40, ts }, mode: { value: 'AUTO', ts } } } });
    const { container } = strip();
    const text = container.textContent ?? '';
    expect(text).toMatch(/No live publisher/);
    expect(text.match(/last stored 13 days ago/g)).toHaveLength(1);
    expect(text).not.toMatch(/from historian|closed loop · analysed/);
  });

  it('says "last received …" under a live value whose feed has stalled, and nothing under a current one', () => {
    const stalled = NOW - 3 * 86_400_000;
    hooks.live.mockReturnValue({ pv: metric(12.345, stalled), sp: metric(12), op: metric(48.2), mode: metric('AUTO'), hasData: true, lastSourceTs: NOW });
    const { container } = strip();
    const subs = [...container.querySelectorAll('.cpm-signal')].map(i => i.querySelector('.cpm-signal__sub')?.textContent ?? '');
    expect(subs[0]).toMatch(/last received 3 days ago/);
    expect(subs[1]).not.toMatch(/last received/);
    expect(container.textContent).not.toMatch(/last stored/);
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
