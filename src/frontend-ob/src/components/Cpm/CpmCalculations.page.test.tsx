// @vitest-environment jsdom
// Task 20: Calculations by category, the selected metric beside the list. No Gate column, no paging, no tiles;
// Not calculated is never 0; ?metric= and ?window= are kept; an insufficient-evidence gate is a judged status.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmGateMatrix } from '../../api/cpm/gates';

const { state } = vi.hoisted(() => ({
  state: { matrix: null as unknown, latestRow: null as unknown, rangeRow: null as unknown, at: null as unknown, atArgs: [] as unknown[], rangeArgs: [] as unknown[] },
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./context/LoopBand', () => ({
  LoopBand: (p: { loopId?: string; children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'band' }, p.loopId, p.children),
}));
vi.mock('./evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: { readiness: 'COMPLETE' } }) }));
vi.mock('./evidence/useWindowAt', async importOriginal => ({
  ...(await importOriginal<typeof import('./evidence/useWindowAt')>()),
  useWindowAt: (...a: unknown[]) => { state.atArgs = a; return state.at; },
}));
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', timezone: 'UTC', loopType: 'FIC', engineering: { pvUnit: 'kg/h' } }] } }),
  useLatestGates: () => ({ data: state.matrix, isError: false }),
  useCpmKpis: () => ({ data: { samples: [state.latestRow] }, isError: false }),
  useCpmKpisRange: (...a: unknown[]) => { state.rangeArgs = a; return { data: { samples: state.rangeRow ? [state.rangeRow] : [] }, isError: false, isLoading: false }; },
  useCpmCalculations: () => ({ data: { calculationVersion: '3.0.0', gates: [] } }),
}));

import { CpmCalculations } from './CpmCalculations';

const cell = (key: string, status: string) => ({ key, name: key, tier: 'short', status, reason: null, methodRunId: `run-${key}` });
const matrix = (end: string, over: Partial<CpmGateMatrix> = {}) => ({
  loopId: 'FIC10401', windowKind: '12h', windowStart: '2026-11-05T01:45:00Z', windowEnd: end, sampleCount: 8639,
  diagnosis: 'EXCLUDED_MODE', severity: null, confidence: null, observabilityFlags: [], familyDisqualifiers: [],
  gates: [cell('G0', 'PASS'), cell('G1', 'EXCLUDED'), cell('G3', 'WARN'), cell('G4', 'PASS'), cell('G15', 'INSUFFICIENT_EVIDENCE')],
  methodRunIds: { G3: 'run-G3', G15: 'run-G15' }, hasPeerLinks: false, insufficientEvidenceReason: null, metrics: {},
  narrative: { selectedFamily: null, statusReason: null, recommendation: null }, verdictV2: {},
  metadata: { calculationVersion: '3.0.0', dynamicsProfileVersion: '2.0.0', computedAt: end, replayId: null }, ...over,
}) as unknown as CpmGateMatrix;
const kpiRow = (end: string, over: Record<string, unknown> = {}) => ({
  window_start: '2026-11-05T01:45:00Z', window_end: end, sample_count: 8639, created_at: end,
  completeness: 1, mae: 0.7103, good_error_pct: 0, vw_mae: 0.7103, vw_good_error_pct: 0, vw_completeness: 1, vw_sample_count: 8639,
  acf_period_s: null, long_metrics_qualified: true, calculation_version: '3.0.0', ...over,
});

const NOW = '2026-11-05T13:45:00Z';
const PAST = '2026-11-04T13:45:00Z';
const Where: React.FC = () => <output data-testid="where">{decodeURIComponent(useLocation().search)}</output>;
const mount = (search = '?loop=FIC10401') => render(
  <MemoryRouter initialEntries={[`/cpm/calculations${search}`]}><CpmCalculations /><Where /></MemoryRouter>);
const list = () => screen.getByRole('list', { name: 'Calculations' });
const rowsShown = () => within(list()).getAllByRole('listitem');
const url = () => screen.getByTestId('where').textContent ?? '';

beforeEach(() => {
  state.matrix = matrix(NOW);
  state.latestRow = kpiRow(NOW);
  state.rangeRow = kpiRow(NOW);
  state.at = { row: undefined, rerun: false, others: [], notFound: false, isLoading: false, isError: false, error: null, refetch: () => undefined };
});
afterEach(cleanup);

