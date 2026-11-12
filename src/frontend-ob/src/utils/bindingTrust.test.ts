/**
 * CHG-176 (owner, 12 Nov): how far a display trusts a binding. A binding from the asset model is used as today. A
 * "fallback" binding (derived from the path string) keeps its value but is shown NE107 Uncertain, never better than
 * the value's own quality. A fallback on a registered loop's signal is not read at all, and neither is one whose loop
 * check has not answered yet; a registry that cannot be read leaves the value shown, Uncertain.
 */
import { describe, expect, it } from 'vitest';
import { bindingTrust, loopSignalSet, signalPathSet, TRUST_REASON, worstTrust, type LoopSignalLookup } from './bindingTrust';
import { qualityInfo, qualityWithTrust } from './quality';

const LOOP_PV = 'hdpe/section_600/u6002/fic10401.pv';
const TAG = 'hdpe/section_100/u1001/pt10001.pv';
const ready = (tags: string[]): LoopSignalLookup => ({ status: 'ready', signals: new Set(tags) });

describe('bindingTrust', () => {
  it('trusts a binding from the asset model, and a path not answered yet', () => {
    expect(bindingTrust(TAG, { provenance: 'asset-model' }, { status: 'idle' })).toBe('asset-model');
    expect(bindingTrust(TAG, undefined, { status: 'idle' })).toBe('asset-model');
    expect(bindingTrust(undefined, { provenance: 'fallback' }, { status: 'idle' })).toBe('asset-model');
  });

  it('reads a fallback that is no loop signal, Uncertain', () => {
    expect(bindingTrust(TAG, { provenance: 'fallback' }, ready([LOOP_PV]))).toBe('fallback');
  });

  it('does not read a fallback on a registered loop signal (case and spaces do not hide it)', () => {
    expect(bindingTrust(LOOP_PV, { provenance: 'fallback' }, ready(loopSignalSet([{ tags: { PV: LOOP_PV } }])))).toBe('loop-unread');
    expect(bindingTrust(` ${LOOP_PV.toUpperCase()} `, { provenance: 'fallback' }, ready(loopSignalSet([{ tags: { PV: LOOP_PV } }])))).toBe('loop-unread');
  });

  it('reads nothing while the loop registry has not answered', () => {
    expect(bindingTrust(TAG, { provenance: 'fallback' }, { status: 'idle' })).toBe('loop-unread');
    expect(bindingTrust(TAG, { provenance: 'fallback' }, { status: 'pending' })).toBe('loop-unread');
  });

  it('reads a fallback, Uncertain, when the registry cannot be read', () => {
    expect(bindingTrust(LOOP_PV, { provenance: 'fallback' }, { status: 'unavailable' })).toBe('fallback');
  });
});

describe('loopSignalSet', () => {
  it('holds every signal of every loop (PV, SP, OP, MODE, VP), normalised', () => {
    const s = loopSignalSet([
      { tags: { PV: 'A/b.pv', SP: 'A/b.sp', OP: 'A/b.op', MODE: 'A/b.mode', VP: 'A/b.vp' } },
      { tags: {} },
      { tags: undefined as unknown as Record<string, string> },
    ]);
    expect([...s].sort()).toEqual(['a/b.mode', 'a/b.op', 'a/b.pv', 'a/b.sp', 'a/b.vp']);
  });
});

describe('signalPathSet (CHG-179)', () => {
  it('holds the signal-paths list trimmed and case-blind, without blanks', () => {
    const s = signalPathSet([' A/B.PV ', 'a/b.pv', 'a/b.sp', '', '  ']);
    expect([...s].sort()).toEqual(['a/b.pv', 'a/b.sp']);
    expect(bindingTrust(' A/B.SP', { provenance: 'fallback' }, ready([...s]))).toBe('loop-unread');
  });
});

describe('worstTrust', () => {
  it('orders loop-unread over fallback over asset-model', () => {
    expect(worstTrust([])).toBe('asset-model');
    expect(worstTrust(['asset-model', 'fallback', 'asset-model'])).toBe('fallback');
    expect(worstTrust(['fallback', 'loop-unread', 'asset-model'])).toBe('loop-unread');
  });
});

describe('qualityWithTrust', () => {
  it('leaves the quality untouched for a binding from the asset model', () => {
    const good = qualityInfo('good');
    expect(qualityWithTrust(good, 'asset-model')).toBe(good);
    expect(qualityWithTrust(null, 'asset-model')).toBeNull();
  });

  it('turns Good, or no quality yet, into Uncertain with the reason', () => {
    expect(qualityWithTrust(qualityInfo('good'), 'fallback')).toMatchObject({ state: 'uncertain', label: 'Uncertain', reason: TRUST_REASON.fallback });
    expect(qualityWithTrust(null, 'loop-unread')).toMatchObject({ state: 'uncertain', reason: TRUST_REASON['loop-unread'] });
  });

  it('never upgrades a worse quality', () => {
    for (const state of ['bad', 'maintenance', 'outOfService', 'uncertain'] as const) {
      expect(qualityWithTrust(qualityInfo(state), 'fallback')).toMatchObject({ state, reason: TRUST_REASON.fallback });
    }
  });

  it('words the two reasons as the owner gave them', () => {
    expect(TRUST_REASON.fallback).toBe('Binding not confirmed by the asset model');
    expect(TRUST_REASON['loop-unread']).toBe('Loop signal not resolved: the asset model did not answer');
  });
});
