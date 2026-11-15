// 2026-10-03 (user request): the "Data table" under every trend re-serialised every point into the page while open
// and was not used; the CSV stays, on demand only - one flat button, the file built on click.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
import { CpmChart, type CpmSeries } from './CpmChart';

afterEach(cleanup);

const pv: CpmSeries = { id: 'pv', label: 'PV', unit: '°C', x: [0, 60_000, 120_000], y: [400, 401, 402], pen: 'pv' };

describe('CpmChart data access', () => {
  it('offers the CSV on demand and never renders a data table', () => {
    render(<CpmChart series={[pv]} xKind="time" timeZone="Asia/Dubai" title="PV" />);
    expect(screen.queryByText(/data table/i)).toBeNull();
    expect(screen.queryByTestId('cpm-chart-table')).toBeNull();
    expect(document.querySelector('details')).toBeNull();
    const csv = screen.getByText('Export CSV');
    expect(csv.closest('obc-button')).not.toBeNull();
    expect(document.body.textContent).not.toContain('400');     // no serialised values on the page before a click
  });
});

// CHG-193 (owner decision 15 Nov 2026, A2): the legend speaks words, the CSV keeps its column names
describe('CSV column names', () => {
  it('keeps the series key as the CSV column when the legend name is in words', async () => {
    const { toCsv } = await import('./CpmChart');
    const applied: CpmSeries = { id: 'u_applied', label: 'Applied input', csvLabel: 'u_applied', unit: 'pp', x: [1, 2], y: [10, 11], pen: 'op' };
    expect(toCsv([applied]).split('\n')[0]).toBe('x,u_applied (pp)');
    expect(toCsv([applied], { xKind: 'value', xLabel: 'Frequency', csvXLabel: 'frequency_hz', xUnit: 'Hz' }).split('\n').find(l => !l.startsWith('#')))
      .toBe('frequency_hz (Hz),u_applied (pp)');
    expect(toCsv([pv]).split('\n')[0]).toBe('x,PV (°C)');   // no csvLabel: the legend name, as before
  });
});
