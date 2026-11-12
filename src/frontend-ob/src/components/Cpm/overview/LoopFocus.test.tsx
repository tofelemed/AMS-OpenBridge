// CHG-177 (owner review, Overview v2): the chosen loop is headed by its tag and Review →; no live / source / feed / time
// line; with nothing live only Signal quality says so (the four pills come back with the first value); the trend without
// its zoom tools and ?; an empty historian read is one line with the signal-mapping and Pipeline Health links.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const { trendHook, liveHook, canPipeline, trendProps } = vi.hoisted(() => ({
  trendHook: vi.fn(), liveHook: vi.fn(), canPipeline: { value: true }, trendProps: [] as Array<Record<string, unknown>>,
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, variant }: { children?: React.ReactNode; onClick?: () => void; variant?: string }) =>
    <button type="button" data-variant={variant} onClick={() => onClick?.()}>{children}</button>,
}));
vi.mock('../../../hooks/useCpm', () => ({ useCpmTrend: (...a: unknown[]) => trendHook(...a) }));
vi.mock('../../../hooks/useLoopLive', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../hooks/useLoopLive')>()),
  useLoopLive: (id: string) => liveHook(id),
}));
vi.mock('../access', async importOriginal => ({
  ...(await importOriginal<typeof import('../access')>()),
  usePipelineAccess: () => canPipeline.value,
}));
vi.mock('../trend/SignalTrend', () => ({
  default: (p: Record<string, unknown>) => { trendProps.push(p); return <div data-testid="trend" />; },
}));

import { LoopFocus } from './LoopFocus';

const NOTHING_LIVE = { pv: undefined, sp: undefined, op: undefined, vp: undefined, mode: undefined, quality: undefined, hasData: false, lastTs: null, lastSourceTs: null, lastEmissionTs: null };
const metric = (value: number | string) => ({ value, quality: 192, ts: Date.now(), emissionTs: Date.now() });
const point = { ts: '2026-11-12T08:00:00Z', pv_avg: 41.6, sp: 40, op_avg: 63.2 };

beforeEach(() => {
  trendProps.length = 0;
  canPipeline.value = true;
  liveHook.mockReturnValue(NOTHING_LIVE);
  trendHook.mockReturnValue({ data: { points: [point] }, isLoading: false, isError: false, refetch: vi.fn() });
});
afterEach(cleanup);

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const show = () => render(
  <MemoryRouter initialEntries={['/cpm']}>
    <Routes><Route path="*" element={<><LoopFocus loopId="FIC10301" windowKind="12h" /><Where /></>} /></Routes>
  </MemoryRouter>);

describe('LoopFocus, the chosen loop (CHG-177)', () => {
  it('is headed by the tag alone, with Review → to Investigation', () => {
    const { container } = show();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('FIC10301');
    expect(container.querySelector('.cpm-eyebrow')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=FIC10301&profile=12h');
  });

  it('has no live, source, feed or time line', () => {
    const { container } = show();
    expect(container.textContent).not.toMatch(/live publisher|envelope|source|feed|→ \d/i);
  });

  // Owner, 12 Nov (after the build): the four pills always show; the Signal quality pill leaves the Overview
  it('with nothing live, shows the four pills with — and no Signal quality pill', () => {
    const { container } = show();
    for (const text of ['PV —', 'SP —', 'OP —', 'MODE —']) expect(screen.getByText(text)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Signal quality|No signal/);
  });

  it('shows the four pills as soon as any live value arrives', () => {
    liveHook.mockReturnValue({ ...NOTHING_LIVE, pv: metric(41.6), hasData: true, lastTs: Date.now(), lastSourceTs: Date.now() });
    show();
    for (const text of ['PV 41.6', 'SP —', 'OP —', 'MODE —']) expect(screen.getByText(text)).toBeTruthy();
  });

  it('draws the trend without its zoom tools and ?, over the last 8 h, 260 px tall', () => {
    show();
    expect(screen.getByTestId('trend')).toBeTruthy();
    expect(trendProps.at(-1)).toMatchObject({ loopId: 'FIC10301', tools: false, rangeText: 'in the last 8 h', height: 260 });
  });

  it('with no stored samples says one line, with the signal mapping and Pipeline Health links and no historian path', () => {
    trendHook.mockReturnValue({ data: { points: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    const { container } = show();
    const line = container.querySelector('.cpm-empty-line')!;
    expect(line.textContent).toBe('No PV, SP or OP samples stored in the last 8 h · Signal mapping ↗ · Pipeline Health ↗');
    expect(screen.getByRole('link', { name: 'Signal mapping ↗' }).getAttribute('href')).toBe('/cpm/registry?loop=FIC10301');
    expect(screen.getByRole('link', { name: 'Pipeline Health ↗' }).getAttribute('href')).toBe('/cpm/pipeline');
    expect(container.textContent).not.toMatch(/root\.|historian series/i);
    expect(container.querySelector('.cpm-empty')).toBeNull();
  });

  it('leaves Pipeline Health out of that line for a user who cannot open it', () => {
    canPipeline.value = false;
    trendHook.mockReturnValue({ data: { points: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    const { container } = show();
    expect(container.querySelector('.cpm-empty-line')!.textContent).toBe('No PV, SP or OP samples stored in the last 8 h · Signal mapping ↗');
  });

  it('keeps a failed read on screen with Retry', () => {
    const refetch = vi.fn();
    trendHook.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('boom'), refetch });
    show();
    expect(screen.getByText('Trend unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
