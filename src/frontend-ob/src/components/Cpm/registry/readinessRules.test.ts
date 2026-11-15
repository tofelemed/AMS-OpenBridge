// CHG-201 (owner, 15 Nov 2026): ONE rule for "Ready for analysis", used by the list column and the detail page's checklist.
// From the loop record: the four signals, units and ranges, the valve position (only when expected), linked loops (only when
// expected), monitoring and the loop type; from the server readiness (detail page only): signals the plant model does not hold.
// Each missing item says why it matters and how to fix it, in plain words, no gate code.
import { describe, expect, it } from 'vitest';
import type { CpmLoop, CpmReadinessCheck } from '../../../api/cpmApi';
import { loopReadiness, readinessPill } from './readinessRules';

const P = 'hdpe/a/u';
const full = { PV: `${P}/l.pv`, SP: `${P}/l.sp`, OP: `${P}/l.op`, MODE: `${P}/l.mode`, VP: `${P}/l.vp` };
const ranges = { pvMin: 0, pvMax: 2500, pvUnit: 'kg/h', opMin: 0, opMax: 100 };
const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC1', assetId: null, displayName: 'Feed', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', criticality: 'medium',
  isActive: true, monitoringEnabled: true, tags: full, observabilityFlags: [], links: [{ toLoopId: 'FIC2', relType: 'PEER', origin: 'x' }],
  stepTestApproved: false, thresholdProfileId: null, engineering: ranges, ...over,
} as CpmLoop);
const titles = (l: CpmLoop, checks?: CpmReadinessCheck[]) => loopReadiness(l, checks ? { checks } : undefined).items.map(i => `${i.ok ? '✓' : '!'} ${i.title}`);

