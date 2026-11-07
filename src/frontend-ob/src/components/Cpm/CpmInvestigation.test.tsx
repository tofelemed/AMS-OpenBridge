// @vitest-environment jsdom
// CHG-141: the page. The context stays in the address, a named window opens or says it cannot, and the old section words are gone.
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
}));

vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', tags: {}, timezone: 'UTC' }] } }),
  useFleetRankings: () => ({ data: { loops: [] } }),
  useLatestGates: () => ({ ...state.latest, refetch: () => {} }),
  useCpmEvents: () => ({ data: { events: [] } }),
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
});
afterEach(cleanup);

describe('CpmInvestigation', () => {
  it('lays the page out as the reference does, with the old section words gone', () => {
    const { container } = page('/cpm/investigation?loop=FIC10401');
    for (const heading of ['Oscillation confirmed', 'Why this result', 'Next checks', 'Numeric evidence', 'Record your review'])
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeTruthy();
    expect(screen.getByText('Technical details & engine trace')).toBeTruthy();
    for (const gone of [/final conclusion/i, /key facts/i, /window browser/i, /record it/i, /no verdict/i, /fused cleanly/i, /reasoning chain/i])
      expect(container.textContent).not.toMatch(gone);
  });

  it('keeps the trend as built and adds its links', () => {
    page('/cpm/investigation?loop=FIC10401');
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
    const { container } = page('/cpm/investigation?loop=FIC10401');
    expect([...container.querySelectorAll('.cpm-signal__value')].map(v => v.textContent)).toEqual(['7.50', '8.00', '41.00', 'MAN']);
  });

  it('says a named window is not stored, never showing the newest', () => {
    state.at = { row: undefined, notFound: true };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    expect(screen.getByRole('heading', { name: 'That window is not stored' })).toBeTruthy();
    expect(screen.queryByText('Oscillation confirmed')).toBeNull();
    expect(screen.queryByText('Why this result')).toBeNull();
  });

  it('opens a named window at its exact end and calls it earlier', () => {
    state.at = { row: matrix(OLD_END) };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    expect(state.windowAtCalls).toContainEqual({ loop: 'FIC10401', end: OLD_END });
    expect(screen.getByText(/^Earlier window · 12 h · ends /)).toBeTruthy();
  });

  it('chooses a window from the band instead of Live and Historical', () => {
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.queryByRole('combobox', { name: 'Source' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Evaluated window' }), { target: { value: OLD_END } });
    expect(query().get('window')).toBe(OLD_END);
    expect(query().get('mode')).toBeNull();
  });

  it('switches 12h and 24h from the header, leaving the named window behind', () => {
    state.at = { row: matrix(OLD_END) };
    page(`/cpm/investigation?loop=FIC10401&window=${OLD_END}`);
    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(query().get('profile')).toBe('24h');
    expect(query().get('window')).toBeNull();
  });

  it('opens on the card of a gate named in the link, with that gate open', () => {
    page('/cpm/investigation?loop=FIC10401&gate=G10');
    expect(screen.getByRole('button', { name: /^Diagnostic evidence/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^G10 · Valve/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps the chosen card and gate in the address, and drops them with the loop', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: /^Fusion/ }));
    expect(query().get('tier')).toBe('Fusion');
    fireEvent.click(screen.getByRole('button', { name: /^G15 · Diagnosis band/ }));
    expect(query().get('gate')).toBe('G15');
    fireEvent.click(screen.getByRole('button', { name: 'change loop' }));
    expect(query().get('loop')).toBe('FIC20202');
    expect(query().get('tier')).toBeNull();
    expect(query().get('gate')).toBeNull();
  });

  it('opens Calculation proof as a dialog', () => {
    page('/cpm/investigation?loop=FIC10401&gate=G5');
    fireEvent.click(within(screen.getByRole('region', { name: 'Gates of this group' })).getByRole('button', { name: 'Calculation proof ↗' }));
    expect(within(screen.getByRole('dialog', { name: 'FIC10401 · G5' })).getByRole('button', { name: 'Evidence Workbench →' })).toBeTruthy();
  });

  it('goes from all 17 gates to one gate\'s proof', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: 'All 17 gate results →' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'All gate results · FIC10401' })).getByRole('button', { name: /^G5 ·/ }));
    expect(screen.queryByRole('dialog', { name: 'All gate results · FIC10401' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'FIC10401 · G5' })).toBeTruthy();
  });

  it('compares windows in a dialog and opens the one picked', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: 'Compare windows' }));
    const dialog = screen.getByRole('dialog', { name: 'Compare recent 12h windows' });
    fireEvent.click(within(dialog).getAllByRole('button', { name: /^Ends / })[1]);
    expect(query().get('window')).toBe(OLD_END);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens Hypothesis comparison from Record your review', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: 'Hypothesis comparison ↗' }));
    expect(screen.getByRole('dialog', { name: 'Hypothesis comparison' })).toBeTruthy();
  });

  it('links Related events to the loop', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: 'Related events ↗' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/events');
    expect(query().get('loop')).toBe('FIC10401');
  });

  it('opens every measure in a dialog', () => {
    page('/cpm/investigation?loop=FIC10401');
    fireEvent.click(screen.getByRole('button', { name: 'View all measures →' }));
    expect(screen.getByRole('dialog', { name: 'Numeric evidence · FIC10401' })).toBeTruthy();
  });

  it('keeps the health note honest, with the standard behind a ?', () => {
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.getByText('No health data for this window — not checked')).toBeTruthy();
    expect(screen.queryByText(/NE107/)).toBeNull();
  });

  it('puts the case filter under More', () => {
    page('/cpm/investigation?loop=FIC10401');
    expect(screen.queryByRole('combobox', { name: 'Analysis case' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.getByRole('combobox', { name: 'Analysis case' })).toBeTruthy();
  });

  it('offers no comparison until a window is open, and says why', () => {
    state.latest = { data: undefined, isError: false, isLoading: true };
    page('/cpm/investigation?loop=FIC10401');
    expect((screen.getByRole('button', { name: 'Compare windows' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('No evaluated window is open')).toBeTruthy();
  });
});
