import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api/apiFetch';
import type { EvaluationRun } from '../../../api/cpm/evaluation';
import { evaluationRefusal, evaluationSettled, evaluationStatus, openableVerdict, requestedEnd, requestedStart, VERDICT_WAIT_MS } from './evaluationState';

const NOW = Date.parse('2026-11-04T10:07:30Z');
const run = (o: Partial<EvaluationRun>): EvaluationRun => ({
  analysisRunId: 'r1', loopId: 'TIC1', purpose: 'EVALUATE', state: 'QUEUED', cached: false, windowKind: '12h',
  fromMs: 0, toMs: 1, statusUrl: '/x', ...o,
});

describe('requestedEnd / requestedStart', () => {
  it('empty input is now, floored to the 15-min grid', () => {
    expect(new Date(requestedEnd('', NOW)).toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });
  it('a future pick is clamped to now; a past pick is floored', () => {
    expect(requestedEnd('2030-01-01T00:00', NOW)).toBe(Date.parse('2026-11-04T10:00:00Z'));
    const past = Date.parse('2026-11-01T08:20');
    expect(requestedEnd('2026-11-01T08:20', NOW)).toBe(Math.floor(past / 900_000) * 900_000);
  });
  it('the start is the end minus the length', () => {
    expect(requestedStart(NOW, '24h')).toBe(NOW - 86_400_000);
    expect(requestedStart(NOW, '4h')).toBe(NOW - 14_400_000);
  });
});

describe('evaluationSettled / openableVerdict', () => {
  it('queued and running keep polling', () => {
    expect(evaluationSettled(run({ state: 'QUEUED' }), NOW)).toBe(false);
    expect(evaluationSettled(run({ state: 'RUNNING' }), NOW)).toBe(false);
  });
  it('FINISHED before its verdict row keeps polling, then gives up after the wait', () => {
    const r = run({ state: 'FINISHED', gateResults: 0, verdictMethodRunId: 'g15', finishedAt: new Date(NOW - 5_000).toISOString() });
    expect(evaluationSettled(r, NOW)).toBe(false);
    expect(openableVerdict(r)).toBeUndefined();
    expect(evaluationSettled(r, NOW + VERDICT_WAIT_MS)).toBe(true);
  });
  it('FINISHED with its verdict stored opens the G15 run; FAILED settles and opens nothing', () => {
    const r = run({ state: 'FINISHED', gateResults: 1, verdictMethodRunId: 'g15' });
    expect(evaluationSettled(r, NOW)).toBe(true);
    expect(openableVerdict(r)).toBe('g15');
    const f = run({ state: 'FAILED', error: 'NO_HISTORIAN_DATA: root.hdpe.cpm.TIC1' });
    expect(evaluationSettled(f, NOW)).toBe(true);
    expect(openableVerdict(f)).toBeUndefined();
  });
});

describe('evaluationStatus', () => {
  it('names each state in plain words', () => {
    expect(evaluationStatus(undefined)).toBeNull();
    expect(evaluationStatus(run({ state: 'RUNNING' }))!.tone).toBe('warn');
    expect(evaluationStatus(run({ state: 'FINISHED', samples: 8640, elapsedMs: 2300 }))!.text).toMatch(/8,640 samples, 2\.3 s/);
    expect(evaluationStatus(run({ state: 'FINISHED', cached: true }))!.text).toMatch(/earlier/);
  });
  it('maps the job and timeout codes, and shows an unknown one as it is', () => {
    expect(evaluationStatus(run({ state: 'FAILED', error: 'NO_HISTORIAN_DATA: dev' }))!.text).toMatch(/no samples/);
    expect(evaluationStatus(run({ state: 'FAILED', error: 'NO_RESPONSE_FROM_EVALUATION_JOB' }))!.text).toMatch(/On-Demand Evaluation/);
    expect(evaluationStatus(run({ state: 'FAILED', error: 'WEIRD: x' }))!.text).toBe('The evaluation failed: WEIRD: x');
  });
});

describe('evaluationRefusal', () => {
  it('maps the API refusals by their error code', () => {
    expect(evaluationRefusal(null)).toBeNull();
    expect(evaluationRefusal(new ApiError(429, 'x', 'TOO_MANY_EVALUATIONS_IN_FLIGHT'))).toMatch(/3 evaluations/);
    expect(evaluationRefusal(new ApiError(400, 'x', 'INVALID_WINDOW'))).toMatch(/retention/);
    expect(evaluationRefusal(new ApiError(403, 'Forbidden'))).toMatch(/not allowed/);
    expect(evaluationRefusal(new Error('boom'))).toMatch(/boom/);
  });
});