describe('loopReadiness', () => {
  it('is ready when every item is set', () => {
    const r = loopReadiness(loop());
    expect(r.missing).toBe(0);
    expect(titles(loop())).toEqual([
      '✓ Process value, setpoint, output and mode connected', '✓ Units and ranges set', '✓ Valve position connected', '✓ Linked loops set',
    ]);
    expect(r.items.every(i => !i.why)).toBe(true);
  });

  it('names the signals that are not connected, with why and how', () => {
    const r = loopReadiness(loop({ tags: { PV: full.PV, OP: full.OP, VP: full.VP } }));
    expect(r.missing).toBe(1);
    expect(r.items[0]).toEqual({
      key: 'signals', ok: false, title: 'Setpoint and mode not connected',
      why: 'Every check reads the process value, setpoint, output and mode. Connect them in Edit loop.',
    });
    expect(loopReadiness(loop({ tags: { PV: full.PV, SP: full.SP, MODE: full.MODE, VP: full.VP } })).items[0].why)
      .toBe('Every check reads the process value, setpoint, output and mode. Connect it in Edit loop.');
  });

  it('names the units and ranges that are not set', () => {
    const r = loopReadiness(loop({ engineering: { pvMin: 0, pvMax: 10 } }));
    expect(r.items[1]).toEqual({
      key: 'ranges', ok: false, title: 'Units and ranges not set',
      why: 'The checks judge the control error and the output against the ranges, and values are shown in the unit. Set the process value unit and output range in Edit loop.',
    });
    expect(loopReadiness(loop({ engineering: null })).items[1].why).toContain('Set the process value unit, process value range and output range in Edit loop.');
  });

  it('asks for the valve position only when one is expected', () => {
    const noVp = { PV: full.PV, SP: full.SP, OP: full.OP, MODE: full.MODE };
    const r = loopReadiness(loop({ tags: noVp }));
    expect(r.items.find(i => i.key === 'vp')).toEqual({
      key: 'vp', ok: false, title: 'Valve position not connected',
      why: 'The valve checks (sticking, wear) need it. Connect it in Edit loop, or mark the valve position as not fitted.',
    });
    expect(loopReadiness(loop({ tags: noVp, engineering: { ...ranges, vpApplicability: 'NOT_INSTALLED' } })).items.some(i => i.key === 'vp')).toBe(false);
    expect(loopReadiness(loop({ tags: noVp, engineering: { ...ranges, vpApplicability: 'NOT_APPLICABLE' } })).missing).toBe(0);
  });

  it('asks for linked loops only when they are expected', () => {
    const r = loopReadiness(loop({ links: [] }));
    expect(r.items.find(i => i.key === 'links')).toEqual({
      key: 'links', ok: false, title: 'No linked loops',
      why: 'Link its interacting loops in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop.',
    });
    expect(loopReadiness(loop({ links: [], engineering: { ...ranges, peerApplicability: 'NOT_APPLICABLE' } })).items.some(i => i.key === 'links')).toBe(false);
  });

  it('adds monitoring and the loop type only when they are not set; a retired loop is not asked to monitor', () => {
    expect(titles(loop({ monitoringEnabled: false, loopType: 'UNKNOWN' })).slice(4)).toEqual(['! Monitoring off', '! Loop type not set']);
    expect(loopReadiness(loop({ monitoringEnabled: false })).items[4].why).toBe('The analysis skips this loop while monitoring is off. Turn it on in Edit loop.');
    expect(loopReadiness(loop({ loopType: 'UNKNOWN' })).items[4].why).toBe('The cycle-shape checks stay off without it. Choose the type in Edit loop if one fits.');
    expect(loopReadiness(loop({ isActive: false, monitoringEnabled: false })).missing).toBe(0);
  });

  it('adds the server’s unmet plant-model check, but no data, analysis output or system-wide condition', () => {
    const checks: CpmReadinessCheck[] = [
      { id: 'binding_provenance', label: 'Signal bindings resolve via asset-model', ok: false, message: 'Resolved by path fallback, not the asset model: pv.' },
      { id: 'evidence_short', label: 'Short features produced', ok: false, message: 'No samples have reached x' },
      { id: 'evidence_verdict', label: 'Diagnosis produced', ok: false, message: 'Fusion needs…' },
      { id: 'cplm_jobs', label: 'CPLM Flink jobs running', ok: false, message: 'see Pipeline Health' },
      { id: 'tag_vp', label: 'Signal VP', ok: false, state: 'TEMPORARILY_UNAVAILABLE', message: 'no samples' },
    ];
    const r = loopReadiness(loop(), { checks });
    expect(r.missing).toBe(1);
    expect(r.items[r.items.length - 1]).toEqual({
      key: 'plantModel', ok: false, title: 'Signals not in the plant model',
      why: 'Their data may not reach the analysis. Use Resend to analysis to add them to the plant model.',
    });
    // the binding service not answering is system-wide, not this loop's setup
    const down: CpmReadinessCheck[] = [{ id: 'binding_provenance', label: 'x', ok: false, message: 'Resolved by path fallback, not the asset model: pv (unreachable).' }];
    expect(loopReadiness(loop(), { checks: down }).missing).toBe(0);
  });

  it('says no gate code and no internal code in any item', () => {
    const worst = loop({ tags: {}, engineering: null, links: [], monitoringEnabled: false, loopType: 'UNKNOWN' });
    const text = loopReadiness(worst, { checks: [{ id: 'binding_provenance', label: 'x', ok: false, message: 'y' }] })
      .items.map(i => `${i.title} ${i.why ?? ''}`).join(' ');
    expect(text).not.toMatch(/G1[34]|_|VP|PV\b|OP\b|SP\b/);
  });
});

describe('readinessPill', () => {
  it('is a neutral Ready, or an amber count of items to set', () => {
    expect(readinessPill(0)).toEqual({ label: 'Ready', tone: 'muted', glyph: '✓' });
    expect(readinessPill(1)).toEqual({ label: '1 item to set', tone: 'warn', glyph: '!' });
    expect(readinessPill(3)).toEqual({ label: '3 items to set', tone: 'warn', glyph: '!' });
  });
});
