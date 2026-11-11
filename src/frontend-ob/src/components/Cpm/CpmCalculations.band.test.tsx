// @vitest-environment jsdom
// CHG-166 (owner review, the approved sample calculations-proposal.html and its four answers): the header is the eyebrow and
// the title; the band a card with the loop, "12h fused / 24h fused", the Workbench's window list with ‹ › (‹ newer, › older,
// past the oldest loaded › loads older), the verdict, and Investigation ↗ at its end; the foot strip says the window, its
// samples and the run once, with Run details (a dialog, the versions in it). Deep links keep ?loop= ?kind= ?window= ?metric=.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MID, NOW, PAST, atResult, kpiRow, matrix, windowList } from './calc/calcTestFixtures';

const { state } = vi.hoisted(() => ({
  state: {
    matrix: null as unknown, latestError: false, row: null as unknown, at: null as unknown, atArgs: [] as unknown[],
    windows: null as unknown, windowsArgs: [] as unknown[],
  },
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./context/LoopBand', () => ({
  LoopBand: (p: { loopId?: string; children?: React.ReactNode; end?: React.ReactNode; card?: boolean }) =>
    React.createElement('div', { 'data-testid': 'band', 'data-card': String(!!p.card) }, p.loopId, p.children,
      React.createElement('div', { 'data-testid': 'band-end' }, p.end)),
}));
vi.mock('./evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { readiness: 'COMPLETE' } }) }));
vi.mock('./evidence/useWindowAt', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useWindowAt')>()),
  useWindowAt: (...a: unknown[]) => { state.atArgs = a; return state.at; },
}));
vi.mock('./evidence/useEvidenceWindows', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useEvidenceWindows')>()),
  useEvidenceWindows: (...a: unknown[]) => { state.windowsArgs = a; return state.windows; },
}));
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', timezone: 'UTC', loopType: 'FIC', engineering: { pvUnit: 'kg/h' } }] } }),
  useLatestGates: () => (state.latestError ? { data: undefined, isError: true, error: new Error('boom') } : { data: state.matrix, isError: false }),
  useCpmKpis: () => ({ data: { samples: [state.row] }, isError: false }),
  useCpmKpisRange: () => ({ data: { samples: [state.row] }, isError: false, isLoading: false }),
  useCpmCalculations: () => ({ data: { calculationVersion: '3.0.0', gates: [] } }),
}));

import { CpmCalculations } from './CpmCalculations';

const Where: React.FC = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + decodeURIComponent(l.search)}</output>; };
const mount = (search = '?loop=FIC10401') => render(
  <MemoryRouter initialEntries={[`/cpm/calculations${search}`]}><CpmCalculations /><Where /></MemoryRouter>);
const url = () => screen.getByTestId('where').textContent ?? '';
const band = () => within(screen.getByTestId('band'));
const at = (end: string) => { state.at = atResult(matrix(end)); state.row = kpiRow(end); return `?loop=FIC10401&window=${encodeURIComponent(end)}`; };

beforeEach(() => {
  state.matrix = matrix(NOW);
  state.latestError = false;
  state.row = kpiRow(NOW);
  state.at = atResult(undefined);
  state.windows = windowList();
});
afterEach(cleanup);

