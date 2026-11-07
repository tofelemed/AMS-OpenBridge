// @vitest-environment jsdom
/** Task 6: three recent events in the header scope, each opening Investigation at its window. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
const show = () => render(
  <MemoryRouter initialEntries={['/cpm']}>
    <Routes><Route path="*" element={<><RecentEvents scope={{ site: 'hdpe' }} windowKind="12h" /><Where /></>} /></Routes>
  </MemoryRouter>);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const ev = (id: number, over: Record<string, unknown> = {}) => ({
  id, loop_id: 'LIC10501', peak_diagnosis: 'CONFIRMED_OSCILLATION', opened_at: '2026-11-05T13:45:00Z', ...over,
});

describe('RecentEvents', () => {
  it('asks for three recent events in the header scope', () => {
    page({});
    show();
    expect(useEventPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 3, sort: 'recent', site: 'hdpe' }), 60_000);
  });

  it('opens Investigation at the event window', () => {
    page({ data: { events: [ev(7)] } });
    show();
    fireEvent.click(screen.getByRole('link', { name: /LIC10501/ }));
    expect(screen.getByTestId('where').textContent)
      .toBe('/cpm/investigation?loop=LIC10501&profile=12h&window=2026-11-05T13%3A45%3A00Z');
  });

  it("opens the event's own window size, not the Overview's", () => {
    page({ data: { events: [ev(9, { window_kind: '24h' })] } });
    show();   // the Overview shows 12h
    fireEvent.click(screen.getByRole('link', { name: /LIC10501/ }));
    expect(screen.getByTestId('where').textContent)
      .toBe('/cpm/investigation?loop=LIC10501&profile=24h&window=2026-11-05T13%3A45%3A00Z');
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
