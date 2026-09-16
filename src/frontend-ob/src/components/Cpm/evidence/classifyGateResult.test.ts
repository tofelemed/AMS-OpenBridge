// v2.5 Task 2E.1 (spec §3.5; NR-034): a gate cell in the workbench is always in ONE of nine stated
// states; "no chart" is never silent - each state names its reason and the next valid action.
import { describe, it, expect } from 'vitest';
import { classifyGateResult, type GateStateInput } from './GateResultState';

const base = (over: Partial<GateStateInput> = {}): GateStateInput => ({
  loading: false,
  error: null,
  cell: { key: 'G5', status: 'WARN', reason: '' },
  catalogue: { capabilityState: 'INSTALLED', capabilityReason: null, method: { id: 'G5.ACF_OSCILLATION', version: '3.0.0', state: 'INSTALLED' } },
  manifest: { readiness: 'COMPLETE', count: 3 },
  methodRun: { purpose: 'LIVE' },
  ...over,
});

describe('classifyGateResult', () => {
  it('LOADING while any of the selection is in flight', () => {
    expect(classifyGateResult(base({ loading: true })).kind).toBe('LOADING');
  });
  it('FAILED_REQUEST on a transport or server error, with the message', () => {
    const s = classifyGateResult(base({ error: new Error('boom') }));
    expect(s.kind).toBe('FAILED_REQUEST');
    expect(s.detail).toContain('boom');
  });
  it('NO_RESULT when the method run cannot be resolved', () => {
    expect(classifyGateResult(base({ cell: null, methodRun: null })).kind).toBe('NO_RESULT');
  });
  it('UNSUPPORTED_METHOD when the build has no method for the gate, with the capability reason', () => {
    const s = classifyGateResult(base({ catalogue: { capabilityState: 'UNAVAILABLE', capabilityReason: 'INTERACTION_METHOD_NOT_INSTALLED', method: { id: 'G13.PEER_LINK_FLAG', version: 'legacy', state: 'LEGACY_FLAG_ONLY' } } }));
    expect(s.kind).toBe('UNSUPPORTED_METHOD');
    expect(s.detail).toContain('INTERACTION_METHOD_NOT_INSTALLED');
  });
  it('NOT_EVALUATED is a verdict, distinct from missing evidence', () => {
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'NOT_EVALUATED', reason: 'G0_FAIL' } })).kind).toBe('NOT_EVALUATED');
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'NOT_EVALUATED', reason: 'G0_FAIL' } })).detail).toContain('G0_FAIL');
  });
  it('EVIDENCE_PENDING when artifacts are not retained yet (or none exist) and offers reconstruction', () => {
    const none = classifyGateResult(base({ manifest: { readiness: 'NONE', count: 0 } }));
    expect(none.kind).toBe('EVIDENCE_PENDING');
    expect(none.action).toBe('RECONSTRUCT');
    expect(classifyGateResult(base({ manifest: { readiness: 'PENDING', count: 2 } })).kind).toBe('EVIDENCE_PENDING');
  });
  it('EVIDENCE_EXPIRED keeps the verdict valid and offers reconstruction', () => {
    const s = classifyGateResult(base({ manifest: { readiness: 'EXPIRED', count: 3 } }));
    expect(s.kind).toBe('EVIDENCE_EXPIRED');
    expect(s.action).toBe('RECONSTRUCT');
    expect(s.stillValid).toContain('verdict');
  });
  it('SHADOW when the run belongs to a shadow evaluation and DISABLED when the gate is switched off', () => {
    expect(classifyGateResult(base({ methodRun: { purpose: 'SHADOW' } })).kind).toBe('SHADOW');
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'DISABLED', reason: 'CONFIG' } })).kind).toBe('DISABLED');
  });
  it('READY when a COMPLETE manifest backs an evaluated cell', () => {
    expect(classifyGateResult(base()).kind).toBe('READY');
  });
});
