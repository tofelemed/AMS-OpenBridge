// CHG-168 (owner review): the rules for what the selected loop's panel states, each fact once.
import { describe, expect, it } from 'vitest';
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import { stateOf } from '../registryShared';
import { abnormalPill } from '../registryGap';
import { otherChecks, otherFlags, panelRows, peerFact, recordRows, shortPath, signalRows, vpFact } from './loopPanelFacts';

const P = 'hdpe/section_600/u6002';
const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC10401', assetId: null, displayName: 'Flow controller FIC10401 (FCS0101)', site: 'hdpe', area: 'section_600', unit: 'u6002',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}/fic10401.pv`, SP: `${P}/fic10401.sp`, OP: `${P}/fic10401.op`, MODE: `${P}/fic10401.mode` },
  observabilityFlags: ['NO_VP', 'NO_UPSTREAM_LINKS'], links: [], stepTestApproved: false, thresholdProfileId: null,
  model: { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE',
    acquisition: { mode: 'PERIODIC' }, classificationSource: 'PRESET_FROM_LOOP_TYPE' },
  ...over,
} as CpmLoop);

const VPX = 'A valve position (VP) is expected here: map its tag so a valve (stiction) cause can be confirmed (G14).';
const PEERX = 'Add the loop\'s upstream / peer links in the asset model, then use "Re-project links & republish evidence" on this loop in the Loop Registry.';
const readiness = (checks: CpmReadiness['checks']): CpmReadiness => ({ loopId: 'FIC10401', ready: true, checks, blockers: [], warnings: [] });

describe('the state word', () => {
  it('is one word per state, the same in the list and the panel', () => {
    expect(stateOf(loop({ tags: { VP: 'x' }, observabilityFlags: [] }))).toEqual({ label: 'Active', tone: 'good', glyph: '✓' });
    expect(stateOf(loop())).toEqual({ label: 'Degraded', tone: 'warn', glyph: '!' });
    expect(stateOf(loop({ monitoringEnabled: false }))).toEqual({ label: 'Not monitored', tone: 'muted', glyph: '○' });
    expect(stateOf(loop({ isActive: false }))).toEqual({ label: 'Retired', tone: 'muted', glyph: '⊘' });
    expect(abnormalPill(loop({ monitoringEnabled: false }))?.label).toBe('Not monitored');
    expect(abnormalPill(loop())).toBeNull();
  });
});

describe('panel rows', () => {
  it('are plant path, type, criticality, gate profile and model', () => {
    expect(panelRows(loop())).toEqual([
      ['Plant path', 'hdpe / section_600 / u6002'], ['Loop type', 'FIC'], ['Criticality', 'medium'], ['Gate profile', 'default'],
      ['Model', 'FLOW · FAST_SELF_REG'],
    ]);
  });

  it('put objective, acquisition and how the model was set in Record details', () => {
    expect(recordRows(loop())).toEqual([
      { label: 'Objective · topology · command', value: 'TIGHT · SINGLE · OP_TO_VALVE' },
      { label: 'Acquisition', value: 'PERIODIC · grid undeclared' },
      { label: 'Model set by', value: 'The loop type', sub: 'Declare it in Edit configuration to make it explicit.' },
    ]);
    const explicit = loop({ model: { ...loop().model!, classificationSource: 'EXPLICIT', acquisition: { mode: 'RBE', gridSeconds: 5 } } });
    expect(recordRows(explicit).slice(1)).toEqual([
      { label: 'Acquisition', value: 'RBE · 5 s grid' }, { label: 'Model set by', value: 'Declared in the registry' },
    ]);
    expect(recordRows(loop({ model: null }))).toEqual([{ label: 'Acquisition', value: 'Not served' }]);
  });
});

