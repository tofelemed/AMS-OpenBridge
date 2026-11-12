// CHG-177 (owner review, Overview v2, the approved sample docs/theme/redesign/samples/overview-v2-proposal.html and the
// answers of 12 Nov 2026): one grid; How to read beside 12h | 24h in three titled parts (it took the page-foot Calculation
// basis and the chart's ?); no page foot, no Top-priority finding, no empty "Select a loop" panel; the chosen loop beside
// the queue rows, or under the one-line queue at full width when it comes from ?loop=; a missing loop is one line;
// Recent events last.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmRankedLoop } from '../../api/cpmApi';

const { rankingsHook, loopHook, kpisHook } = vi.hoisted(() => ({ rankingsHook: vi.fn(), loopHook: vi.fn(), kpisHook: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={() => onClick?.()}>{children}</button>,
}));
vi.mock('../../hooks/useCpm', () => ({
  useFleetRankings: (...a: unknown[]) => rankingsHook(...a),
  useCpmLoop: (id: string | undefined) => loopHook(id),
}));
vi.mock('./kpi/useFleetKpis', () => ({ useFleetKpis: (...a: unknown[]) => kpisHook(...a) }));
vi.mock('./plantScope', () => ({
  useCpmScope: () => ({ site: '', area: '', unit: '', active: false, params: {}, matches: () => true, set: () => undefined }),
}));
vi.mock('./overview/OperatingPicture', () => ({ default: () => <div data-testid="cards" /> }));
vi.mock('./overview/LoopFocus', () => ({ default: ({ loopId }: { loopId: string }) => <section data-testid="focus">{loopId}</section> }));
vi.mock('./overview/RecentEvents', () => ({ default: () => <section data-testid="events" /> }));

import { CpmOverview } from './CpmOverview';

const loop = (id: string): CpmRankedLoop => ({
  rank: 1, loopId: id, displayName: `Loop ${id}`, site: 'hdpe', area: 'section_400', unit: null, loopType: 'FIC', criticality: 'high',
  windowEnd: '2026-11-12T07:00:00Z', diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1,
  metrics: { effortRatio: null, triangularity: null, horchOddness: null, acfPeriodS: null, goodErrorPct: 0.41, mae: 1 },
  observabilityFlags: [], leadingHypothesis: null, priority: 'HIGH', ackState: null,
} as unknown as CpmRankedLoop);
const KPIS = {
  basis: { windowKind: '12h', freshSeconds: 3600, normalModeMin: 0.95, saturationMax: 0.1, g0CompletenessMin: 0.95, g0BadQualityMax: 0.5,
    findingBands: ['SUSPECTED', 'CONFIRMED'], symptomBands: [], noFaultCodes: [], reference: '' },
  monitored: 241, kpis: [],
};
const ranked = (loops: CpmRankedLoop[], shelvedCount = 0) =>
  rankingsHook.mockReturnValue({ data: { loops, shelvedCount }, isLoading: false, isError: false, error: null, refetch: vi.fn() });

beforeEach(() => {
  ranked([]);
  loopHook.mockReturnValue({ data: undefined, isLoading: false });
  kpisHook.mockReturnValue({ data: KPIS, isError: false });
});
afterEach(cleanup);

const Where = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const show = (url = '/cpm') => render(<MemoryRouter initialEntries={[url]}><CpmOverview /><Where /></MemoryRouter>);
const work = (c: HTMLElement) => c.querySelector('.cpm-ov-work')!;

