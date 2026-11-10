// @vitest-environment jsdom
// CHG-141: the page. The context stays in the address, a named window opens or says it cannot, and the old section words are gone.
// CHG-160 (owner review): five tabs in the engineer's order, Result → Evidence → Windows → Hypotheses → Review.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmGateCell, CpmGateMatrix } from '../../api/cpm/gates';
import { row } from './evidence/windowFixtures';
import type { WindowOption } from './evidence/useEvidenceWindows';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));

const END = '2026-11-05T10:15:00Z';
const OLD_END = '2026-11-05T10:00:00Z';
const cell = (key: string, status: string): CpmGateCell => ({ key, name: key, tier: 'short', status, reason: null, methodRunId: `run-${key}` });
const GATES = [cell('G0', 'PASS'), cell('G1', 'PASS'), cell('G5', 'WARN'), cell('G10', 'PASS'), cell('G15', 'CONFIRMED')];
const matrix = (end = END, over: Partial<CpmGateMatrix> = {}) => row(end, {
  diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1, gates: GATES, methodRunIds: { G15: `fused-${end}` },
  metrics: { good_error_pct: 0.13 }, windowStart: '2026-11-04T22:15:00Z', verdictV2: { legacy: true } as CpmGateMatrix['verdictV2'], ...over,
});
const option = (end: string, label: string): WindowOption => ({
  windowEnd: end, windowStart: null, kind: '12h', tier: 'fused', label, tone: 'muted', ageMs: 0, sampleCount: null, methodRunIds: { G15: `fused-${end}` },
  hasRunIds: true, gates: [], flags: undefined, methodEligibility: null, purpose: null, diagnosis: 'CONFIRMED_OSCILLATION',
});

const state = vi.hoisted(() => ({
  latest: {} as { data?: unknown; isError?: boolean; isLoading?: boolean; error?: unknown },
  at: {} as { row?: unknown; notFound?: boolean; isLoading?: boolean; isError?: boolean },
  points: [] as Array<Record<string, unknown>>,
  windowAtCalls: [] as Array<{ loop: unknown; end: unknown }>,
  episodes: [] as Array<{ id: number; opened_at: string; closed_at: string | null; ack_state: string }>,
  eventsRead: true,
}));

vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', tags: {}, timezone: 'UTC' }] } }),
  useFleetRankings: () => ({ data: { loops: [] } }),
  useLatestGates: () => ({ ...state.latest, refetch: () => {} }),
  useCpmEvents: (q: { openOnly?: boolean }) => (state.eventsRead ? { data: { events: q.openOnly ? state.episodes.filter(e => !e.closed_at) : state.episodes } } : {}),
  useCpmTrend: () => ({ data: { points: state.points }, isLoading: false, isError: false }),
}));
vi.mock('./evidence/useEvidenceWindows', () => ({
  useEvidenceWindows: () => ({
    options: [option(END, 'newest window'), option(OLD_END, 'older window')], isLoading: false, error: null, refetch: () => {}, hasMore: false, loadMore: () => {}, isLoadingMore: false,
  }),
}));
vi.mock('./evidence/useWindowAt', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useWindowAt')>()),
  useWindowAt: (loop: string | undefined, _k: string, end: string | null) => {
    state.windowAtCalls.push({ loop, end });
    return { ...state.at, rerun: false, others: [], error: null, refetch: () => {} };
  },
  usePreviousEnd: () => ({ end: null, isLoading: false, isError: false }),
}));
vi.mock('./health/useInstrumentHealth', () => ({
  useInstrumentHealth: () => ({ data: undefined, isError: false }),
  useInstrumentHealthHistory: () => ({ data: { intervals: [] }, isLoading: false }),
}));
vi.mock('./health/HealthLane', () => ({ HealthLane: () => null }));
vi.mock('./health/TransmitterHealthPanel', () => ({ loopHealthSummary: () => ({ label: 'HEALTH OK' }) }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ params: {}, active: false, matches: () => true, set: () => {} }) }));
vi.mock('./context/LoopBand', () => ({
  LoopBand: (p: { children?: React.ReactNode; end?: React.ReactNode; onLoop: (l: string) => void }) => (
    <div><button onClick={() => p.onLoop('FIC20202')}>change loop</button>{p.children}{p.end}</div>
  ),
}));
vi.mock('./trend/SignalTrend', () => ({ default: (p: { foot?: React.ReactNode; resetLabel?: string; height?: number }) => <div data-testid="trend" data-height={p.height} data-reset={p.resetLabel}>{p.foot}</div> }));
vi.mock('./investigation/LoopNotes', () => ({
  LoopNotes: (p: { title?: string; saveLabel?: string; links?: React.ReactNode }) => <section><h2>{p.title}</h2><span>{p.saveLabel}</span>{p.links}</section>,
}));

