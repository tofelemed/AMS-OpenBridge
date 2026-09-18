// 2026-09-18 Gate Configuration redesign: the effective configuration is read as a LAYER STACK (what each
// layer sets), a gate strip with override badges, and a one-line workers verdict - instead of a 165-row
// wall with "from" repeated per row.
import { describe, expect, it } from 'vitest';
import { bundleLabel, layerStack, overridesByGate, workersSummary } from './configSupport';
import type { EffectiveConfig } from '../../../api/cpm/config';

const eff = (over: Partial<EffectiveConfig> = {}): EffectiveConfig => ({
  loopId: 'TIC10101', site: 'hdpe', profileId: 'TEMP_SLOW_SELF_REG', state: 'NO_ACTIVE_BUNDLE', bundle: null,
  properties: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 4.5, 'G4.activity_alarm_ratio': 9, 'G12.noise_multiplier': 4 },
  sources: { 'G0.mode': 'FACTORY', 'G0.coverage_min': 'PROFILE', 'G4.activity_warn_ratio': 'LOOP', 'G4.activity_alarm_ratio': 'FACTORY', 'G12.noise_multiplier': 'FACTORY' },
  workers: [
    { jobName: 'AMS - CPLM Short Feature Engine', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb' },
    { jobName: 'AMS - CPLM Gate Fusion Engine', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb' },
  ],
  ...over,
});

describe('layerStack', () => {
  it('names every layer bottom-up with what it sets, the missing ones as "no bundle"', () => {
    const stack = layerStack(eff());
    expect(stack.map(l => [l.kind, l.count, l.present])).toEqual([['FACTORY', 3, true], ['PROFILE', 1, true], ['SITE', 0, false], ['LOOP', 1, true]]);
    expect(stack[1].ref).toBe('TEMP_SLOW_SELF_REG');
    expect(stack[3].ref).toBe('TIC10101');
    expect(stack[2].ref).toBe('hdpe');
  });
  it('says where a present layer comes from: the class pack, or the bundle at that level', () => {
    const withBundle = eff({ state: 'ACTIVE_VERIFIED', bundle: { bundleId: 'b', version: 2, contentHash: 'f9153b00aaf3ba1a', scopeKind: 'LOOP', scopeRef: 'TIC10101', changeClass: 'POLICY', effectiveFrom: '2026-09-17T06:36:16Z', catalogueHash: 'c' } });
    const stack = layerStack(withBundle);
    expect(stack.find(l => l.kind === 'LOOP')?.origin).toBe('bundle LOOP v2 · f9153b00');
    expect(stack.find(l => l.kind === 'PROFILE')?.origin).toBe('class pack');
    expect(stack.find(l => l.kind === 'FACTORY')?.origin).toBe('shipped defaults');
  });
});

describe('overridesByGate', () => {
  it('counts the properties a gate sets above FACTORY, and the total per gate', () => {
    const g = overridesByGate(eff());
    expect(g.G0).toEqual({ total: 2, overridden: 1 });
    expect(g.G4).toEqual({ total: 2, overridden: 1 });
    expect(g.G12).toEqual({ total: 1, overridden: 0 });
    expect(Object.keys(g)).toEqual(['G0', 'G4', 'G12']);
  });
});

describe('workersSummary', () => {
  it('one jar, catalogue matching, every ACK applied → good', () => {
    const e = eff({ bundle: { bundleId: 'b', version: 2, contentHash: 'h', scopeKind: 'LOOP', scopeRef: 'x', changeClass: 'POLICY', effectiveFrom: null, catalogueHash: '8bbcbbbb' },
      workers: eff().workers.map(w => ({ ...w, ack: { status: 'ACK', bundleHash: 'h', jarSha256: w.jarSha256, receivedAt: 't' } })) });
    expect(workersSummary(e)).toEqual({ text: '2 of 2 applied · one jar 4ea1da78 · catalogue matches', tone: 'good' });
  });
  it('the factory layer: workers are named, nothing to acknowledge', () => {
    expect(workersSummary(eff())).toEqual({ text: '2 workers on one jar 4ea1da78 · factory layer (nothing to acknowledge)', tone: 'muted' });
  });
  it('a missing or refused ACK, a second jar or a catalogue mismatch is said with a bad tone', () => {
    const e = eff({ bundle: { bundleId: 'b', version: 2, contentHash: 'h', scopeKind: 'LOOP', scopeRef: 'x', changeClass: 'POLICY', effectiveFrom: null, catalogueHash: '8bbcbbbb' },
      workers: [{ jobName: 'a', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb', ack: { status: 'ACK', bundleHash: 'h', jarSha256: '4ea1da78aaaa', receivedAt: 't' } },
                { jobName: 'b', jarSha256: '5555555555aa', catalogueHash: 'other', ack: null }] });
    const s = workersSummary(e);
    expect(s.tone).toBe('bad');
    expect(s.text).toMatch(/1 of 2 applied/);
    expect(s.text).toMatch(/2 jars/);
    expect(s.text).toMatch(/catalogue differs on 1/);
  });
});

describe('real-data semantics (lab 2026-09-18)', () => {
  it('a NO_VALUE source is "unset", never an override; an observer worker is neither counted nor blamed', () => {
    const e = eff({
      properties: { 'G0.mode': 'OPERATIONAL', 'G0.max_gap_s': null, 'G4.activity_warn_ratio': 4.5 },
      sources: { 'G0.mode': 'FACTORY', 'G0.max_gap_s': 'NO_VALUE', 'G4.activity_warn_ratio': 'PROFILE' },
      bundle: { bundleId: 'b', version: 1, contentHash: 'h', scopeKind: 'LOOP', scopeRef: 'x', changeClass: 'POLICY', effectiveFrom: null, catalogueHash: '8bbcbbbb' },
      workers: [
        { jobName: 'short', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb', required: true, ack: { status: 'ACK', bundleHash: 'h', jarSha256: '4ea1da78aaaa', receivedAt: 't' } },
        { jobName: 'instrument context', jarSha256: '4ea1da78aaaa', catalogueHash: '8bbcbbbb', required: false, ack: null },
      ],
    });
    expect(overridesByGate(e).G0).toEqual({ total: 2, overridden: 0 });
    expect(layerStack(e).map(l => l.count)).toEqual([1, 1, 0, 0]);
    expect(workersSummary(e)).toEqual({ text: '1 of 1 applied · one jar 4ea1da78 · catalogue matches', tone: 'good' });
  });
});

describe('bundleLabel', () => {
  it('names a bundle by level, version and short hash', () => {
    expect(bundleLabel({ scopeKind: 'LOOP', version: 2, contentHash: 'f9153b00aaf3ba1a3b19' })).toBe('LOOP v2 · f9153b00');
    expect(bundleLabel(null)).toBe('factory layer');
  });
});