describe('Calculations', () => {
  it('lists all 19, with the gate under the name and no Gate or ID column, no paging', () => {
    mount();
    expect(rowsShown()).toHaveLength(19);
    expect(within(rowsShown()[3]).getByText('CPLM-010 · G3')).toBeTruthy();
    expect(within(list()).queryByText('Gate')).toBeNull();
    expect(within(list()).queryByText('ID')).toBeNull();
    expect(screen.queryByText(/Page \d of/)).toBeNull();
    expect(screen.getByText('19 shown / 19 available')).toBeTruthy();
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
    const good = rowsShown().find(r => within(r).queryByText('Good-error time'))!;
    expect(good.textContent).toContain('0.00');
    expect(good.textContent).not.toContain('Not calculated');
    const period = rowsShown().find(r => within(r).queryByText('Oscillation period (ACF)'))!;
    expect(period.textContent).toContain('Not calculated');
  });

  it('selects the first visible row and writes ?metric=', () => {
    mount();
    expect(screen.getByRole('complementary')).toBeTruthy();
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Sample completeness' })).toBeTruthy();
    expect(url()).toContain('metric=CPLM-001');
  });

  it('keeps the metric the URL names, and clicking a row names another', () => {
    mount('?loop=FIC10401&metric=CPLM-011');
    const panel = within(screen.getByRole('complementary'));
    expect(panel.getByRole('heading', { name: 'Root-mean-square error' })).toBeTruthy();
    fireEvent.click(within(list()).getByText('Mean absolute error'));
    expect(url()).toContain('metric=CPLM-010');
  });

  it('narrows the list by category and narrows the Gate dropdown with it', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Actuator' }));
    expect(rowsShown()).toHaveLength(3);
    expect(screen.getByText('3 shown / 19 available')).toBeTruthy();
    const gate = screen.getByLabelText('Gate') as HTMLSelectElement;
    expect([...gate.options].map(o => o.value)).toEqual(['all', 'G4']);
    // the pick CPLM-001 is hidden by the filter: the panel shows the first visible row, the address keeps the pick
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: 'Actuator effort ratio' })).toBeTruthy();
    expect(url()).toContain('metric=CPLM-001');
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
  });

  it('reads an insufficient-evidence gate as judged, not as Not evaluated', () => {
    state.matrix = matrix(NOW, { diagnosis: 'INSUFFICIENT_EVIDENCE' });
    mount('?loop=FIC10401&metric=CPLM-090');
    const row = rowsShown().find(r => within(r).queryByText('Fused evidence score'))!;
    expect(row.textContent).toContain('Insufficient evidence');
    expect(row.textContent).not.toContain('Not evaluated');
  });

  it('shows a past window\'s values for ?window=', () => {
    state.at = { row: matrix(PAST), rerun: false, others: [], notFound: false, isLoading: false, isError: false, error: null, refetch: () => undefined };
    state.rangeRow = kpiRow(PAST, { vw_mae: 1.2345 });
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}&metric=CPLM-010`);
    expect(state.atArgs.slice(0, 3)).toEqual(['FIC10401', '12h', PAST]);
    const row = rowsShown().find(r => within(r).queryByText('Mean absolute error'))!;
    expect(row.textContent).toContain('1.234');
    expect(row.textContent).not.toContain('0.7103');
  });

  it('finds the past window when the instants match but the strings differ', () => {
    state.at = { row: matrix(PAST.replace('Z', '.000Z')), rerun: false, others: [], notFound: false, isLoading: false, isError: false, error: null, refetch: () => undefined };
    state.rangeRow = kpiRow(PAST, { vw_mae: 1.2345 });
    mount("?loop=FIC10401&window="+encodeURIComponent(PAST)+"&metric=CPLM-010");
    expect(rowsShown().find(r => within(r).queryByText('Mean absolute error'))!.textContent).toContain('1.234');
    // the read stops at the window's end, so the target row is the first one back
    expect(state.rangeArgs[3]).toBe(PAST.replace("Z", ".000Z"));
  });

  it('pins the values to the window the band names, and says when that row is not stored', () => {
    state.rangeRow = kpiRow('2026-11-05T13:30:00Z', { vw_mae: 9.9999 });
    mount();
    expect(screen.getByText(/values for the window above are not stored/i)).toBeTruthy();
    const row = rowsShown().find(r => within(r).queryByText('Mean absolute error'))!;
    expect(row.textContent).toContain('Not calculated');
    expect(row.textContent).not.toContain('9.99');
  });

  it('marks a gate result with no value as partial, not as a pass', () => {
    mount();
    const effort = rowsShown().find(r => within(r).queryByText('Actuator effort ratio'))!;
    expect(effort.textContent).toContain('Not calculated');
    expect(effort.textContent).toContain('on other inputs');
    const good = rowsShown().find(r => within(r).queryByText('Sample completeness'))!;
    expect(good.textContent).not.toContain('on other inputs');
  });

  it('says a named window is not stored, and lists nothing as if it were', () => {
    state.at = { row: undefined, rerun: false, others: [], notFound: true, isLoading: false, isError: false, error: null, refetch: () => undefined };
    mount(`?loop=FIC10401&window=${encodeURIComponent(PAST)}`);
    expect(screen.getByText('That window is not stored')).toBeTruthy();
  });

  it('puts the verdict, versions and Run details in the band, and the tally in Run details', () => {
    mount();
    expect(screen.getByText(/Calculation v3\.0\.0 · profile v2\.0\.0/)).toBeTruthy();
    expect(screen.getAllByText(/Excluded/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(/Run details/));
    expect(screen.getByText('Gates')).toBeTruthy();
  });

  it('goes back to Investigation with the loop and window', () => {
    mount();
    expect(screen.getByText(/Back to Investigation/)).toBeTruthy();
  });
});
