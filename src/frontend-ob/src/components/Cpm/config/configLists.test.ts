// CHG-169 (owner review): one order and one gate dropdown on Effective and in a bundle. Properties are listed in catalogue order
// on both (Effective sorted alphabetically while the editor used catalogue order); the gate dropdown names each gate ("G4 ·
// Actuator effort") and carries its count in the option ("· 3 set above factory" on Effective, "· 1 invalid" in a bundle).
import { describe, expect, it } from 'vitest';
import { bundleGateOptions, catalogueOrder, effectiveGateOptions, invalidByGate } from './configLists';
import type { CatalogueEntry, EffectiveConfig } from '../../../api/cpm/config';

const entries = [
  { property: 'G0.mode', gate: 'G0' }, { property: 'G0.coverage_min', gate: 'G0' }, { property: 'G4.activity_warn_ratio', gate: 'G4' },
  { property: 'G4.activity_high_ratio', gate: 'G4' }, { property: 'G12.noise_multiplier', gate: 'G12' },
] as CatalogueEntry[];

describe('catalogueOrder', () => {
  it('orders property keys as the catalogue lists them; keys it does not know go last, alphabetically', () => {
    expect(catalogueOrder(['G4.activity_high_ratio', 'G0.coverage_min', 'G9.unknown_b', 'G0.mode', 'G9.unknown_a'], entries))
      .toEqual(['G0.mode', 'G0.coverage_min', 'G4.activity_high_ratio', 'G9.unknown_a', 'G9.unknown_b']);
  });
  it('without the catalogue the keys are alphabetical', () => {
    expect(catalogueOrder(['b', 'a'], undefined)).toEqual(['a', 'b']);
  });
});

describe('effectiveGateOptions', () => {
  const eff = {
    properties: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 4.5, 'G12.noise_multiplier': 4 },
    sources: { 'G0.mode': 'FACTORY', 'G0.coverage_min': 'PROFILE', 'G4.activity_warn_ratio': 'LOOP', 'G12.noise_multiplier': 'NO_VALUE' },
  } as unknown as EffectiveConfig;
  it('names each gate and counts what a layer above FACTORY sets, in gate order', () => {
    expect(effectiveGateOptions(eff).map(o => o.label)).toEqual(['G0 · Data quality · 1 set above factory', 'G4 · Actuator effort · 1 set above factory', 'G12 · Step-test evidence']);
    expect(effectiveGateOptions(eff).map(o => o.value)).toEqual(['G0', 'G4', 'G12']);
  });
});

describe('bundleGateOptions', () => {
  it('lists every gate by name with its invalid count', () => {
    const opts = bundleGateOptions({ G4: 1 });
    expect(opts).toHaveLength(17);
    expect(opts.find(o => o.value === 'G4')!.label).toBe('G4 · Actuator effort · 1 invalid');
    expect(opts.find(o => o.value === 'G0')!.label).toBe('G0 · Data quality');
  });
  it('counts the invalid properties of each gate from the validation errors', () => {
    expect(invalidByGate(entries, ["'G4.activity_warn_ratio' above the maximum", 'G0.mode must be one of …', 'a general error'])).toEqual({ G4: 1, G0: 1 });
  });
});
