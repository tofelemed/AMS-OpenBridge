// @vitest-environment jsdom
// Task 19: the selected window in the right column: counts, tag, stored time, the links and their dialogs (CHG-184: no Record details).
// CHG-190 (owner review items 13, 14): the owner's reference design: links top right, a Details grid, the primary full width.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmKpiRow, CpmLoop } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean; className?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, className: p.className, 'data-full-width': p.fullWidth ? 'true' : undefined }, p.children),
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

  it('opens engine & timing in a dialog, and has no Record details (CHG-184, owner review Q6)', () => {
    mount(row());
    expect(screen.queryByRole('button', { name: 'Record details' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Engine & timing' }));
    expect(screen.getByRole('dialog', { name: 'Engine & timing' })).toBeTruthy();
  });

  // CHG-192 (owner review item 16): each of the three dialogs names the loop and the window size under its title
  it('names the loop and the window size under each dialog title, and the raw count as a row', () => {
    mount(row());
    for (const name of ['Feature flags', 'Sample density', 'Engine & timing']) {
      fireEvent.click(screen.getByRole('button', { name }));
      const dialog = screen.getByRole('dialog', { name });
      expect(dialog.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10401 · 15 min window');
      if (name === 'Sample density') expect(within(dialog).getByText('Raw points').nextSibling?.textContent).toBe('0');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    }
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

  it('opens Historical on the window range from the panel (B9)', () => {
    mount(row());
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    const where = decodeURIComponent(screen.getByTestId('where').textContent ?? '');
    expect(where).toContain('/historical?loop=FIC10401');
    expect(where).toContain('window=');
  });

  it('puts Historical and Trend top right of the head, as links (CHG-190, owner Q4)', () => {
    mount(row());
    const head = document.querySelector('.ui-inspector__head') as HTMLElement;
    expect(within(head).getByRole('heading', { name: '15 min window' })).toBeTruthy();
    for (const name of ['Historical ↗', 'Trend ↗']) {
      const link = within(head).getByRole('button', { name });
      expect(link.closest('.ui-inspector__actions')).toBeTruthy();
      expect(link.className).toContain('ui-link');
    }
  });

  it('opens its dialogs from a Details grid of buttons under the rows (CHG-190)', () => {
    mount(row());
    const grid = screen.getByRole('region', { name: 'Details' });
    expect(grid.closest('.ui-inspector__body')).toBeNull();
    const buttons = within(grid).getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Feature flags›', 'Sample density›', 'Engine & timing›']);
    for (const b of buttons) expect(b.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('makes Inspect this window → the full-width primary at the foot (CHG-190)', () => {
    mount(row());
    const inspect = screen.getByRole('button', { name: 'Inspect this window →' });
    expect(inspect.closest('.ui-inspector__foot')).toBeTruthy();
    expect(inspect.getAttribute('data-full-width')).toBe('true');
    expect(document.querySelector('.ui-inspector--reference')).toBeTruthy();
  });

  it('shows each of the two links once in the panel (B9)', () => {
    mount(row());
    expect(screen.getAllByRole('button', { name: 'Historical ↗' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Trend ↗' })).toHaveLength(1);
  });
});