describe('Overview v2 (CHG-177)', () => {
  it('has no page foot: no Calculation basis and no Configuration & coverage', () => {
    const { container } = show();
    expect(screen.queryByText('Calculation basis')).toBeNull();
    expect(screen.queryByText(/Configuration & coverage/)).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('has no Top-priority finding, even with rows', () => {
    ranked([loop('FIC10301')]);
    show();
    expect(screen.queryByText('Top-priority finding')).toBeNull();
  });

  it('puts How to read top right, before 12h | 24h', () => {
    const { container } = show();
    const actions = container.querySelector('.cpm-workspace-header__actions')!;
    const howTo = within(actions as HTMLElement).getByRole('button', { name: 'How to read' });
    const toggle = within(actions as HTMLElement).getByRole('group', { name: 'Fused evaluation window' });
    expect(howTo.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('How to read holds the cards, the queue and the trend, in three titled parts', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dialog = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['The cards', 'Loops requiring review', 'The trend']);
    const text = dialog.textContent ?? '';
    expect(text).toContain('Each monitored loopCounted once, from its newest 12h result, at most 60 min old.');
    expect(text).toContain('In auto modeAUTO / CASCADE ≥ 95 % of the window.');
    expect(text).toContain('Saturated / at limitOP fully open or closed > 10 % of the window.');
    expect(text).toContain('FindingsSuspected or confirmed.');
    expect(text).toContain('OrderPriority (loop criticality × finding severity), then time outside the good-error band, then how long the condition has persisted, then evidence score.');
    expect(text).toContain('Shelved loopsLeft out; listed in Loop Events.');
    expect(text).toContain('Shaded bandThe lowest-to-highest PV inside each plotted point.');
  });

  it('with an empty queue and no loop chosen, draws no chosen-loop panel and no Select a loop', () => {
    const { container } = show();
    expect(screen.queryByTestId('focus')).toBeNull();
    expect(screen.queryByText('Select a loop')).toBeNull();
    expect(work(container).children).toHaveLength(1);
  });

  it('with an empty queue and ?loop=, the chosen loop takes the full width under the queue line', () => {
    loopHook.mockImplementation((id: string | undefined) => ({ data: id ? { loopId: 'FIC10301', displayName: 'Flow controller' } : undefined, isLoading: false }));
    const { container } = show('/cpm?loop=fic10301');
    expect(screen.getByTestId('focus').textContent).toBe('FIC10301');
    expect(work(container).className).toContain('cpm-ov-work--solo');
    expect(work(container).lastElementChild).toBe(screen.getByTestId('focus'));
  });

  it('with rows, the top row is chosen by default and sits beside the rows', () => {
    ranked([loop('FIC10301'), loop('PIC40102')]);
    const { container } = show();
    expect(screen.getByTestId('focus').textContent).toBe('FIC10301');
    expect(work(container).className).not.toContain('cpm-ov-work--solo');
  });

  it('a row click chooses that loop, kept in ?loop=', () => {
    ranked([loop('FIC10301'), loop('PIC40102')]);
    const { container } = show();
    fireEvent.click(container.querySelectorAll('.cpm-queue-row')[1].querySelector('.cpm-pill')!);
    expect(screen.getByTestId('focus').textContent).toBe('PIC40102');
    expect(screen.getByTestId('where').textContent).toBe('/cpm?loop=PIC40102');
  });

  it('a loop that does not exist gives one line', () => {
    const { container } = show('/cpm?loop=ZZZ999');
    expect(container.querySelector('.cpm-empty-line')!.textContent).toBe('No loop ZZZ999');
    expect(screen.queryByRole('button', { name: 'Open Performance' })).toBeNull();
    expect(container.querySelector('.cpm-empty')).toBeNull();
  });

  it('View all opens Performance on Needs attention, carrying the window', () => {
    show('/cpm?window=24h');
    fireEvent.click(screen.getByRole('button', { name: 'View all →' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/performance?window=24h&rows=attention');
  });

  it('lays the page out as the cards, the queue with the chosen loop, then Recent events last', () => {
    ranked([loop('FIC10301')]);
    const { container } = show();
    const parts = [...container.querySelector('.cpm-screen')!.children];
    expect(parts.map(e => e.getAttribute('data-testid') ?? e.className.split(' ')[0])).toEqual(['cpm-workspace-header', 'cards', 'cpm-ov-work', 'events']);
  });
});
