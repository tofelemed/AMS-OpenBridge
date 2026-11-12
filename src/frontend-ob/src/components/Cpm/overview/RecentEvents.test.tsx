// @vitest-environment jsdom
/** Task 6: three recent events in the header scope, each opening Investigation at its window.
 *  CHG-177 (owner review, answer 4): only the page window's episodes, client side: read the newest twelve and list the first
 *  three of the page's window; "Opened · UTC" once, as the column heading; times like "5 Nov 13:45". */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { setActiveZone } from '../../../cpa/activeZone';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={() => onClick?.()}>{children}</button>,
}));
vi.mock('../events/useEventPage', () => ({ useEventPage: vi.fn() }));

import { useEventPage } from '../events/useEventPage';
import { RecentEvents } from './RecentEvents';

const page = (over: Record<string, unknown>) =>
  vi.mocked(useEventPage).mockReturnValue({ isLoading: false, isError: false, data: { events: [] }, ...over } as never);
const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const show = (windowKind = '12h') => render(
  <MemoryRouter initialEntries={['/cpm']}>
    <Routes><Route path="*" element={<><RecentEvents scope={{ site: 'hdpe' }} windowKind={windowKind} /><Where /></>} /></Routes>
  </MemoryRouter>);

beforeAll(() => setActiveZone('UTC'));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const ev = (id: number, over: Record<string, unknown> = {}) => ({
  id, loop_id: 'LIC10501', peak_diagnosis: 'CONFIRMED_OSCILLATION', opened_at: '2026-11-05T13:45:00Z', window_kind: '12h', ...over,
});

describe('RecentEvents', () => {
  it('reads the twelve newest events in the header scope', () => {
    page({});
    show();
    expect(useEventPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 12, page: 1, sort: 'recent', state: 'all', site: 'hdpe' }), 60_000);
  });

  it('opens Investigation at the event window', () => {
    page({ data: { events: [ev(7)] } });
    show();
    fireEvent.click(screen.getByRole('link', { name: /LIC10501/ }));
    expect(screen.getByTestId('where').textContent)
      .toBe('/cpm/investigation?loop=LIC10501&profile=12h&window=2026-11-05T13%3A45%3A00Z');
  });

  it('opens Investigation for the loop when the event has no opening time', () => {
    page({ data: { events: [ev(8, { opened_at: null })] } });
    show();
    fireEvent.click(screen.getByRole('link', { name: /LIC10501/ }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=LIC10501&profile=12h');
  });

  it('goes to all events', () => {
    page({});
    show();
    fireEvent.click(screen.getByRole('button', { name: /All events/ }));
    // CHG-136: Loop Events opens on Open episodes, so "All events" says so
    expect(screen.getByTestId('where').textContent).toBe('/cpm/events?filter=all');
  });

  it('keeps a failure on screen', () => {
    page({ isError: true, error: new Error('boom'), refetch: vi.fn() });
    show();
    expect(screen.getByText(/Recent events unavailable/)).toBeTruthy();
  });
});

describe('RecentEvents of the page window (CHG-177)', () => {
  const mixed = [
    ev(1, { loop_id: 'PIC40102', window_kind: '24h' }), ev(2, { loop_id: 'PIC40102' }), ev(3, { loop_id: 'PIC30325', window_kind: '24h' }),
    ev(4, { loop_id: 'PIC30325' }), ev(5, { loop_id: 'LIC20402', window_kind: '24h' }), ev(6, { loop_id: 'LIC20402' }), ev(7, { loop_id: 'FIC10301' }),
  ];
  const tags = () => screen.getAllByRole('link').map(l => l.querySelectorAll('span')[1].textContent);

  it('lists the first three episodes of the 12h page', () => {
    page({ data: { events: mixed } });
    show('12h');
    expect(tags()).toEqual(['PIC40102', 'PIC30325', 'LIC20402']);
    expect(screen.getAllByRole('link').map(l => l.getAttribute('href'))).toEqual(expect.arrayContaining([expect.stringContaining('profile=12h')]));
  });

  it('lists the 24h episodes on the 24h page', () => {
    page({ data: { events: mixed } });
    show('24h');
    expect(tags()).toEqual(['PIC40102', 'PIC30325', 'LIC20402']);
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).toContain('profile=24h');
  });

  it('counts an event with no window kind recorded as the page window', () => {
    page({ data: { events: [ev(9, { loop_id: 'TIC50211', window_kind: null })] } });
    show('24h');
    expect(tags()).toEqual(['TIC50211']);
  });

  it('says no recent events when none of the newest is of the page window', () => {
    page({ data: { events: [ev(1, { window_kind: '24h' })] } });
    show('12h');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('No recent events')).toBeTruthy();
  });

  it('says the zone once, in the heading, and times like 5 Nov 13:45', () => {
    page({ data: { events: [ev(2), ev(4)] } });
    const { container } = show();
    const head = container.querySelector('.cpm-event-head')!;
    expect([...head.children].map(c => c.textContent)).toEqual(['Opened · UTC', 'Loop', 'Event']);
    expect(screen.getAllByRole('link').map(l => l.querySelector('span')!.textContent)).toEqual(['5 Nov 13:45', '5 Nov 13:45']);
    expect(container.textContent?.match(/UTC/g)).toHaveLength(1);
  });
});
