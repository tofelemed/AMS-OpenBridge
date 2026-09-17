// 2026-09-17 audit F22: the fast G10 limit-dwell / G11 freeze conditions (minutes, not the 4/12/24 h
// windows) get a view on Loop Events: open first with their age and duration, closed ones with their
// close reason, each row leading to the loop's short windows in the workbench.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConditionsPanel, conditionRows } from './ConditionsPanel';
import type { CpmCondition } from '../../../api/cpm/conditions';

afterEach(cleanup);
const NOW = Date.UTC(2026, 8, 17, 12, 0);
const c = (over: Partial<CpmCondition>): CpmCondition => ({
  loopId: 'FIC10301', displayName: 'Flow controller FIC10301', site: 'hdpe', gate: 'G11', kind: 'FREEZE', state: 'UPDATE',
  startMs: NOW - 5 * 60_000, lastMs: NOW - 60_000, endMs: null, durationS: 240, closeReason: '', evidence: {}, updatedAt: '2026-09-17T11:59:00Z', ...over,
});

describe('conditionRows', () => {
  it('reads an open condition as open with its age and a closed one with its reason', () => {
    const rows = conditionRows([c({}), c({ gate: 'G10', kind: 'LIMIT_LOW', state: 'CLOSED', endMs: NOW - 3_600_000, closeReason: 'RECOVERED', durationS: 90 })], NOW);
    expect(rows[0]).toMatchObject({ open: true, label: 'Freeze', gateLabel: 'G11', since: '5 min ago', duration: '4 min', reason: '' });
    expect(rows[1]).toMatchObject({ open: false, label: 'Limit low', gateLabel: 'G10', duration: '1.5 min', reason: 'recovered' });
  });
  it('an open condition the engine stopped updating is stale, never live', () => {
    const rows = conditionRows([c({ startMs: NOW - 17 * 3_600_000, lastMs: NOW - 17 * 3_600_000 + 90_000 })], NOW);
    expect(rows[0]).toMatchObject({ open: true, stale: true, lastUpdate: '17 h ago' });
    expect(conditionRows([c({})], NOW)[0].stale).toBe(false);
  });
});

describe('ConditionsPanel', () => {
  it('lists conditions, open first, with a link to the loop\'s short windows', () => {
    render(<MemoryRouter><ConditionsPanel conditions={[c({}), c({ state: 'CLOSED', endMs: NOW, closeReason: 'RECOVERED' })]} isLoading={false} error={null} now={NOW} /></MemoryRouter>);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/OPEN/);
    expect(rows[1].textContent).toMatch(/recovered/);
    expect(screen.getAllByRole('link', { name: /FIC10301/ })[0].getAttribute('href')).toBe('/cpm/evidence?loop=FIC10301&kind=15m');
  });

  it('states loading, an error and emptiness', () => {
    const { rerender } = render(<MemoryRouter><ConditionsPanel conditions={[]} isLoading={true} error={null} now={NOW} /></MemoryRouter>);
    expect(screen.getByText(/Loading the fast conditions/)).toBeTruthy();
    rerender(<MemoryRouter><ConditionsPanel conditions={[]} isLoading={false} error={new Error('boom')} now={NOW} /></MemoryRouter>);
    expect(screen.getByText(/boom/)).toBeTruthy();
    rerender(<MemoryRouter><ConditionsPanel conditions={[]} isLoading={false} error={null} now={NOW} /></MemoryRouter>);
    expect(screen.getByText(/No fast conditions/)).toBeTruthy();
  });
});
