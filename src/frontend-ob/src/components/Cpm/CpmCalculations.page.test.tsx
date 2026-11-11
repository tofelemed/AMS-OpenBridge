// @vitest-environment jsdom
// Task 20: Calculations by category, the selected metric beside the list. No Gate column, no paging, no tiles;
// Not calculated is never 0; ?metric= and ?window= are kept; an insufficient-evidence gate is a judged status.
// CHG-166 (owner review): the list head is one row named by its options (no labels, no count), the category a dropdown, each
// gate option named; values in the loop's own unit. The band, the foot and the address are in CpmCalculations.band.test.tsx.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { NOW, PAST, atResult, kpiRow, matrix, windowList } from './calc/calcTestFixtures';

const { state } = vi.hoisted(() => ({
  state: { matrix: null as unknown, latestRow: null as unknown, rangeRow: null as unknown, at: null as unknown, atArgs: [] as unknown[], rangeArgs: [] as unknown[], windows: null as unknown },
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./context/LoopBand', () => ({
  LoopBand: (p: { loopId?: string; children?: React.ReactNode; end?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'band' }, p.loopId, p.children, p.end),
}));
vi.mock('./evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { readiness: 'COMPLETE' } }) }));
vi.mock('./evidence/useWindowAt', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useWindowAt')>()),
  useWindowAt: (...a: unknown[]) => { state.atArgs = a; return state.at; },
}));
vi.mock('./evidence/useEvidenceWindows', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useEvidenceWindows')>()),
  useEvidenceWindows: () => state.windows,
}));
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', timezone: 'UTC', loopType: 'FIC', engineering: { pvUnit: 'kg/h' } }] } }),
  useLatestGates: () => ({ data: state.matrix, isError: false }),
  useCpmKpis: () => ({ data: { samples: [state.latestRow] }, isError: false }),
  useCpmKpisRange: (...a: unknown[]) => { state.rangeArgs = a; return { data: { samples: state.rangeRow ? [state.rangeRow] : [] }, isError: false, isLoading: false }; },
  useCpmCalculations: () => ({ data: { calculationVersion: '3.0.0', gates: [] } }),
}));

import { CpmCalculations } from './CpmCalculations';

const Where: React.FC = () => <output data-testid="where">{decodeURIComponent(useLocation().search)}</output>;
const mount = (search = '?loop=FIC10401') => render(
  <MemoryRouter initialEntries={[`/cpm/calculations${search}`]}><CpmCalculations /><Where /></MemoryRouter>);
const list = () => screen.getByRole('list', { name: 'Calculations' });
const rowsShown = () => within(list()).getAllByRole('listitem');
const rowOf = (name: string) => rowsShown().find(r => within(r).queryByText(name))!;
const url = () => screen.getByTestId('where').textContent ?? '';
const optionsOf = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement).options];

beforeEach(() => {
  state.matrix = matrix(NOW);
  state.latestRow = kpiRow(NOW);
  state.rangeRow = kpiRow(NOW);
  state.at = atResult(undefined);
  state.windows = windowList();
});
afterEach(cleanup);

describe('Calculations list', () => {
  it('lists all 19, with the gate under the name and no Gate or ID column, no paging and no count', () => {
    mount();
    expect(rowsShown()).toHaveLength(19);
    expect(within(rowsShown()[3]).getByText('CPLM-010 · G3')).toBeTruthy();
    expect(within(list()).queryByText('Gate')).toBeNull();
    expect(within(list()).queryByText('ID')).toBeNull();
    expect(screen.queryByText(/Page \d of/)).toBeNull();
    expect(screen.queryByText(/shown \/ \d+ available/)).toBeNull();
  });

  it('removes the tiles, All types, the result count and the row descriptions', () => {
    mount();
    for (const t of ['Metrics stored', 'Evidence gates in the pack', 'Gates acceptable', 'Gates needing review', 'Gates not evaluated', 'All types'])
      expect(screen.queryByText(t)).toBeNull();
    expect(screen.queryByText(/result\(s\)/)).toBeNull();
    expect(within(list()).queryByText('Mean |PV − SP| over the window.')).toBeNull();
  });

  it('keeps Not calculated distinct from 0', () => {
    mount();
    const good = rowOf('Good-error time');
    expect(good.textContent).toContain('0.00');
    expect(good.textContent).not.toContain('Not calculated');
    expect(rowOf('Oscillation period (ACF)').textContent).toContain('Not calculated');
  });

  it('writes a PV-unit value in the loop unit', () => {
    mount();
    expect(rowOf('Mean absolute error').textContent).toContain('0.7103 kg/h');
    expect(list().textContent).not.toContain('PV units');
  });

  it('selects the first visible row and writes ?metric=', () => {
    mount();
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Sample completeness' })).toBeTruthy();
    expect(url()).toContain('metric=CPLM-001');
  });

  it('keeps the metric the URL names, and clicking a row names another', () => {
    mount('?loop=FIC10401&metric=CPLM-011');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Root-mean-square error' })).toBeTruthy();
    fireEvent.click(within(list()).getByText('Mean absolute error'));
    expect(url()).toContain('metric=CPLM-010');
  });
});

