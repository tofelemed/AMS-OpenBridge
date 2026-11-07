// @vitest-environment jsdom
// Task 19: the selected window in the right column: counts, tag, stored time, three links and their dialogs.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmKpiRow } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({ useRawWindow: vi.fn() }));

import SelectedWindow from './SelectedWindow';
import { useRawWindow } from '../../../hooks/useCpm';

afterEach(cleanup);

const row = (o: Record<string, unknown> = {}) => ({
  window_start: '2026-11-04T13:35:00Z', window_end: '2026-11-04T13:50:00Z', created_at: '2026-11-04T13:51:10Z',
  sample_count: 181, expected_sample_count: 180, sufficient_data: true,
  gate0_status: 'PASS', gate1_status: 'PASS', gate2_status: 'PASS', gate2r_status: 'PASS', gate3_status: 'PASS', gate4_status: 'PASS',
  mae: 0.5, method_run_ids: '{"G15":"run-1"}', ...o,
}) as unknown as CpmKpiRow;

const Where: React.FC = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;
const mount = (r: CpmKpiRow, kind = '15m', isLong = false) => render(
  <MemoryRouter>
    <SelectedWindow row={r} loopId="FIC10401" kind={kind} spec={undefined} isLong={isLong}
      timeZone="UTC" open onClose={() => undefined} />
    <Where />
  </MemoryRouter>);

describe('SelectedWindow', () => {
  it('shows received, nominal, ratio and difference, and calls created_at Stored', () => {
    mount(row());
    expect(screen.getByText('Received').nextSibling?.textContent).toBe('181');
    expect(screen.getByText('Nominal').nextSibling?.textContent).toBe('180');
    expect(screen.getByText('Ratio').nextSibling?.textContent).toBe('101%');
    expect(screen.getByText('Difference').nextSibling?.textContent).toBe('+1 sample');
    expect(screen.getByText('Stored')).toBeTruthy();
    expect(screen.queryByText(/emitted/i)).toBeNull();
    expect(screen.queryByText(/% full/)).toBeNull();
    expect(screen.getByText('Short features')).toBeTruthy();
  });

  it('marks a derived nominal', () => {
    mount(row({ expected_sample_count: undefined, sample_count: 90, completeness: 0.5 }));
    expect(screen.getByText('Nominal').nextSibling?.textContent).toContain('derived');
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
    fireEvent.click(screen.getByRole('button', { name: 'Feature flags ↗' }));
    const dialog = screen.getByRole('dialog', { name: 'Feature flags' });
    for (const g of ['G0', 'G1', 'G2', 'G2r', 'G3', 'G4']) expect(within(dialog).getByText(g)).toBeTruthy();
    const g2r = within(dialog).getByText('G2r').closest('[data-flag]') as HTMLElement;
    expect(within(g2r).getByText('Not evaluated')).toBeTruthy();
    expect(within(g2r).queryByText('Pass')).toBeNull();
  });

  it('opens record details and engine & timing in dialogs', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'View record details ↗' }));
    expect(screen.getByRole('dialog', { name: 'Record details' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Engine & timing ↗' }));
    expect(screen.getByRole('dialog', { name: 'Engine & timing' })).toBeTruthy();
  });

  it('is a long diagnostic: tagged so, with no feature flags', () => {
    mount(row({ long_metrics_qualified: true }), '12h', true);
    expect(screen.getByText('Long diagnostics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Feature flags ↗' })).toBeNull();
  });

  it('does not read raw data when a window is selected', () => {
    mount(row());
    expect(useRawWindow).not.toHaveBeenCalled();
  });
});
