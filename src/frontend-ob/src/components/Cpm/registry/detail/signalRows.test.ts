// CHG-201 (owner, 15 Nov 2026): the Loop detail page's Signals table. Each role with its plain name, its tag in the control
// system (never the path), its unit and range from the engineering ranges, and whether data arrives, from the loop's readiness.
import { describe, expect, it } from 'vitest';
import type { CpmLoop, CpmReadiness } from '../../../../api/cpmApi';
import { DATA_WORD, signalRows } from './signalRows';

const P = 'hdpe/section_600/u6002/fic10401';
const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC10401', assetId: null, displayName: 'Flow controller', site: 'hdpe', area: 'section_600', unit: 'u6002', loopType: 'FIC',
  criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}.pv`, SP: `${P}.sp`, OP: `${P}.op`, MODE: `${P}.mode` }, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: null, engineering: { pvMin: 0, pvMax: 2500, pvUnit: 'kg/h', opMin: 0, opMax: 100 }, ...over,
} as CpmLoop);
const receiving: Pick<CpmReadiness, 'checks' | 'evidence'> = {
  checks: [{ id: 'evidence_short', label: 'x', ok: true, message: null }], evidence: { shortFeatures: 10, longFeatures: 1, verdicts: 1 },
};

describe('signalRows', () => {
  it('lists PV, SP, OP, Mode and VP with their plain names, source tags, units and ranges', () => {
    const rows = signalRows(loop(), receiving);
    expect(rows.map(r => [r.role, r.name, r.sourceTag, r.unit, r.range, r.data])).toEqual([
      ['PV', 'Process value', 'FIC10401.PV', 'kg/h', '0 – 2,500', 'receiving'],
      ['SP', 'Setpoint', 'FIC10401.SP', 'kg/h', '0 – 2,500', 'receiving'],
      ['OP', 'Controller output', 'FIC10401.OP', '%', '0 – 100', 'receiving'],
      ['Mode', 'Auto, manual or cascade', 'FIC10401.MODE', '—', '—', 'receiving'],
      ['VP', 'Valve position', null, '—', '—', 'expected'],
    ]);
    expect(rows.map(r => r.pen)).toEqual(['pv', 'sp', 'op', 'mode', 'vp']);
    expect(rows[4].missing).toBe('Not connected');
  });

  it('uses the recorded source tag over the signal name', () => {
    expect(signalRows(loop({ sourceTags: { PV: '10-FIC-401.PV' } }), receiving)[0].sourceTag).toBe('10-FIC-401.PV');
  });

  it('says a valve position that is not fitted or not applicable, with nothing expected', () => {
    const notFitted = signalRows(loop({ engineering: { vpApplicability: 'NOT_INSTALLED' } }), receiving)[4];
    expect([notFitted.missing, notFitted.data]).toEqual(['Not fitted', 'none-expected']);
    expect(signalRows(loop({ engineering: { vpApplicability: 'NOT_APPLICABLE' } }), receiving)[4].missing).toBe('Not applicable');
  });

  it('says a required signal that is not connected is expected', () => {
    const sp = signalRows(loop({ tags: { PV: `${P}.pv` } }), receiving)[1];
    expect([sp.sourceTag, sp.missing, sp.data]).toEqual([null, 'Not connected', 'expected']);
  });

  it('says No data when no samples arrived, and for a valve position the latest window did not carry', () => {
    const none = signalRows(loop(), { checks: [{ id: 'evidence_short', label: 'x', ok: false, message: 'none' }] });
    expect(none.slice(0, 4).every(r => r.data === 'none')).toBe(true);
    const vp = signalRows(loop({ tags: { ...loop().tags, VP: `${P}.vp` } }), {
      checks: [...receiving.checks, { id: 'tag_vp', label: 'x', ok: false, message: null, state: 'TEMPORARILY_UNAVAILABLE' }],
    });
    expect(vp[0].data).toBe('receiving');
    expect(vp[4].data).toBe('none');
  });

  it('says nothing about data until the readiness is read', () => {
    expect(signalRows(loop(), undefined).slice(0, 4).every(r => r.data === 'unknown')).toBe(true);
  });

  it('shows no unit or range that is not declared', () => {
    const rows = signalRows(loop({ engineering: { opMin: 0, opMax: 100 } }), receiving);
    expect([rows[0].unit, rows[0].range, rows[2].range]).toEqual(['—', '—', '0 – 100']);
  });

  it('adds any other connected role after the five', () => {
    const rows = signalRows(loop({ tags: { ...loop().tags, STATUS: `${P}.status` } }), receiving);
    expect(rows.map(r => r.role)).toEqual(['PV', 'SP', 'OP', 'Mode', 'VP', 'Status']);
    expect(rows[5]).toMatchObject({ name: 'Status signal', sourceTag: 'FIC10401.STATUS', pen: null });
  });

  it('words each data state', () => {
    expect(DATA_WORD).toEqual({
      receiving: 'Receiving data', none: 'No data', expected: 'Expected', unknown: '—', 'none-expected': '—',
    });
  });
});
