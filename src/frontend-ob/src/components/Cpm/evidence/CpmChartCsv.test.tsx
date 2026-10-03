// 2026-10-03 (user request): the "Data table" under every trend re-serialised every point into the page while open
// and was not used; the CSV stays, on demand only - one flat button, the file built on click.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
import { CpmChart, type CpmSeries } from './CpmChart';

afterEach(cleanup);

const pv: CpmSeries = { id: 'pv', label: 'PV', unit: '°C', x: [0, 60_000, 120_000], y: [400, 401, 402], pen: 'good' };

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
