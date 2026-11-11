// CHG-165: the words of the System Response tabs: an event named once in the band, the model behind an event row, the foot.
import { describe, expect, it } from 'vitest';
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { eventFoot, eventPick, modelBrief, modelOfEvent, pathLabel, typeLabel } from './responseLabels';

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

  it('says the event once in the foot: type, period, path and run', () => {
    expect(eventFoot(ev(), 'UTC')).toBe('Input test · 7 Oct 05:43 → 7 Oct 05:47 UTC · OP → PV · run 6a1e89ce');
  });
});
