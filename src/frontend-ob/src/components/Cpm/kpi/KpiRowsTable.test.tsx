// @vitest-environment jsdom
// CHG-132 / CHG-155: each fact once in a row. A shared measure and its limit are named in the column heading, a verdict the
// KPI already states is left out, an empty "Also check" column goes, and the loop column holds the tag only.
// CHG-226: a loop kept at its last stored result says so in its Window cell, with the time, once.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FleetKpiKey, FleetKpiRow } from '../../../api/cpm/fleetKpis';
import { KpiRowsTable } from './KpiRowsTable';

vi.mock('../../../cpa/siteTime', async orig => ({ ...(await orig<typeof import('../../../cpa/siteTime')>()), siteZone: () => 'UTC' }));

const stale = (loopId: string, extra: Partial<FleetKpiRow> = {}): FleetKpiRow => ({
  loopId, displayName: 'Reactor pressure', state: 'Stale', windowKind: '12h', windowEnd: '2026-10-10T12:00:00Z', ageSeconds: 7200,
  site: 'hdpe', area: 'section_100', unit: 'u1002',
  deciding: { label: 'Age of the newest result', value: 7200, threshold: 3600, unit: 'seconds', comparator: '<=', measured: true },
  inputs: {}, ...extra,
} as FleetKpiRow);
const never = (loopId: string): FleetKpiRow => ({
  loopId, state: 'NeverEvaluated', windowKind: '12h', windowEnd: null, ageSeconds: null,
  deciding: { label: 'State', value: null, threshold: null, unit: '', comparator: '', measured: false }, inputs: {},
} as FleetKpiRow);
const assessed = (loopId: string, diagnosis: string): FleetKpiRow => ({
  loopId, state: 'Assessed', diagnosis, windowKind: '12h', windowEnd: '2026-10-10T12:00:00Z', ageSeconds: 60,
  deciding: { label: 'State', value: null, threshold: null, unit: '', comparator: '', measured: false }, inputs: {},
} as FleetKpiRow);

const show = (rows: FleetKpiRow[], kpi: FleetKpiKey = 'stale') => render(<MemoryRouter><KpiRowsTable rows={rows} kpi={kpi} /></MemoryRouter>);
const heads = () => screen.getAllByRole('columnheader').map(h => h.textContent);

afterEach(cleanup);

describe('KpiRowsTable', () => {
  it('names a shared measure and its limit in the heading, and gives each row its value once', () => {
    show([stale('A'), stale('B')]);
    expect(heads()).toEqual(['Loop', 'Age of the newest result · above 60 min', 'Window', 'Proof']);
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('2 h')).toBeTruthy();
    expect(row.queryByText(/above 60 min/)).toBeNull();
    expect(row.queryByText(/ago$/)).toBeNull();
    expect(row.queryByText(/section_100/)).toBeNull();
  });

  it('shows the loop tag only, never its description', () => {
    show([stale('PIC10201')]);
    expect(screen.getByText('PIC10201')).toBeTruthy();
    expect(screen.queryByText(/Reactor pressure/)).toBeNull();
  });

  it('leaves out the verdict when the KPI already states it', () => {
    show([stale('A')], 'stale');
    expect(heads()).not.toContain('Verdict');
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('keeps the verdict where loops in the list differ', () => {
    show([assessed('A', 'SUSPECTED_OSCILLATION'), assessed('B', 'NO_CALL')], 'assessed');
    expect(heads()).toContain('Verdict');
    expect(screen.getByText('No fault identified')).toBeTruthy();
  });

  it('keeps the limit in the row when rows differ', () => {
    show([stale('A'), never('B')], 'all');
    expect(heads()[1]).toBe('Measured');
    expect(screen.getByText('Age of the newest result 2 h — above 60 min')).toBeTruthy();
  });

  it('drops the measured column when the verdict already says it', () => {
    show([never('A'), never('B')], 'all');
    expect(heads()).toEqual(['Loop', 'Verdict', 'Window', 'Proof']);
    expect(screen.getAllByText('No result yet')).toHaveLength(2);
  });

  it('keeps "Also check" only when a row has something in it', () => {
    show([stale('A', { lastVerdict: { diagnosis: 'CONFIRMED_OSCILLATION', windowEnd: '2026-10-01T12:00:00Z' } } as Partial<FleetKpiRow>), stale('B')]);
    expect(heads()).toContain('Also check');
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('gives the window time short, once', () => {
    show([stale('A')]);
    const cell = within(screen.getAllByRole('row')[1]).getAllByRole('cell')[2];
    expect(cell.textContent).toMatch(/^10 Oct · \d\d:\d\d$/);
  });

  it('keeps every proof link', () => {
    show([stale('A')]);
    expect(screen.getAllByRole('link').map(l => l.textContent)).toEqual(['Loop ↗', 'Window ↗', 'Trend ↗']);
  });
});

describe('KpiRowsTable, a last stored result (CHG-226)', () => {
  const windowCell = (i: number) => within(screen.getAllByRole('row')[i + 1]).getAllByRole('cell').find(c => c.dataset.label === 'Window')!;

  it('says "Last stored result" with the time of the result, once in the row, in place of the same window time', () => {
    show([{ ...assessed('A', 'NO_CALL'), lastStored: true, resultAt: '2026-10-10T12:00:00Z', updatingSince: '2026-10-10T13:00:00Z' }], 'assessed');
    const row = screen.getAllByRole('row')[1];
    expect(windowCell(0).textContent).toBe('Last stored result · 10 Oct · 12:001 min ago');
    expect(row.textContent!.match(/Last stored result/g)).toHaveLength(1);
    expect(row.textContent!.match(/10 Oct · 12:00/g)).toHaveLength(1);
  });

  it('keeps a different window time with its age, and adds the label under them', () => {
    show([{ ...assessed('A', 'NO_CALL'), lastStored: true, resultAt: '2026-10-10T09:15:00Z' }], 'assessed');
    expect(windowCell(0).textContent).toBe('10 Oct · 12:001 min agoLast stored result · 10 Oct · 09:15');
  });

  it('says nothing when the row is a new result or the fields are absent', () => {
    show([{ ...assessed('A', 'NO_CALL'), lastStored: false, resultAt: '2026-10-10T12:00:00Z' }, assessed('B', 'NO_CALL')], 'assessed');
    expect(screen.queryByText(/Last stored result/)).toBeNull();
    expect(windowCell(0).textContent).toBe('10 Oct · 12:001 min ago');
    expect(windowCell(1).textContent).toBe('10 Oct · 12:001 min ago');
  });
});
