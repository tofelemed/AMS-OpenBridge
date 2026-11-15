// CHG-165: Steps & data: how the kernel decided. Steps A–H as cards and every quantity, the reported ones first; not-applicable rows
// stay listed, muted, with their reason, never as 0. CHG-195 (owner review item 19): a step's outputs open in a dialog in plain
// words, the Event panel is gone, All quantities is the full-width standard table without the method column.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { StepsDataTab } from './StepsDataTab';

vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; variant?: string }) => React.createElement('button', { onClick: p.onClick, 'data-variant': p.variant }, p.children),
}));
afterEach(cleanup);
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});
const metrics = [
  q({ quantityId: 'baseline_pv', unit: 'PV_EU', reasonIfNull: 'NO_VALID_BASELINE' }),
  q({ quantityId: 'process_gain', value: -76.552, unit: 'PV_EU/input_EU', uncertainty: 22.22, method: 'MODEL_FOPDT' }),
  q({ quantityId: 'iae', value: 5308.07, unit: 'PV_EU*s', method: 'OBSERVED_RESPONSE_V1' }),
];
const result: ResponseEventDetail['result'] = {
  event_id: 'e1', method_run_id: 'r1', loop_id: 'FIC10302', path_id: 'OP_TO_PV', evaluation_state: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', model_state: 'CANDIDATE',
  window_start_ms: Date.UTC(2026, 8, 17, 3, 25, 31), window_end_ms: Date.UTC(2026, 8, 17, 3, 28, 41), bundle_hash: 'f9153b00aaf3', purpose: 'LIVE', event_type: 'INPUT_TEST',
  subgates: {
    A: { state: 'EVALUATED', outputs: { path_id: 'OP_TO_PV', bandwidth: 'NOT_ASSESSED', path_reason: 'OP_ASSUMED_APPLIED', sample_grid_s: 4.03, u_applied_available: true } },
    E: { state: 'WAITING', outputs: { reason: 'NO_INDEPENDENT_EVENT_YET' } },
  },
};
const draw = () => render(<StepsDataTab result={result} metrics={metrics} timeZone="UTC" pvUnit="m3/h" />);

describe('StepsDataTab', () => {
  it('shows the eight steps as cards: name, state pill, one plain reason line; the outputs behind a button', () => {
    draw();
    const steps = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-subgate'));
    expect(steps).toHaveLength(8);
    expect(steps[4].textContent).toMatch(/E Validation/);
    expect(steps[4].textContent).toMatch(/Waiting/);
    expect(steps[4].textContent).toMatch(/no independent event yet/);
    expect(document.querySelector('details')).toBeNull();
    expect(within(steps[0]).getByRole('button', { name: '5 outputs' }).getAttribute('data-variant')).toBe('flat');
    expect(within(steps[4]).queryByRole('button')).toBeNull();
  });

  it("opens a step's outputs in a dialog: the step name, the loop and step under it, label / value rows in plain words", () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '5 outputs' }));
    const dialog = screen.getByRole('dialog', { name: 'Eligibility' });
    expect(dialog.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10302 · Step A');
    const rows = [...dialog.querySelectorAll('.cpm-kv')].map(r => [r.querySelector('.cpm-kv__label')?.textContent, r.querySelector('.cpm-kv__value')?.textContent]);
    expect(rows).toEqual([
      ['Path', 'OP → PV'],
      ['Bandwidth', 'Not assessed'],
      ['Path reason', 'OP assumed applied'],
      ['Sample interval (s)', '4.03'],
      ['Applied OP available', 'Yes'],
    ]);
    expect(dialog.textContent).not.toMatch(/_|OP_TO_PV|NOT_ASSESSED|true/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no Event panel (window, eligibility and finding, method, run, bundle, purpose)', () => {
    draw();
    expect(screen.queryByRole('region', { name: 'Event' })).toBeNull();
    expect(screen.queryByText('Window')).toBeNull();
    expect(screen.queryByText('Purpose')).toBeNull();
  });

  it('lists the reported quantities first and every one on request in the standard table, without a method column', () => {
    const { container } = draw();
    expect(container.querySelector('.cpm-response-pair')).toBeNull();                  // full width: nothing beside it
    expect(container.querySelector('.ui-table table')).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Quantity', 'Value', 'Support']);
    const pick = screen.getByRole('combobox', { name: 'Quantities shown' }) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: 'Reported (2)' })).toBeTruthy();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('5308.07 m3/h*s')).toBeTruthy();                       // the loop's unit, not PV_EU
    expect(screen.queryByText('OBSERVED_RESPONSE_V1')).toBeNull();
    fireEvent.change(pick, { target: { value: 'all' } });
    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[2].className).toBe('cpm-row--muted');
    expect(screen.getByText(/not applicable \(no valid baseline\)/)).toBeTruthy();
  });
});
