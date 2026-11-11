// 2026-09-17 audit F5/F19: the result card opens the centre with the answer - model family, parameters
// with ± and units, the validation verdict and one identifiability sentence - and reserves its height
// with a skeleton while the event loads (never a blank centre). The aside puts the subgates as steps,
// the key results first; the 52-row catalogue opens as a wide centre card (Phase 7), not-applicable rows greyed.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResultCard } from './ResultCard';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});
const metrics = [
  q({ quantityId: 'process_gain', value: -76.552, unit: 'PV_EU/input_EU', uncertainty: 22.22, method: 'MODEL_FOPDT' }),
  q({ quantityId: 'dead_time', value: 71.97, unit: 's', method: 'MODEL_FOPDT' }),
  q({ quantityId: 'time_constant', value: 2253.49, unit: 's', uncertainty: 688.2, method: 'MODEL_FOPDT' }),
  q({ quantityId: 'integrating_gain', unit: 'PV_EU/(input_EU*s)', reasonIfNull: 'NOT_INTEGRATING_OR_NOT_IDENTIFIABLE' }),
  q({ quantityId: 'baseline_pv', unit: 'PV_EU', reasonIfNull: 'NO_VALID_BASELINE' }),
  q({ quantityId: 'iae', value: 5308.07, unit: 'PV_EU*s', method: 'OBSERVED_RESPONSE_V1' }),
];
const result: ResponseEventDetail['result'] = {
  event_id: 'e1', method_run_id: 'r1', loop_id: 'FIC10302', path_id: 'OP_TO_PV', evaluation_state: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', model_state: 'CANDIDATE',
  window_start_ms: Date.UTC(2026, 8, 17, 3, 25, 31), window_end_ms: Date.UTC(2026, 8, 17, 3, 28, 41), bundle_hash: 'f9153b00aaf3ba1ac68e1465692ca5be47d211b1', purpose: 'LIVE', event_type: 'INPUT_TEST',
  subgates: {
    A: { state: 'EVALUATED', outputs: { path_id: 'OP_TO_PV', bandwidth: 'NOT_ASSESSED' } },
    D: { state: 'ESTIMATED', outputs: { legality: 'OK', reason: '', method_id: 'OE_LM_DELAY_PROFILE', fit_ms: 3099 } },
    E: { state: 'WAITING', outputs: { reason: 'NO_INDEPENDENT_EVENT_YET' } },
    H: { state: 'NOT_EVALUATED', outputs: { reason: 'MODEL_NOT_VALIDATED' } },
  },
};

describe('ResultCard', () => {
  it('reserves its place while loading and then states the model, its parameters and the verdict', () => {
    const { rerender } = render(<ResultCard result={undefined} metrics={undefined} loading={true} />);
    expect(screen.getByRole('region', { name: 'Result' }).getAttribute('aria-busy')).toBe('true');
    rerender(<ResultCard result={result} metrics={metrics} loading={false} />);
    expect(screen.getByRole('heading', { name: 'FOPDT model' })).toBeTruthy();
    expect(screen.getByText('Candidate')).toBeTruthy();                                  // CHG-165: the state once, as the pill
    expect(screen.getByText(/-76\.55 PV unit\/% OP ± 22\.22/)).toBeTruthy();         // no PV unit registered: said so, as on Models
    expect(screen.getByText(/Waiting · no independent event yet/)).toBeTruthy();
    expect(screen.queryByText(/candidate table below/)).toBeNull();
  });

  it("says the units in the loop's PV unit and the input the model came from, not the kernel placeholders", () => {
    render(<ResultCard result={result} metrics={metrics} loading={false} pvUnit="m3/h" />);
    expect(screen.getByText('-76.55 m3/h/% OP ± 22.22')).toBeTruthy();
    expect(screen.queryByText(/PV_EU/)).toBeNull();
  });

  it('says why when no model was estimated', () => {
    render(<ResultCard result={{ ...result, model_state: 'NONE', subgates: { D: { state: 'NOT_RUN', outputs: { reason: 'CENSORED' } } } }} metrics={[]} loading={false} />);
    expect(screen.getByRole('heading', { name: 'No model estimated' })).toBeTruthy();
    expect(screen.getByText(/No model was estimated: censored/)).toBeTruthy();
  });
});
