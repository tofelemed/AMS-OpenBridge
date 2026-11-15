// CHG-168: the editor shows a path under the loop's plant path as "…/tail", any other path whole. The state word is one word per
// state, the same on the list and the loop's page (CHG-201 moved both tests here when the side panel went).
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../../api/cpmApi';
import { stateOf } from '../registryShared';
import { abnormalPill } from '../registryGap';
import { shortPath } from './signalPath';

const P = 'hdpe/section_600/u6002';
const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC10401', assetId: null, displayName: 'Flow controller FIC10401 (FCS0101)', site: 'hdpe', area: 'section_600', unit: 'u6002',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}/fic10401.pv`, SP: `${P}/fic10401.sp`, OP: `${P}/fic10401.op`, MODE: `${P}/fic10401.mode` },
  observabilityFlags: ['NO_VP', 'NO_UPSTREAM_LINKS'], links: [], stepTestApproved: false, thresholdProfileId: null, ...over,
} as CpmLoop);

describe('shortPath', () => {
  it('shows a path under the plant path as …/tail, any other path whole', () => {
    expect(shortPath(`${P}/fic10401.pv`, loop())).toBe('…/fic10401.pv');
    expect(shortPath('site1/B2/aic30601.pv', loop())).toBe('site1/B2/aic30601.pv');
    expect(shortPath('HDPE/Section_600/U6002/fic10401.pv', loop())).toBe('…/fic10401.pv');
  });
});

describe('the state word', () => {
  it('is one word per state; only Not monitored and Retired show beside a tag', () => {
    expect(stateOf(loop({ tags: { VP: 'x' }, observabilityFlags: [] }))).toEqual({ label: 'Active', tone: 'good', glyph: '✓' });
    expect(stateOf(loop())).toEqual({ label: 'Degraded', tone: 'warn', glyph: '!' });
    expect(stateOf(loop({ monitoringEnabled: false }))).toEqual({ label: 'Not monitored', tone: 'muted', glyph: '○' });
    expect(stateOf(loop({ isActive: false }))).toEqual({ label: 'Retired', tone: 'muted', glyph: '⊘' });
    expect(abnormalPill(loop({ monitoringEnabled: false }))?.label).toBe('Not monitored');
    expect(abnormalPill(loop())).toBeNull();
  });
});
