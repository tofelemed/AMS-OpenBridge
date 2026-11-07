// CHG-153: the valve-position gap list is the loops behind the Overview count, which counts monitored loops only
// (the Diagnostic capability tile's drill-down lists monitored loops).
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../api/cpmApi';
import { hasGap } from './registryGap';

const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'L1', isActive: true, monitoringEnabled: true, tags: {}, links: [], engineering: {}, model: { commandPath: 'OP_TO_VALVE' },
  ...over,
} as unknown as CpmLoop);

describe('hasGap vp', () => {
  it('counts a monitored loop that expects a valve position and has none', () => {
    expect(hasGap(loop(), 'vp')).toBe(true);
  });
  it('does not count a registered loop that is not monitored', () => {
    expect(hasGap(loop({ monitoringEnabled: false }), 'vp')).toBe(false);
  });
  it('does not count a retired loop', () => {
    expect(hasGap(loop({ isActive: false }), 'vp')).toBe(false);
  });
});

describe('hasGap peers', () => {
  it('counts a monitored loop that expects peers and has none', () => {
    expect(hasGap(loop(), 'peers')).toBe(true);
  });
  it('does not count a registered loop that is not monitored', () => {
    expect(hasGap(loop({ monitoringEnabled: false }), 'peers')).toBe(false);
  });
});
