import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react';
import { fmtWhen } from '../blocks/whenText';
import EvaluatedWindows from './EvaluatedWindows';
import type { HistoryWindow } from './useWindowKpis';

afterEach(cleanup);

const win = (end: string, over: Partial<HistoryWindow> = {}): HistoryWindow => ({
  windowStart: '2026-11-04T12:00:00Z', windowEnd: end, diagnosis: 'NO_CALL', confidence: 0.4, sampleCount: 8000,
  insufficientEvidenceReason: null, methodRunIds: {}, gates: [],
  metrics: { good_error_pct: 0.91, auto_pct: 1 }, ...over,
});

describe('EvaluatedWindows', () => {
  it('shows Window ending, Result, Mode and In band', () => {
    render(<EvaluatedWindows windows={[win('2026-11-05T00:00:00Z')]} selectedEnd={null} onSelect={() => {}} />);
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['Window ending', 'Result', 'Mode', 'In band']);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText(fmtWhen('2026-11-05T00:00:00Z'))).toBeTruthy();
    expect(within(row).getByText('No fault identified')).toBeTruthy();
    expect(within(row).getByText('91 %')).toBeTruthy();
    expect(within(row).getByText('100 % auto')).toBeTruthy();
  });

  it('labels a missing in-band value, never 0', () => {
    render(<EvaluatedWindows windows={[win('2026-11-05T00:00:00Z', { metrics: {} })]} selectedEnd={null} onSelect={() => {}} />);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getAllByText('Not stored').length).toBe(2); // Mode and In band
    expect(row.textContent).not.toMatch(/\b0 %/);
  });

  it('writes the window end when a row is chosen, and marks the selected row', () => {
    const onSelect = vi.fn();
    render(<EvaluatedWindows windows={[win('2026-11-05T00:00:00Z'), win('2026-11-05T00:15:00Z')]} selectedEnd="2026-11-05T00:00:00Z" onSelect={onSelect} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain(fmtWhen('2026-11-05T00:15:00Z')); // newest first
    expect(rows.find(r => r.getAttribute('aria-current') === 'true')?.textContent).toContain(fmtWhen('2026-11-05T00:00:00Z'));
    fireEvent.click(rows[0]);
    expect(onSelect).toHaveBeenCalledWith('2026-11-05T00:15:00Z');
  });

  it('pages a long list and opens on the page that holds the selected window', () => {
    const many = Array.from({ length: 30 }, (_, i) => win(new Date(Date.UTC(2026, 10, 5, 0, i * 15)).toISOString()));
    render(<EvaluatedWindows windows={many} selectedEnd={many[0].windowEnd} onSelect={() => {}} pageSize={10} />);
    expect(screen.getAllByRole('row').length).toBe(11);
    expect(screen.getByRole('navigation', { name: 'Evaluated windows pages' })).toBeTruthy();
    expect(screen.getAllByRole('row').slice(1).some(r => r.getAttribute('aria-current') === 'true')).toBe(true); // oldest = last page
  });
});
