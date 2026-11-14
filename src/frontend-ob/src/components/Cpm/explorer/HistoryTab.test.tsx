// @vitest-environment jsdom
/**
 * History (CHG-185, owner review item 6): one compact table — Period · Finding · Episodes · Peak score · Review state — with one
 * "Open in Loop Events ↗" per run; episodes open inline showing only what differs; the review state in Loop Events' words; a row or
 * period opens Historical; nothing of the old tab is lost.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmEventFrame, CpmLoop } from '../../../api/cpmApi';
import { fmtWhen } from '../blocks/whenText';

const nav = vi.hoisted(() => vi.fn());
const feed = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { type: 'button', onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmEvents: () => ({ data: { events: feed.events }, isLoading: false, isError: false }),
}));

import { HistoryTab } from './HistoryTab';
import { windowsText } from './historyQuery';

afterEach(() => { cleanup(); nav.mockReset(); });

const LOOP = { loopId: 'L1', tags: {}, links: [] } as unknown as CpmLoop;
const frame = (id: number, over: Partial<CpmEventFrame> = {}) => ({
  id, loop_id: 'L1', opened_at: '2026-11-05T10:15:00Z', closed_at: '2026-11-05T14:15:00Z',
  peak_diagnosis: 'STICTION', peak_confidence: 0.54, window_count: 3, window_kind: '12h', ack_state: 'UNACKNOWLEDGED',
  ...over,
}) as unknown as CpmEventFrame;
const tab = () => render(<MemoryRouter><HistoryTab loop={LOOP} /></MemoryRouter>);
const OPEN = fmtWhen('2026-11-05T10:15:00Z');
const headings = () => screen.getAllByRole('columnheader').map(h => {
  const c = h.cloneNode(true) as HTMLElement;
  c.querySelector('.ui-toggletip')?.remove();
  return c.textContent?.trim();
});
const sub = (row: HTMLElement) => within(row).getAllByRole('cell')[2].querySelector('.cpm-history__sub')?.textContent;
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('HistoryTab', () => {
  it('is one table: Period · Finding · Episodes · Peak score · Review state, and one action', () => {
    feed.events = [frame(7)];
    tab();
    expect(headings()).toEqual(['Period', 'Finding', 'Episodes', 'Peak score', 'Review state', 'Open']);
    const cells = within(bodyRows()[0]).getAllByRole('cell').map(c => c.textContent?.trim());
    expect(cells[0]).toBe(`${OPEN} → ${fmtWhen('2026-11-05T14:15:00Z')}`);
    expect(cells[1]).toMatch(/stiction/i);
    expect(cells[2]).toMatch(/^1/);
    expect(sub(bodyRows()[0])).toBe('3 × 12h windows');
    expect(cells[3]).toBe('54');
    expect(cells[5]).toBe('Open in Loop Events ↗');
  });

  it('says the review state as Loop Events does, in sentence case', () => {
    feed.events = [frame(7)];
    tab();
    const state = within(bodyRows()[0]).getAllByRole('cell')[4];
    expect(state.textContent).toContain('Unacknowledged');
    expect(state.textContent).not.toContain('UNACKNOWLEDGED');
    expect(state.querySelector('.cpm-pill--warn')).not.toBeNull();
  });

  it('never says "window(s)", and names a mixed run\'s sizes', () => {
    expect(windowsText(1, ['24h'])).toBe('1 × 24h window');
    expect(windowsText(4, ['12h', '12h'])).toBe('4 × 12h windows');
    expect(windowsText(136, ['24h', '12h'])).toBe('136 windows of 12h and 24h');
    feed.events = [frame(7)];
    const { container } = tab();
    expect(container.textContent).not.toContain('window(s)');
  });

  it('opens Historical on the span from the period, and Loop Events on the newest episode from its one link', () => {
    feed.events = [frame(7)];
    tab();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${OPEN}.*show in Historical$`) }));
    const hist = String(nav.mock.calls[0][0]);
    expect(hist).toContain('/cpm/historical');
    expect(hist).toContain('loop=L1');
    expect(hist).toContain('from=2026-11-05T10%3A15%3A00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Open in Loop Events ↗' }));
    expect(nav).toHaveBeenCalledTimes(2);
    const ev = String(nav.mock.calls[1][0]);
    expect(ev).toContain('/cpm/events');
    expect(ev).toContain('event=7');
    expect(ev).toContain('loop=L1');
  });

  it('has Open Historical → for the loop', () => {
    feed.events = [frame(7)];
    tab();
    fireEvent.click(screen.getByRole('button', { name: 'Open Historical →' }));
    expect(String(nav.mock.calls[0][0])).toMatch(/^\/cpm\/historical\?loop=L1$/);
  });

  it('opens a run\'s episodes inline as lines with only their period and score, and keeps one link per run', () => {
    feed.events = [
      frame(9, { closed_at: '2026-11-05T09:00:00Z', peak_confidence: 0.5, window_count: 1, window_kind: '24h' }),
      frame(8, { opened_at: '2026-11-05T06:00:00Z', closed_at: '2026-11-05T08:00:00Z', peak_confidence: 0.35, window_count: 1, window_kind: '24h' }),
    ];
    tab();
    expect(screen.getByText('End before start')).toBeTruthy();
    expect(sub(bodyRows()[0])).toBe('2 × 24h windows');
    fireEvent.click(screen.getByRole('button', { name: 'Show the 2 episodes' }));
    expect(screen.getByRole('button', { name: 'Hide the 2 episodes' }).getAttribute('aria-expanded')).toBe('true');
    const [, first, second] = bodyRows();
    expect(first.textContent).toContain('end before start');
    expect(first.textContent).toContain('50');
    expect(second.textContent).toContain(`${fmtWhen('2026-11-05T06:00:00Z')} → ${fmtWhen('2026-11-05T08:00:00Z')}`);
    expect(second.textContent).toContain('35');
    // nothing repeated from the run: no finding, no windows when every episode is 1 × 24h, no state, no link
    expect(second.textContent).not.toMatch(/stiction|window|Unacknowledged|Loop Events/i);
    expect(screen.getAllByRole('button', { name: 'Open in Loop Events ↗' })).toHaveLength(1);
  });

  it('shows an episode\'s windows when they differ inside the run', () => {
    feed.events = [
      frame(9, { window_count: 1, window_kind: '24h' }),
      frame(8, { window_count: 3, window_kind: '12h' }),
    ];
    tab();
    expect(sub(bodyRows()[0])).toBe('4 windows of 12h and 24h');
    fireEvent.click(screen.getByRole('button', { name: 'Show the 2 episodes' }));
    const [, first, second] = bodyRows();
    expect(first.textContent).toContain('1 × 24h window');
    expect(second.textContent).toContain('3 × 12h windows');
  });
});
