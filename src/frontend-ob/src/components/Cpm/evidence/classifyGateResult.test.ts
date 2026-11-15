// v2.5 Task 2E.1 (spec §3.5; NR-034): a gate cell in the workbench is always in ONE stated state;
// "no chart" is never silent - each state names its reason and the next valid action. The 2026-09-17
// audit added NOT_RETAINED (policy, not a wait) and SHORT_TIER (a short gate on a fused row).
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
  // CHG-188 (owner review 10.2, 10.3): the evaluated window shows its evidence; only other non-live runs are shadow runs
  it('shows an evaluated window (EVALUATE) like any run, and keeps the shadow state for other non-live runs', () => {
    expect(classifyGateResult(base({ methodRun: { purpose: 'EVALUATE' } })).kind).toBe('READY');
    expect(classifyGateResult(base({ methodRun: { purpose: 'SHADOW' } })).kind).toBe('SHADOW');
  });
  it('NO_RESULT when the method run cannot be resolved', () => {
    expect(classifyGateResult(base({ cell: null, methodRun: null })).kind).toBe('NO_RESULT');
  });
  it('UNSUPPORTED_METHOD when the gate has no method, with the reason in words and no build wording or method code (CHG-184)', () => {
    const s = classifyGateResult(base({ catalogue: { capabilityState: 'UNAVAILABLE', capabilityReason: 'INTERACTION_METHOD_NOT_INSTALLED', method: { id: 'G13.PEER_LINK_FLAG', version: 'legacy', state: 'LEGACY_FLAG_ONLY' } } }));
    expect(s.kind).toBe('UNSUPPORTED_METHOD');
    expect(s.title).toBe('Method not available');
    expect(s.detail).toMatch(/^Reason: /);
    expect(`${s.title} ${s.detail}`).not.toMatch(/build|G13.PEER_LINK_FLAG|LEGACY_FLAG_ONLY/);
  });
  it('NOT_EVALUATED is a verdict, distinct from missing evidence', () => {
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'NOT_EVALUATED', reason: 'G0_FAIL' } })).kind).toBe('NOT_EVALUATED');
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'NOT_EVALUATED', reason: 'G0_FAIL' } })).detail).toBe('Reason: window failed data qualification.');
  });
  it('NOT_RETAINED when nothing was kept for the run (policy, not a wait) and EVIDENCE_PENDING only while chunks are arriving', () => {
    const none = classifyGateResult(base({ manifest: { readiness: 'NONE', count: 0 } }));
    expect(none.kind).toBe('NOT_RETAINED');
    expect(none.action).toBe('RECONSTRUCT');
    expect(none.title).toMatch(/not retained/i);
    expect(none.detail).toMatch(/windows with a finding/);
    expect(classifyGateResult(base({ manifest: { readiness: 'PENDING', count: 2 } })).kind).toBe('EVIDENCE_PENDING');
    expect(classifyGateResult(base({ manifest: { readiness: 'PARTIAL', count: 2 } })).kind).toBe('EVIDENCE_PENDING');
  });
  it('CHG-105: a G12 run with no charts never offers a reconstruction (event-keyed charts cannot be rebuilt)', () => {
    const g12 = classifyGateResult(base({ gate: 'G12', manifest: { readiness: 'NONE', count: 0 } }));
    expect(g12.kind).toBe('NOT_RETAINED');
    expect(g12.action).toBe('NONE');
    expect(g12.detail).toMatch(/cannot be rebuilt/);
    expect(g12.detail).not.toMatch(/Reconstruct/);
    expect(g12.detail).not.toMatch(/hours/);                   // CHG-196: a censored event keeps its charts as long as the event too
    // CHG-199: an accepted event's charts now leave before the event; System Response redraws its trends from the historian
    expect(g12.detail).not.toMatch(/as long as the event/);
    expect(g12.detail).toMatch(/redraw/);
  });
  // audit F8: G1-G4 opened on a fused (24h) row read "NOT_EVALUATED - no reason recorded - this is a verdict";
  // the truth is that short-tier gates are judged on the 1m-60m windows, and the fused row carries no
  // verdict for them - the state says so and points at the short windows of the same loop.
  it('SHORT_TIER for a short-tier gate on a fusion-tier run that carries no verdict for it, with a link to the short windows', () => {
    const s = classifyGateResult(base({ cell: { key: 'G3', status: 'NOT_EVALUATED', reason: null }, tier: 'fusion', gate: 'G3', loopId: 'FIC10302' }));
    expect(s.kind).toBe('SHORT_TIER');
    expect(s.title).toMatch(/1m.60m windows/);
    expect(s.link).toEqual({ label: 'Open the 15m windows of FIC10302 →', href: '/cpm/evidence?loop=FIC10302&kind=15m' });
    expect(s.action).toBe('NONE');
  });
  it('a short-tier gate WITH a recorded reason on a fused row, or on its own short run, is NOT_EVALUATED as before', () => {
    expect(classifyGateResult(base({ cell: { key: 'G3', status: 'NOT_EVALUATED', reason: 'G0_FAIL' }, tier: 'fusion', gate: 'G3', loopId: 'FIC10302' })).kind).toBe('NOT_EVALUATED');
    expect(classifyGateResult(base({ cell: { key: 'G3', status: 'NOT_EVALUATED', reason: null }, tier: 'short', gate: 'G3', loopId: 'FIC10302' })).kind).toBe('NOT_EVALUATED');
    expect(classifyGateResult(base({ cell: { key: 'G5', status: 'NOT_EVALUATED', reason: null }, tier: 'fusion', gate: 'G5', loopId: 'FIC10302' })).kind).toBe('NOT_EVALUATED');
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
