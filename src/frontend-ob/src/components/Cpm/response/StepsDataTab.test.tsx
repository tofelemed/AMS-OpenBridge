// CHG-165: Steps & data: how the kernel decided. Steps A–H as cards (outputs on demand), the event's identity, and every
// quantity, the reported ones first; not-applicable rows stay listed, muted, with their reason, never as 0.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { StepsDataTab } from './StepsDataTab';

vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
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
    A: { state: 'EVALUATED', outputs: { path_id: 'OP_TO_PV', bandwidth: 'NOT_ASSESSED' } },
    E: { state: 'WAITING', outputs: { reason: 'NO_INDEPENDENT_EVENT_YET' } },
  },
};
const draw = () => render(<StepsDataTab result={result} metrics={metrics} timeZone="UTC" methodRunId="r1" resultRevision={1} pvUnit="m3/h" />);

describe('StepsDataTab', () => {
  it('shows the eight steps with their state and reason, outputs behind a disclosure', () => {
    draw();
    const steps = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-subgate'));
    expect(steps).toHaveLength(8);
    expect(steps[4].textContent).toMatch(/E Validation/);
    expect(steps[4].textContent).toMatch(/Waiting/);
    expect(steps[4].textContent).toMatch(/no independent event yet/);
    expect(steps[0].querySelector('details summary')?.textContent).toBe('2 outputs');
  });

  it('names the event once: window, eligibility and finding, method, run, bundle and purpose', () => {
    draw();
    expect(screen.getByText('Window').parentElement!.textContent).toMatch(/^Window\s*17 Sept? 03:25 → 17 Sept? 03:28 UTC$/);
    expect(screen.getByText(/Eligible · response characterised/)).toBeTruthy();
    expect(screen.getByText(/LIVE · rev 1/)).toBeTruthy();
  });

  it('lists the reported quantities first and every one on request, not-applicable rows muted with their reason', () => {
    draw();
    const pick = screen.getByRole('combobox', { name: 'Quantities shown' }) as HTMLSelectElement;
    expect(screen.getByRole('option', { name: 'Reported (2)' })).toBeTruthy();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByText('5308.07 m3/h*s')).toBeTruthy();                       // the loop's unit, not PV_EU
    fireEvent.change(pick, { target: { value: 'all' } });
    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[2].getAttribute('data-applicable')).toBe('false');
    expect(screen.getByText(/not applicable \(no valid baseline\)/)).toBeTruthy();
  });
});
