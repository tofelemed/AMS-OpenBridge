// @vitest-environment jsdom
/** History: episodes with period, finding, windows, peak score and state; a row opens Historical, an event Loop Events. */
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

afterEach(() => { cleanup(); nav.mockReset(); });

const LOOP = { loopId: 'L1', tags: {}, links: [] } as unknown as CpmLoop;
const frame = (id: number, over: Partial<CpmEventFrame> = {}) => ({
  id, loop_id: 'L1', opened_at: '2026-11-05T10:15:00Z', closed_at: '2026-11-05T14:15:00Z',
  peak_diagnosis: 'STICTION', peak_confidence: 0.54, window_count: 3, window_kind: '12h', ack_state: 'UNACKNOWLEDGED',
  ...over,
}) as unknown as CpmEventFrame;
const tab = () => render(<MemoryRouter><HistoryTab loop={LOOP} /></MemoryRouter>);

describe('HistoryTab', () => {
  it('lists an episode with its period, finding, windows, peak score and state', () => {
    feed.events = [frame(7)];
    tab();
    const row = screen.getByRole('button', { name: new RegExp(fmtWhen('2026-11-05T10:15:00Z')) });
    expect(row.textContent).toContain(`${fmtWhen('2026-11-05T10:15:00Z')} → ${fmtWhen('2026-11-05T14:15:00Z')}`);
    expect(row.textContent).toMatch(/3 × 12h window\(s\)/);
    expect(row.textContent).toMatch(/peak evidence score 54/);
    expect(row.textContent).toContain('UNACKNOWLEDGED');
  });

  it('opens Historical on the episode span from the row, and Loop Events on that episode from its link', () => {
    feed.events = [frame(7)];
    tab();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(fmtWhen('2026-11-05T10:15:00Z')) }));
    const hist = String(nav.mock.calls[0][0]);
    expect(hist).toContain('/cpm/historical');
    expect(hist).toContain('loop=L1');
    expect(hist).toContain('from=2026-11-05T10%3A15%3A00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Loop Events ↗' }));
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

  it('keeps run grouping and flags an impossible span', () => {
    feed.events = [
      frame(9, { closed_at: '2026-11-05T09:00:00Z' }),
      frame(8, { opened_at: '2026-11-05T06:00:00Z', closed_at: '2026-11-05T08:00:00Z' }),
    ];
    tab();
    expect(screen.getByText('END BEFORE START')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /^▸ 2 episodes/ });
    fireEvent.click(toggle);
    // each collapsed episode links to its own event
    expect(screen.getAllByRole('button', { name: 'Loop Events ↗' }).length).toBe(3);
    expect(within(document.body).getAllByText(/→|end before start/).length).toBeGreaterThan(0);
  });
});
