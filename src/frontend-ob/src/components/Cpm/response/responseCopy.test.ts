// 2026-09-17 audit F19/F20: the response page reads in words - one state per event row with a one-line
// finding, a result card that names the model with its parameters and the validation verdict, key
// results separated from the 52-row catalogue (not-applicable rows stated, greyed, never 0).
import { describe, expect, it } from 'vitest';
import { eventRowView, humanise, keyResults, resultSummary, subgateSteps } from './responseCopy';
import type { ResponseEventSummary, ResponseQuantity } from '../../../api/cpm/response';

const ev = (over: Partial<ResponseEventSummary>): ResponseEventSummary => ({
  eventId: 'e1', methodRunId: 'r1', eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: 0, tEndMs: 60_000, captureState: 'COMPLETE', censorReason: '',
  evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'CANDIDATE', purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null, ...over,
});
const q = (over: Partial<ResponseQuantity> & { quantityId: string }): ResponseQuantity => ({
  value: null, unit: '', pathId: 'OP_TO_PV', uncertainty: null, method: '', supportFromMs: null, supportToMs: null, configHash: 'b', reasonIfNull: '', ...over,
});

describe('eventRowView', () => {
  it('names one state per row and says the finding in words', () => {
    expect(eventRowView(ev({}))).toMatchObject({ censored: false, state: 'CANDIDATE', tone: 'warn', finding: 'Response characterised · model candidate' });
    expect(eventRowView(ev({ modelState: 'VALIDATED' }))).toMatchObject({ state: 'VALIDATED', tone: 'good' });
    expect(eventRowView(ev({ modelState: 'REJECTED' }))).toMatchObject({ state: 'REJECTED', tone: 'bad', finding: 'Response characterised · model rejected' });
    expect(eventRowView(ev({ captureState: 'CENSORED', evaluationState: 'CENSORED', censorReason: 'SOURCE_GAP', finding: 'SOURCE_GAP', modelState: 'NONE' })))
      .toMatchObject({ censored: true, state: 'CENSORED', tone: 'muted', finding: 'Candidate censored · source gap' });
    expect(eventRowView(ev({ eligibility: 'INELIGIBLE', finding: 'PATH_UNAVAILABLE', modelState: 'NONE' }))).toMatchObject({ state: 'INELIGIBLE', tone: 'bad', finding: 'Ineligible · path unavailable' });
  });
  it('humanise lowers a code to words', () => {
    expect(humanise('SUPERSEDED_BY_EVENT')).toBe('superseded by event');
    expect(humanise('')).toBe('');
  });
});

describe('resultSummary', () => {
  const metrics = [
    q({ quantityId: 'process_gain', value: -76.552, unit: 'PV_EU/input_EU', uncertainty: 22.22, method: 'MODEL_FOPDT' }),
    q({ quantityId: 'dead_time', value: 71.97, unit: 's', method: 'MODEL_FOPDT' }),
    q({ quantityId: 'time_constant', value: 2253.49, unit: 's', uncertainty: 688.2, method: 'MODEL_FOPDT' }),
    q({ quantityId: 'integrating_gain', unit: 'PV_EU/(input_EU*s)', reasonIfNull: 'NOT_INTEGRATING_OR_NOT_IDENTIFIABLE' }),
    q({ quantityId: 'iae', value: 5308.07, unit: 'PV_EU*s', method: 'OBSERVED_RESPONSE_V1' }),
  ];
  const result = {
    event_id: 'e1', method_run_id: 'r1', loop_id: 'FIC10302', path_id: 'OP_TO_PV', evaluation_state: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', model_state: 'CANDIDATE',
    window_start_ms: 0, window_end_ms: 1, bundle_hash: 'b', purpose: 'LIVE',
    subgates: {
      D: { state: 'ESTIMATED', outputs: { legality: 'OK', reason: '', method_id: 'OE_LM_DELAY_PROFILE', fit_ms: 3099 } },
      E: { state: 'WAITING', outputs: { reason: 'NO_INDEPENDENT_EVENT_YET' } },
      H: { state: 'NOT_EVALUATED', outputs: { reason: 'MODEL_NOT_VALIDATED' } },
    },
  };
  it('names the model family from the kernel method, its parameters with ± and units, and the validation verdict', () => {
    const s = resultSummary(result, metrics);
    expect(s.family).toBe('FOPDT');
    expect(s.headline).toBe('FOPDT model · candidate');
    expect(s.parameters.map(p => `${p.label}: ${p.text}`)).toEqual(['Process gain K: -76.55 PV_EU/input_EU ± 22.22', 'Dead time θ: 71.97 s', 'Time constant τ: 2253.49 s ± 688.20']);
    expect(s.validation).toEqual({ state: 'WAITING', text: 'Waiting · no independent event yet' });
    expect(s.identifiability).toMatch(/estimated by OE_LM_DELAY_PROFILE/i);
  });
  it('states no model when estimation did not run', () => {
    const s = resultSummary({ ...result, model_state: 'NONE', finding: 'SOURCE_GAP', subgates: { D: { state: 'NOT_RUN', outputs: { reason: 'CENSORED' } } } }, []);
    expect(s.family).toBeNull();
    expect(s.headline).toBe('No model estimated');
    expect(s.identifiability).toMatch(/censored/);
  });
  it('keyResults keeps the catalogue order, flags not-applicable rows and drops absent ones', () => {
    const k = keyResults(metrics);
    expect(k.map(r => r.id)).toEqual(['process_gain', 'integrating_gain', 'dead_time', 'time_constant', 'iae']);
    expect(k.find(r => r.id === 'integrating_gain')).toMatchObject({ applicable: false, text: 'not applicable (not integrating or not identifiable)' });
    expect(k.find(r => r.id === 'iae')).toMatchObject({ applicable: true, text: '5308.07 PV_EU*s' });
  });
  it('subgateSteps lists A–H with state and the reason in words', () => {
    const steps = subgateSteps(result.subgates);
    expect(steps).toHaveLength(8);
    expect(steps[3]).toMatchObject({ key: 'D', name: 'Estimation', state: 'ESTIMATED', reason: '' });
    expect(steps[4]).toMatchObject({ key: 'E', name: 'Validation', state: 'WAITING', reason: 'no independent event yet' });
    expect(steps[0]).toMatchObject({ key: 'A', state: 'NOT_RUN' });
  });
});
