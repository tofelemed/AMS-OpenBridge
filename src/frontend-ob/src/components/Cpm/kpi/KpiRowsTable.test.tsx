// @vitest-environment jsdom
// CHG-132: each fact once in a row. A shared measure is named in the column heading, and the column goes when the verdict
// says all it would.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { KpiRowsTable } from './KpiRowsTable';

const stale = (loopId: string): FleetKpiRow => ({
  loopId, displayName: 'Reactor pressure', state: 'Stale', windowKind: '12h', windowEnd: '2026-10-10T12:00:00Z', ageSeconds: 7200,
  site: 'hdpe', area: 'section_100', unit: 'u1002',
  deciding: { label: 'Age of the newest result', value: 7200, threshold: 3600, unit: 'seconds', comparator: '<=', measured: true },
  inputs: {},
} as FleetKpiRow);
const never = (loopId: string): FleetKpiRow => ({
  loopId, state: 'NeverEvaluated', windowKind: '12h', windowEnd: null, ageSeconds: null,
  deciding: { label: 'State', value: null, threshold: null, unit: '', comparator: '', measured: false }, inputs: {},
} as FleetKpiRow);

const show = (rows: FleetKpiRow[]) => render(<MemoryRouter><KpiRowsTable rows={rows} kpi="stale" /></MemoryRouter>);
const heads = () => screen.getAllByRole('columnheader').map(h => h.textContent);

afterEach(cleanup);

describe('KpiRowsTable', () => {
  it('names a shared measure in the heading and gives each row its value once', () => {
    show([stale('A'), stale('B')]);
    expect(heads()).toEqual(['Loop', 'Age of the newest result', 'Verdict', 'Window', 'Also check', 'Proof']);
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('2 h — above 60 min')).toBeTruthy();
    expect(row.getByText('Stale')).toBeTruthy();
    expect(row.queryByText(/ago$/)).toBeNull();
    expect(row.queryByText(/section_100/)).toBeNull();
  });

  it('keeps the name of the measure in the row when rows differ', () => {
    show([stale('A'), never('B')]);
    expect(heads()[1]).toBe('Measured');
    expect(screen.getByText('Age of the newest result 2 h — above 60 min')).toBeTruthy();
  });

  it('drops the column when the verdict already says it', () => {
    show([never('A'), never('B')]);
    expect(heads()).toEqual(['Loop', 'Verdict', 'Window', 'Also check', 'Proof']);
    expect(screen.getAllByText('No result yet')).toHaveLength(2);
  });

  it('keeps every proof link', () => {
    show([stale('A')]);
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Loop ›', 'Window ›', 'Trend ›']);
  });
});