describe('valve position and peer links', () => {
  it('say the VP state once, with the server advice behind it', () => {
    expect(vpFact(loop(), readiness([{ id: 'tag_vp', label: 'Signal VP', ok: false, message: VPX, state: 'EXPECTED_UNMAPPED' }])))
      .toEqual({ pill: ['warn', '!', 'Expected · not mapped'], advice: VPX });
    expect(vpFact(loop(), undefined)).toEqual({ pill: ['warn', '!', 'Expected · not mapped'], advice: null });
    const mapped = loop({ tags: { ...loop().tags, VP: `${P}/fic10401.vp` } });
    expect(vpFact(mapped, undefined)).toEqual({ pill: ['good', '✓', 'Mapped'], advice: null });
    expect(vpFact(mapped, readiness([{ id: 'tag_vp', label: 'Signal VP', ok: false, message: 'no samples', state: 'TEMPORARILY_UNAVAILABLE' }])))
      .toEqual({ pill: ['warn', '!', 'Mapped · no samples'], advice: 'no samples' });
    expect(vpFact(loop({ engineering: { vpApplicability: 'NOT_APPLICABLE' } }), undefined).pill).toEqual(['muted', '—', 'Not applicable']);
    expect(vpFact(loop({ engineering: { vpApplicability: 'NOT_INSTALLED' } }), undefined).pill).toEqual(['muted', '—', 'Not installed']);
  });

  it('say the peer links, or that they are expected and missing', () => {
    expect(peerFact(loop(), readiness([{ id: 'peer_links', label: 'Peer', ok: false, message: PEERX, state: 'EXPECTED_UNMAPPED' }])))
      .toEqual({ pill: ['warn', '!', 'None · expected'], advice: PEERX });
    expect(peerFact(loop({ links: [{ toLoopId: 'G13_LOOP_B', relType: 'PEER', origin: 'x' }] }), undefined)).toEqual({ text: 'PEER → G13_LOOP_B' });
    expect(peerFact(loop({ engineering: { peerApplicability: 'NOT_APPLICABLE' } }), undefined)).toEqual({ pill: ['muted', '—', 'Not applicable'], advice: null });
  });

  it('leave the other unmet checks and flags their own rows', () => {
    const r = readiness([
      { id: 'monitoring_enabled', label: 'Monitoring enabled', ok: false, message: 'Re-activate with enableMonitoring=true.' },
      { id: 'tag_pv', label: 'Signal PV', ok: false, message: 'Map the PV role at onboarding.' },
      { id: 'tag_vp', label: 'Signal VP', ok: false, message: VPX, state: 'EXPECTED_UNMAPPED' },
      { id: 'peer_links', label: 'Peer', ok: false, message: PEERX, state: 'EXPECTED_UNMAPPED' },
      { id: 'tag_vp2', label: 'Not here', ok: false, message: null, state: 'NOT_APPLICABLE' },
      { id: 'cplm_jobs', label: 'CPLM Flink jobs running', ok: true, message: null },
    ]);
    expect(otherChecks(r)).toEqual([{ id: 'monitoring_enabled', label: 'Monitoring enabled', message: 'Re-activate with enableMonitoring=true.' }]);
    expect(otherFlags(loop({ observabilityFlags: ['NO_VP', 'NO_UPSTREAM_LINKS', 'NO_PV_SPAN'] }))).toEqual(['NO_PV_SPAN']);
  });
});

describe('signals', () => {
  it('list each required role, a missing one with its advice, and VP only when mapped', () => {
    const r = readiness([{ id: 'tag_mode', label: 'Signal MODE', ok: false, message: 'Map the MODE role at onboarding.' }]);
    const tags = { PV: `${P}/fic10401.pv`, SP: `${P}/fic10401.sp`, OP: `${P}/fic10401.op` };
    expect(signalRows(loop({ tags }), r)).toEqual([
      { role: 'PV', path: `${P}/fic10401.pv`, advice: null },
      { role: 'SP', path: `${P}/fic10401.sp`, advice: null },
      { role: 'OP', path: `${P}/fic10401.op`, advice: null },
      { role: 'MODE', path: null, advice: 'Map the MODE role at onboarding.' },
    ]);
    expect(signalRows(loop({ tags: { ...tags, MODE: 'm/m', VP: `${P}/fic10401.vp` } }), undefined).map(s => s.role)).toEqual(['PV', 'SP', 'OP', 'MODE', 'VP']);
  });

  it('show a path under the plant path as …/tail, any other path whole', () => {
    expect(shortPath(`${P}/fic10401.pv`, loop())).toBe('…/fic10401.pv');
    expect(shortPath('site1/B2/aic30601.pv', loop())).toBe('site1/B2/aic30601.pv');
    expect(shortPath('HDPE/Section_600/U6002/fic10401.pv', loop())).toBe('…/fic10401.pv');
  });
});
