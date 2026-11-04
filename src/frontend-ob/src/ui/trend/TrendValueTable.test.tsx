import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { prepareTrend } from './trendModel';
import { TABLE_PAGE_SIZE, TrendValueTable, tableCells, tableColumns } from './TrendValueTable';
import type { TrendLane, TrendPane } from './trendTypes';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { type: 'button', onClick: p.onClick, disabled: p.disabled }, p.children),
}));

afterEach(cleanup);

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 3, 8, 0);

function setup(count: number) {
  const x = Array.from({ length: count }, (_, i) => T0 + i * MIN);
  const pane: TrendPane = {
    id: 'p',
    axes: [{ id: 'pv', label: 'PV', unit: 'kg/h' }, { id: 'output', label: 'Output', output: true }],
    series: [
      { id: 'pv', label: 'PV', role: 'pv', axis: 'pv', x, y: x.map((_, i) => (i === 1 ? null : i)) },
      { id: 'op', label: 'OP', role: 'op', axis: 'output', x, y: x.map(() => 40) },
    ],
    bands: [{ id: 'b', label: 'PV span', axis: 'pv', x, lo: x.map(() => 1), hi: x.map(() => 2) }],
  };
  const lanes: TrendLane[] = [{ id: 'mode', label: 'Mode', kind: 'mode', segments: [{ startMs: T0, endMs: T0 + count * MIN, label: 'AUTO', tone: 'neutral' }] }];
  const model = prepareTrend({ panes: [pane], lanes, gapStepMs: null });
  return { model, plotted: model.domain!, x };
}

const table = (count: number, cursor: number | null = null) => {
  const { model, plotted, x } = setup(count);
  render(<TrendValueTable id="t" model={model} plotted={plotted} zone="Asia/Dubai" cursor={cursor} plottedText="Plotted: window GST" />);
  return x;
};

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('columns and cells', () => {
  it('states the unit in each heading, and the zone on the time column', () => {
    const { model, plotted } = setup(3);
    expect(tableColumns(model, plotted, 'Asia/Dubai')).toEqual(['Time (GST)', 'PV (kg/h)', 'OP (unit not set)', 'PV span (kg/h)', 'Mode']);
  });

  it('writes a gap as words, never as a blank or a zero', () => {
    const { model, x } = setup(3);
    expect(tableCells(model, x[1], 'Asia/Dubai')).toEqual(['3 Nov 2026, 12:01:00 GST', 'No sample', '40 (unit not set)', '1 to 2 kg/h', 'AUTO']);
  });
});

describe('TrendValueTable', () => {
  it('is a native table with headers in scope', () => {
    table(3);
    const native = screen.getByRole('table');
    expect(native.tagName).toBe('TABLE');
    expect(native.querySelector('caption')!.textContent).toBe('Plotted: window GST. Rows 1 to 3 of 3.');
    expect(screen.getAllByRole('columnheader').every(h => h.getAttribute('scope') === 'col')).toBe(true);
    expect(screen.getAllByRole('rowheader').every(h => h.getAttribute('scope') === 'row')).toBe(true);
  });

  it('can be reached and scrolled by keyboard', () => {
    table(3);
    expect(screen.getByRole('region', { name: 'Plotted values' }).getAttribute('tabindex')).toBe('0');
  });

  it('pages through the rows', () => {
    table(TABLE_PAGE_SIZE * 2 + 1);
    expect(bodyRows().length).toBe(TABLE_PAGE_SIZE);
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(bodyRows().length).toBe(1);
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows no pager for one page', () => {
    table(3);
    expect(screen.queryByRole('group', { name: 'Value table pages' })).toBeNull();
  });

  it('opens the page with the cursor on it, and marks the row', () => {
    const x = setup(TABLE_PAGE_SIZE + 5).x;
    table(TABLE_PAGE_SIZE + 5, x[TABLE_PAGE_SIZE + 2]);
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    const current = bodyRows().filter(r => r.getAttribute('aria-current') === 'true');
    expect(current.length).toBe(1);
    expect(current[0].textContent).toContain('12:52:00');
  });

  it('shows one row at the cursor when asked', () => {
    const x = setup(3).x;
    table(3, x[2]);
    fireEvent.click(screen.getByRole('button', { name: 'At the cursor' }));
    expect(bodyRows().length).toBe(1);
    expect(bodyRows()[0].textContent).toContain('12:02:00');
    expect(screen.getByRole('table').querySelector('caption')!.textContent).toContain('Values at the cursor.');
  });

  it('explains how to place a cursor when none is', () => {
    table(3);
    fireEvent.click(screen.getByRole('button', { name: 'At the cursor' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/No cursor placed/)).toBeTruthy();
  });

  it('says so when no sample falls inside the window', () => {
    const { model } = setup(3);
    render(<TrendValueTable id="t" model={model} plotted={{ from: T0 + 100 * MIN, to: T0 + 200 * MIN }} zone="UTC" cursor={null} plottedText="Plotted" />);
    expect(screen.getByRole('table').querySelector('caption')!.textContent).toContain('No plotted samples in this window.');
  });
});