describe('Calculations header and band', () => {
  it('heads the page with the eyebrow and the title only, on a compact page', () => {
    const { container } = mount();
    expect(screen.getByRole('heading', { level: 1, name: 'Calculations' })).toBeTruthy();
    expect(screen.getByText('Understand the cause')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Calculations' })).toBeNull();
    expect(screen.queryByText(/Every calculated metric for a loop/)).toBeNull();
    expect(screen.queryByText(/Back to Investigation/)).toBeNull();
    expect(container.querySelector('.cpm-screen.cpm-compact')).toBeTruthy();
  });

  it('draws the band as a card and ends it with Investigation, which opens this window', () => {
    mount();
    expect(screen.getByTestId('band').dataset.card).toBe('true');
    fireEvent.click(within(screen.getByTestId('band-end')).getByText('Investigation ↗'));
    // the page stays mounted here (no routes), so its own ?metric= may follow
    expect(url().startsWith(`/cpm/investigation?loop=FIC10401&profile=12h&window=${NOW}`)).toBe(true);
  });

  it('names the window kinds as 12h fused and 24h fused, and a change opens the newest window of that kind', () => {
    mount(`${at(PAST)}&metric=CPLM-010`);
    const kind = band().getByLabelText('Window kind') as HTMLSelectElement;
    expect([...kind.options].map(o => o.text)).toEqual(['12h fused', '24h fused']);
    fireEvent.change(kind, { target: { value: '24h' } });
    expect(url()).toContain('kind=24h');
    expect(url()).not.toContain('window=');
    expect(url()).toContain('metric=CPLM-010');
  });

  it('lists the evaluated windows of the kind, and a choice names that window', () => {
    mount();
    expect(state.windowsArgs.slice(0, 3)).toEqual(['FIC10401', '12h', 'fused']);
    const select = band().getByLabelText('Evaluated window') as HTMLSelectElement;
    expect([...select.options].map(o => o.text)).toEqual(['5 Nov 13:45 · Excluded', '5 Nov 01:45 · Excluded', '4 Nov 13:45 · Excluded']);
    expect(select.value).toBe(NOW);
    fireEvent.change(select, { target: { value: MID } });
    expect(url()).toContain(`window=${MID}`);
  });

  it('follows the newest window again when the newest is chosen', () => {
    mount(at(PAST));
    fireEvent.change(band().getByLabelText('Evaluated window'), { target: { value: NOW } });
    expect(url()).not.toContain('window=');
  });

  it('steps to the newer window with ‹ and the older one with ›', () => {
    mount(at(MID));
    fireEvent.click(band().getByText('›'));
    expect(url()).toContain(`window=${PAST}`);
    cleanup();
    mount(at(PAST));
    fireEvent.click(band().getByText('‹'));
    expect(url()).toContain(`window=${MID}`);
  });

  it('has no newer step on the newest window, and loads older windows past the oldest loaded', () => {
    mount();
    expect((band().getByText('‹') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    mount(at(PAST));
    expect((band().getByText('›') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const loadMore = vi.fn();
    state.windows = windowList({ hasMore: true, loadMore });
    mount(at(PAST));
    fireEvent.click(band().getByText('›'));
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('says the verdict once, in the window dropdown, and leaves the versions to Run details', () => {
    mount();
    const select = band().getByLabelText('Evaluated window') as HTMLSelectElement;
    expect(select.selectedOptions[0].text).toBe('5 Nov 13:45 · Excluded');
    expect(band().queryByText('Excluded: loop not in automatic')).toBeNull();
    expect(screen.queryByText(/Calculation v3\.0\.0/)).toBeNull();
  });

  it('says the verdict is unavailable when it cannot be read', () => {
    state.latestError = true;
    mount();
    expect(band().getByText('Verdict unavailable')).toBeTruthy();
  });

  it('keeps a link that names the kind, the window and the metric', () => {
    state.at = atResult(matrix(PAST, { windowKind: '24h' }));
    mount(`?loop=FIC10401&kind=24h&window=${encodeURIComponent(PAST)}&metric=CPLM-010`);
    expect(state.atArgs.slice(0, 3)).toEqual(['FIC10401', '24h', PAST]);
    expect(state.windowsArgs[1]).toBe('24h');
    expect((band().getByLabelText('Window kind') as HTMLSelectElement).value).toBe('24h');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Mean absolute error' })).toBeTruthy();
  });

  it('asks for a loop in plain words when none is chosen', () => {
    mount('');
    expect(screen.getByText('Choose a loop above to see its calculations.')).toBeTruthy();
    expect(screen.queryByText('Investigation ↗')).toBeNull();
  });
});

describe('Calculations foot strip and dialogs', () => {
  it('says the window, its samples and the run once, at the foot of the list', () => {
    mount();
    const foot = document.querySelector('.cpm-calc-foot') as HTMLElement;
    expect(within(foot).getByText('12 h window · 5 Nov 01:45 → 5 Nov 13:45 UTC · 8,639 samples · Original run')).toBeTruthy();
    expect(band().queryByText(/12 h window/)).toBeNull();
  });

  it('names a re-run in the foot', () => {
    state.row = kpiRow(PAST);
    state.at = atResult(matrix(PAST, { metadata: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0', computedAt: PAST, replayId: 'abc123' } as never }));
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}`);
    expect((document.querySelector('.cpm-calc-foot') as HTMLElement).textContent).toContain('Re-run abc123');
  });

  it('opens Run details from the foot, with the tally and the versions', () => {
    mount();
    const foot = document.querySelector('.cpm-calc-foot') as HTMLElement;
    fireEvent.click(within(foot).getByText('Run details'));
    const dialog = screen.getByRole('dialog', { name: 'Run details' });
    expect(within(dialog).getByText('Gates')).toBeTruthy();
    expect(within(dialog).getByText('v3.0.0 · profile v2.0.0')).toBeTruthy();
    expect(within(dialog).queryByText('Samples')).toBeNull();
  });

  it('opens Record details as a dialog from the panel', () => {
    mount('?loop=FIC10401&metric=CPLM-010');
    fireEvent.click(screen.getByText('Record details'));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).getByText('Window qualification').nextSibling?.textContent).toBe('Qualified');
    expect(within(dialog).queryByText('Engine')).toBeNull();
  });
});