describe('Calculations list head', () => {
  it('is one row named by its options, with no visible labels', () => {
    mount();
    expect(document.querySelector('.cpm-field__label')).toBeNull();
    expect((screen.getByLabelText('Find calculation') as HTMLInputElement).placeholder).toBe('Name, ID or unit');
    expect(optionsOf('Category').map(o => o.text)).toEqual(['All categories', 'Control error', 'Actuator', 'Data & mode', 'Oscillation', 'Decision']);
    expect(optionsOf('Gate')[0].text).toBe('All gates');
    expect(optionsOf('Gate result')[0].text).toBe('All results');
  });

  it('names each gate option by its gate', () => {
    mount();
    const gates = optionsOf('Gate').map(o => o.text);
    expect(gates).toContain('G5 · Oscillation (ACF)');
    expect(gates).toContain('G15 · Diagnosis band');
  });

  it('narrows the list by category and narrows the Gate dropdown with it', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Actuator' } });
    expect(rowsShown()).toHaveLength(3);
    expect(optionsOf('Gate').map(o => o.value)).toEqual(['all', 'G4']);
    // the pick CPLM-001 is hidden by the filter: the panel shows the first visible row, the address keeps the pick
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Actuator effort ratio' })).toBeTruthy();
    expect(url()).toContain('metric=CPLM-001');
  });

  it('drops a gate the chosen category does not hold', () => {
    mount('?loop=FIC10401&gate=G3');
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Actuator' } });
    expect(url()).not.toContain('gate=');
    expect(rowsShown()).toHaveLength(3);
  });

  it('finds calculations by the loop unit as well as the catalogue unit', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Find calculation'), { target: { value: 'kg/h' } });
    expect(rowsShown().map(r => within(r).getByText(/CPLM-\d+ ·/).textContent)).toEqual(['CPLM-010 · G3', 'CPLM-011 · G3', 'CPLM-012 · G3', 'CPLM-013 · G3']);
  });

  it('filters by gate result', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Gate result'), { target: { value: 'Not evaluated' } });
    for (const r of rowsShown()) expect(r.textContent).toContain('Not evaluated');
  });

  it('keeps a shared ?metric= that a gate filter hides', () => {
    mount('?loop=FIC10401&gate=G3&metric=CPLM-050');
    expect(url()).toContain('metric=CPLM-050');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Mean absolute error' })).toBeTruthy();
  });

  it('clears the filters', () => {
    mount('?loop=FIC10401&gate=G3');
    expect(rowsShown()).toHaveLength(5);
    fireEvent.click(screen.getByText('Clear filters'));
    expect(rowsShown()).toHaveLength(19);
    expect(screen.queryByText('Clear filters')).toBeNull();
  });

  it('says when no calculation matches', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Find calculation'), { target: { value: 'zzz' } });
    expect(screen.getByText('No calculation matches the filters')).toBeTruthy();
  });
});

describe('Calculations values of the window', () => {
  it('reads an insufficient-evidence gate as judged, not as Not evaluated', () => {
    state.matrix = matrix(NOW, { diagnosis: 'INSUFFICIENT_EVIDENCE' });
    mount('?loop=FIC10401&metric=CPLM-090');
    const row = rowOf('Fused evidence score');
    expect(row.textContent).toContain('Insufficient evidence');
    expect(row.textContent).not.toContain('Not evaluated');
  });

  it('shows a past window’s values for ?window=', () => {
    state.at = atResult(matrix(PAST));
    state.rangeRow = kpiRow(PAST, { vw_mae: 1.2345 });
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}&metric=CPLM-010`);
    expect(state.atArgs.slice(0, 3)).toEqual(['FIC10401', '12h', PAST]);
    const row = rowOf('Mean absolute error');
    expect(row.textContent).toContain('1.234');
    expect(row.textContent).not.toContain('0.7103');
  });

  it('finds the past window when the instants match but the strings differ', () => {
    state.at = atResult(matrix(PAST.replace('Z', '.000Z')));
    state.rangeRow = kpiRow(PAST, { vw_mae: 1.2345 });
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}&metric=CPLM-010`);
    expect(rowOf('Mean absolute error').textContent).toContain('1.234');
    // the read stops at the window's end, so the target row is the first one back
    expect(state.rangeArgs[3]).toBe(PAST.replace('Z', '.000Z'));
  });

  it('pins the values to the window the band names, and says when that row is not stored', () => {
    state.rangeRow = kpiRow('2026-11-05T13:30:00Z', { vw_mae: 9.9999 });
    mount();
    expect(screen.getByText(/values for the window above are not stored/i)).toBeTruthy();
    const row = rowOf('Mean absolute error');
    expect(row.textContent).toContain('Not calculated');
    expect(row.textContent).not.toContain('9.99');
  });

  it('marks a gate result with no value as partial, not as a pass', () => {
    mount();
    const effort = rowOf('Actuator effort ratio');
    expect(effort.textContent).toContain('Not calculated');
    expect(effort.textContent).toContain('on other inputs');
    expect(rowOf('Sample completeness').textContent).not.toContain('on other inputs');
  });

  it('says a named window is not stored, and lists nothing as if it were', () => {
    state.at = atResult(undefined, { notFound: true });
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}`);
    expect(screen.getByText('That window is not stored')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Calculations' })).toBeNull();
  });
});