import { CpmInvestigation } from './CpmInvestigation';

const Where: React.FC = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; };
const page = (url: string) => render(<MemoryRouter initialEntries={[url]}><CpmInvestigation /><Where /></MemoryRouter>);
const query = () => new URLSearchParams(screen.getByTestId('where').textContent!.split('?')[1] ?? '');

beforeEach(() => {
  state.latest = { data: matrix(), isError: false, isLoading: false };
  state.at = { row: undefined, notFound: false, isLoading: false, isError: false };
  state.points = [{ ts: 1, pv: 10, sp: 10, op: 30, mode: 'AUTO' }];
  state.windowAtCalls = [];
  state.episodes = [];
  state.eventsRead = true;
});
afterEach(cleanup);

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const selected = () => screen.getAllByRole('tab').find(t => t.getAttribute('aria-selected') === 'true')?.textContent;

describe('CpmInvestigation', () => {
  // CHG-160 (owner review): the engineer's path, one step per tab, Result first
  it('walks the investigation in five tabs, Result first, with the old section words gone', () => {
    const { container } = page('/cpm/investigation?loop=FIC10401');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Result', 'Evidence', 'Windows', 'Hypotheses', 'Review']);
    expect(selected()).toBe('Result');
    expect(screen.getByRole('heading', { level: 2, name: 'Oscillation confirmed' })).toBeTruthy();
    for (const gone of [/technical details/i, /engine trace/i, /numeric evidence/i, /start with evidence/i, /final conclusion/i, /key facts/i,
      /window browser/i, /record it/i, /no verdict/i, /fused cleanly/i, /reasoning chain/i])
      expect(container.textContent).not.toMatch(gone);
  });

  it('goes to the next step from the foot of each tab, and keeps the step in the address', () => {
    page('/cpm/investigation?loop=FIC10401');
    for (const next of ['Evidence', 'Windows', 'Hypotheses', 'Review']) {
      fireEvent.click(screen.getByRole('button', { name: `Next: ${next} →` }));
      expect(query().get('tab')).toBe(next);
      expect(selected()).toBe(next);
    }
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });

  it('has no ? on the title, no Compare windows or More, and 32 px controls', () => {
    const { container } = page('/cpm/investigation?loop=FIC10401');
    expect(screen.getByRole('heading', { level: 1, name: 'Investigation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Investigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Compare windows' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull();
    expect(container.querySelector('.cpm-screen')?.classList.contains('cpm-compact')).toBe(true);
  });

  it('puts the case filter in the band, named by its options as the other band controls are', () => {
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.getByRole('combobox', { name: 'Analysis case' })).toBeTruthy();
    expect(screen.queryByText('Case')).toBeNull();
  });

  it('keeps the trend as built and adds its links', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Evidence');
    const trend = screen.getByTestId('trend');
    expect(trend.getAttribute('data-height')).toBe('260');
    expect(trend.getAttribute('data-reset')).toBe('Full window');
    fireEvent.click(within(trend).getByRole('button', { name: 'Evidence Replay ↗' }));
    const q = query();
    expect(screen.getByTestId('where').textContent).toContain('/cpm/replay');
    expect([q.get('loop'), q.get('window'), q.get('kind')]).toEqual(['FIC10401', END, '12h']);
  });

  it('shows the values at the window end, from the same trend', () => {
    state.points = [{ ts: 1, pv: 1, sp: 1, op: 1, mode: 'AUTO' }, { ts: 2, pv: 7.5, sp: 8, op: 41, mode: 'MAN' }];
    const { container } = page('/cpm/investigation?loop=FIC10401&tab=Evidence');
    expect([...container.querySelectorAll('.cpm-signal__value')].map(v => v.textContent)).toEqual(['7.50', '8.00', '41.00', 'MAN']);
  });

  it('says a named window is not stored, never showing the newest', () => {
    state.at = { row: undefined, notFound: true };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    expect(screen.getByRole('heading', { name: 'That window is not stored' })).toBeTruthy();
    expect(screen.queryByText('Oscillation confirmed')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('opens a named window at its exact end and says it is an earlier one', () => {
    state.at = { row: matrix(OLD_END) };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    expect(state.windowAtCalls).toContainEqual({ loop: 'FIC10401', end: OLD_END });
    expect(screen.getByText('Earlier window')).toBeTruthy();
  });

  it('chooses a window from the band instead of Live and Historical', () => {
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Evaluated window' }), { target: { value: OLD_END } });
    expect(query().get('window')).toBe(OLD_END);
    expect(query().get('mode')).toBeNull();
  });

  it('switches 12h and 24h from the header, leaving the named window behind and keeping the step', () => {
    state.at = { row: matrix(OLD_END) };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}&tab=Windows`);
    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(query().get('profile')).toBe('24h');
    expect(query().get('window')).toBeNull();
    expect(query().get('tab')).toBe('Windows');
  });

  it('opens the Evidence tab on the card of a gate named in the link, with that gate open', () => {
    page('/cpm/investigation?loop=FIC10401&gate=G10');
    expect(selected()).toBe('Evidence');
    expect(screen.getByRole('button', { name: /^Diagnostic evidence/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^G10 · Valve/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the chosen card and gate in the address, and drops them with the loop, keeping the step', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Evidence');
    fireEvent.click(screen.getByRole('button', { name: /^Fusion/ }));
    expect(query().get('tier')).toBe('Fusion');
    fireEvent.click(screen.getByRole('button', { name: /^G15 · Diagnosis band/ }));
    expect(query().get('gate')).toBe('G15');
    fireEvent.click(screen.getByRole('button', { name: 'change loop' }));
    expect([query().get('loop'), query().get('tier'), query().get('gate'), query().get('tab')]).toEqual(['FIC20202', null, null, 'Evidence']);
  });

  it('opens Calculation proof as a dialog named by the gate', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Evidence&gate=G5');
    fireEvent.click(within(screen.getByRole('region', { name: 'Gates of this group' })).getByRole('button', { name: 'Calculation proof ↗' }));
    const dialog = screen.getByRole('dialog', { name: 'G5 · Oscillation (ACF)' });
    expect(within(dialog).getByRole('button', { name: 'Workbench ↗' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Replay ↗' })).toBeTruthy();
  });

  it('goes from all the gates to one gate\'s proof', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Evidence');
    fireEvent.click(screen.getByRole('button', { name: 'All 5 gates →' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'All 5 gates' })).getByRole('button', { name: /^G5 ·/ }));
    expect(screen.queryByRole('dialog', { name: 'All 5 gates' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'G5 · Oscillation (ACF)' })).toBeTruthy();
  });

  it('compares windows on the Windows tab and opens the one picked there', () => {
    page('/cpm/investigation?loop=FIC10401');
    tab('Windows');
    expect(screen.getByRole('heading', { level: 2, name: 'Recent 12h windows' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Ends / })[1]);
    expect(query().get('window')).toBe(OLD_END);
    expect(query().get('tab')).toBe('Windows');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the window\'s measures on the Windows tab, in place of Numeric evidence', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Windows');
    const good = screen.getByText('Good-error time').closest('tr')!;
    expect(good.querySelectorAll('td')[2].textContent).toBe('13.0 %');
    expect(screen.queryByRole('button', { name: /View all measures/ })).toBeNull();
  });

  it('shows the hypotheses on their own tab', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Hypotheses');
    expect(screen.getByRole('heading', { level: 2, name: 'Family and detector scores' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('leads the Review tab with the result\'s next check', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Review');
    expect(screen.getByText('Compare PV, SP and OP over this window.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Record your review' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hypothesis comparison ↗' })).toBeNull();
  });

  it('runs the checks that stay on the page as tabs: Signals opens Evidence', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Review');
    fireEvent.click(screen.getByRole('button', { name: 'Signals ↗' }));
    expect(selected()).toBe('Evidence');
  });

  it('links Related events to the loop alone when no episode was open', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Review');
    fireEvent.click(screen.getByRole('button', { name: 'Related events ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/events');
    expect(query().get('loop')).toBe('FIC10401');
    expect(query().get('event')).toBeNull();
  });

  it('carries the episode open at this window into Related events', () => {
    state.episodes = [{ id: 77, opened_at: '2026-11-05T00:00:00Z', closed_at: null, ack_state: 'UNACKNOWLEDGED' }];
    page('/cpm/investigation?loop=FIC10401&tab=Review');
    fireEvent.click(screen.getByRole('button', { name: 'Related events ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/events');
    expect([query().get('loop'), query().get('event'), query().get('filter')]).toEqual(['FIC10401', '77', 'all']);
  });

  it('carries a closed episode too, when it was open at this older window', () => {
    state.at = { row: matrix(OLD_END) };
    state.episodes = [{ id: 12, opened_at: '2026-11-05T09:00:00Z', closed_at: '2026-11-05T10:05:00Z', ack_state: 'ACKNOWLEDGED' }];
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}&tab=Review`);
    fireEvent.click(screen.getByRole('button', { name: 'Related events ↗' }));
    expect(query().get('event')).toBe('12');
  });

  it('does not claim No open episode while the episodes are unread', () => {
    state.eventsRead = false;
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.queryByText('No open episode')).toBeNull();
  });

  it('reads a no-fault window as a result on every tab', () => {
    state.latest = { data: matrix(END, { diagnosis: 'INSUFFICIENT_EVIDENCE', metrics: { good_error_pct: 0.91, auto_pct: 1, completeness: 1 } }), isError: false, isLoading: false };
    const { container } = page('/cpm/investigation?loop=FIC10401');
    expect(screen.getByRole('heading', { level: 2, name: 'No fault identified' })).toBeTruthy();
    expect(screen.getByText('91 %')).toBeTruthy();
    expect(screen.getByText('None identified')).toBeTruthy();
    tab('Evidence');
    expect(screen.getByRole('button', { name: /^Diagnostic evidence/ }).getAttribute('aria-pressed')).toBe('true');
    tab('Review');
    expect(screen.getByRole('button', { name: 'Signals ↗' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/data stopped|signal mapping|too few qualified samples/i);
  });

  it('follows the newest window again when it is picked', () => {
    state.at = { row: matrix(OLD_END) };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    fireEvent.change(screen.getByRole('combobox', { name: 'Evaluated window' }), { target: { value: END } });
    expect(query().get('window')).toBeNull();
  });

  it('explains a manual exclusion in Mode context, with Historical on the same window', () => {
    state.latest = { data: matrix(END, { diagnosis: 'EXCLUDED_MODE' }), isError: false, isLoading: false };
    page('/cpm/investigation?loop=FIC10401&tab=Review');
    fireEvent.click(screen.getByRole('button', { name: 'Mode context ↗' }));
    const dialog = screen.getByRole('dialog', { name: 'Mode context' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Historical ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/historical');
    expect(query().get('window')).toBe(END);
  });

  it('keeps the health note honest, with the standard behind a ?', () => {
    page('/cpm/investigation?loop=FIC10401&tab=Evidence');
    expect(screen.getByText('No health data for this window — not checked')).toBeTruthy();
    expect(screen.queryByText(/NE107/)).toBeNull();
  });
});
