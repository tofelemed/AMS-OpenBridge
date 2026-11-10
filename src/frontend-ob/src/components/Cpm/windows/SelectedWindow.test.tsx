// @vitest-environment jsdom
// Task 19: the selected window in the right column: counts, tag, stored time, three links and their dialogs.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmKpiRow, CpmLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useRawWindow: vi.fn(() => ({ isLoading: false, isError: false, data: { points: [], count: 0, hasMore: false } })),
}));

import SelectedWindow from './SelectedWindow';
import { useRawWindow } from '../../../hooks/useCpm';

afterEach(() => { cleanup(); vi.mocked(useRawWindow).mockClear(); });

const row = (o: Record<string, unknown> = {}) => ({
  window_start: '2026-11-04T13:35:00Z', window_end: '2026-11-04T13:50:00Z', created_at: '2026-11-04T13:51:10Z',
  sample_count: 181, expected_sample_count: 180, sufficient_data: true,
  gate0_status: 'PASS', gate1_status: 'PASS', gate2_status: 'PASS', gate2r_status: 'PASS', gate3_status: 'PASS', gate4_status: 'PASS',
  mae: 0.5, method_run_ids: '{"G15":"run-1"}', ...o,
}) as unknown as CpmKpiRow;

const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const TAGS = { PV: 'root.hdpe.FIC10401.PV', SP: 'root.hdpe.FIC10401.SP' };
const mount = (r: CpmKpiRow, kind = '15m', isLong = false) => render(
  <MemoryRouter>
    <SelectedWindow row={r} loopId="FIC10401" loop={{ loopId: 'FIC10401', tags: TAGS } as unknown as CpmLoop} kind={kind} spec={undefined} isLong={isLong}
      timeZone="UTC" open onClose={() => undefined} />
    <Where />
  </MemoryRouter>);

describe('SelectedWindow', () => {
  // CHG-164 (owner review): received, nominal, ratio and difference read as one Samples row
  it('shows the samples in one row, and calls created_at Stored', () => {
    mount(row());
    expect(screen.getByText('Samples').nextSibling?.textContent).toBe('181 of 180 · 101%+1 sample');
    expect(screen.queryByText('Received')).toBeNull();
    expect(screen.getByText('Stored')).toBeTruthy();
    expect(screen.queryByText(/emitted/i)).toBeNull();
    expect(screen.queryByText(/% full/)).toBeNull();
    expect(screen.getByText('Short features')).toBeTruthy();
  });

  it('marks a derived nominal', () => {
    mount(row({ expected_sample_count: undefined, sample_count: 90, completeness: 0.5 }));
    expect(screen.getByText('Samples').nextSibling?.textContent).toContain('derived');
  });

  it('sends a 15m window to its own run in the Workbench', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'Inspect this window →' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/evidence?loop=FIC10401&methodRun=run-1');
  });

  it('sends a 12h window to Replay', () => {
    mount(row(), '12h');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect this window →' }));
    expect(screen.getByTestId('where').textContent).toContain('/cpm/replay');
  });

  it('names the six flags in a dialog, and reads Not evaluated for G2r on a declined window', () => {
    mount(row({ sufficient_data: false, gate2r_status: 'PASS', gate0_status: 'FAIL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feature flags' }));
    const dialog = screen.getByRole('dialog', { name: 'Feature flags' });
    for (const g of ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4']) expect(within(dialog).getByText(g)).toBeTruthy();
    const g2r = within(dialog).getByText('G2r').closest('[data-flag]') as HTMLElement;
    expect(within(g2r).getByText('Not evaluated')).toBeTruthy();
    expect(within(g2r).queryByText('Pass')).toBeNull();
  });

  it('opens record details and engine & timing in dialogs', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }));
    expect(screen.getByRole('dialog', { name: 'Record details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Engine & timing' }));
    expect(screen.getByRole('dialog', { name: 'Engine & timing' })).toBeTruthy();
  });

  it('is a long diagnostic: tagged so, with no feature flags', () => {
    mount(row({ long_metrics_qualified: true }), '12h', true);
    expect(screen.getByText('Long diagnostics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Feature flags' })).toBeNull();
  });

  it('reads raw data only when Sample density opens, never on selecting a window', () => {
    mount(row());
    expect(useRawWindow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sample density' }));
    expect(screen.getByRole('dialog', { name: 'Sample density' })).toBeTruthy();
    expect(useRawWindow).toHaveBeenCalled();
  });

  it('opens Trend on the loop, pinned to the window', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'Trend ↗' }));
    const where = decodeURIComponent(screen.getByTestId('where').textContent ?? '');
    expect(where).toContain('/trend?loop=FIC10401&from=2026-11-04T13:35:00.000Z');
    expect(where).toContain('from=2026-11-04T13:35:00.000Z');
  });

  it('opens Historical on the window range from the panel, and Record details no longer carries either link (B9)', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }));
    const dialog = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dialog).queryByRole('button', { name: /Historical ↗|Trend ↗/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    const where = decodeURIComponent(screen.getByTestId('where').textContent ?? '');
    expect(where).toContain('/historical?loop=FIC10401');
    expect(where).toContain('window=');
  });

  it('shows each of the two links once in the panel (B9)', () => {
    mount(row());
    expect(screen.getAllByRole('button', { name: 'Historical ↗' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Trend ↗' })).toHaveLength(1);
  });
});
