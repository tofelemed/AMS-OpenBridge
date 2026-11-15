// CHG-165: the words of the System Response tabs: an event named once in the band, the model behind an event row.
import { describe, expect, it } from 'vitest';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import * as labels from './responseLabels';
import { eventPick, modelBrief, modelOfEvent, pathLabel, typeLabel } from './responseLabels';

const ev = (over: Partial<ResponseEventSummary> = {}): ResponseEventSummary => ({
  eventId: 'e1', methodRunId: '6a1e89ce55aa', eventType: 'INPUT_TEST', pathId: 'OP_TO_PV', t0Ms: Date.UTC(2026, 9, 7, 5, 43, 24), tEndMs: Date.UTC(2026, 9, 7, 5, 47, 25),
  captureState: 'COMPLETE', censorReason: '', evaluationState: 'EVALUATED', eligibility: 'ELIGIBLE', finding: 'RESPONSE_CHARACTERISED', modelState: 'CANDIDATE',
  purpose: 'LIVE', bundleHash: 'b', resultRevision: 1, emittedAtMs: null, ...over,
});
const model = (over: Partial<SystemModel> = {}): SystemModel => ({
  modelId: 'm1', loopId: 'FIC1', pathId: 'OP_TO_PV', family: 'FOPDT', estimator: 'OE_LM_DELAY_PROFILE', uncertaintyMethod: '', trainingSupport: null, validationSupport: null,
  parameters: {
    process_gain: { value: 0.2134, unit: 'PV_EU/input_EU', uncertainty: null, method: 'MODEL_FOPDT', reason: null },
    dead_time: { value: 0, unit: 's', uncertainty: 2.5, method: 'MODEL_FOPDT', reason: null },
    time_constant: { value: 0.5, unit: 's', uncertainty: null, method: 'MODEL_FOPDT', reason: null },
  },
  modelState: 'CANDIDATE', approvedDomain: null, controllerSnapshotId: null, contextRevision: 1, createdFromEvent: 'e1', methodRunId: 'r1', bundleHash: 'b', revision: 1,
  reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: '2026-10-07T09:51:31Z', supersededBy: null, ...over,
});

describe('response labels', () => {
  it('says a path and an event type in words', () => {
    expect(pathLabel('OP_TO_PV')).toBe('OP → PV');
    expect(pathLabel('SLAVE_SP_TO_PV')).toBe('SLAVE SP → PV');
    expect(pathLabel('')).toBe('—');
    expect(typeLabel('INPUT_TEST')).toBe('Input test');
  });

  it('names an event in the band: time, type, path and its one state', () => {
    expect(eventPick(ev(), 'UTC')).toBe('7 Oct 05:43 · Input test · OP → PV · Candidate');
    expect(eventPick(ev({ captureState: 'CENSORED', censorReason: 'SUPERSEDED' }), 'UTC')).toMatch(/· Censored$/);
  });

  it('finds the model an event produced, the newest revision first', () => {
    const models = [model(), model({ modelId: 'm2', revision: 2 }), model({ modelId: 'm3', createdFromEvent: 'e9' })];
    expect(modelOfEvent(models, 'e1')?.modelId).toBe('m2');
    expect(modelOfEvent(models, 'e5')).toBeUndefined();
  });

  it('says a model in one line: family and its parameters', () => {
    expect(modelBrief(model())).toBe('FOPDT · K 0.21 · θ 0.00 s · τ 0.50 s');
    expect(modelBrief(model({ parameters: null }))).toBe('FOPDT');
  });

  // CHG-195 (owner review item 19): the foot line under every tab is gone, and its words with it
  it('has no foot line any more', () => {
    expect('eventFoot' in labels).toBe(false);
  });
});

// CHG-195 (owner review item 19): a step's outputs in plain words, the keys and the values
describe('step outputs in words', () => {
  it('names the known keys and humanises any other one: sentence case, no underscores, the unit in brackets', async () => {
    const { outputLabel } = await import('./responseLabels');
    expect(outputLabel('path_id')).toBe('Path');
    expect(outputLabel('sample_grid_s')).toBe('Sample interval (s)');
    expect(outputLabel('u_applied_available')).toBe('Applied OP available');
    expect(outputLabel('path_reason')).toBe('Path reason');
    expect(outputLabel('fit_ms')).toBe('Fit (ms)');
    expect(outputLabel('some_new_output')).toBe('Some new output');
  });

  it('says the values in words: a path with an arrow, codes in sentence case, yes and no', async () => {
    const { outputValue } = await import('./responseLabels');
    expect(outputValue('path_id', 'OP_TO_PV')).toBe('OP → PV');
    expect(outputValue('bandwidth', 'NOT_ASSESSED')).toBe('Not assessed');
    expect(outputValue('path_reason', 'OP_ASSUMED_APPLIED')).toBe('OP assumed applied');
    expect(outputValue('u_applied_available', true)).toBe('Yes');
    expect(outputValue('u_applied_available', false)).toBe('No');
    expect(outputValue('sample_grid_s', 4.03)).toBe('4.03');
    expect(outputValue('count', 12)).toBe('12');
    expect(outputValue('x', null)).toBe('—');
    expect(outputValue('note', 'grid 4 s is coarse')).toBe('grid 4 s is coarse');
  });
});
