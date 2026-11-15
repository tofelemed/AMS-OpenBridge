// CHG-201 (owner, 15 Nov 2026): the facts the Loop Registry list and the Loop detail page read from one loop record, in plain
// words: the description without the tag, the control station, the plant names (never the slugs), the valve position word and
// each signal's source tag (never its path).
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../../api/cpmApi';
import { controlStation, describeLoop, placeOf, plantName, sourceTagOf, vpWord } from './loopFacts';

const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC10401', assetId: null, displayName: 'Flow controller FIC10401 (FCS0101)', site: 'hdpe', area: 'section_600',
  unit: 'u6002_pellet_homogenization_ii_silo_4_5', loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5/fic10401.pv' }, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: null, ...over,
} as CpmLoop);

const locations = {
  sites: [{ contextualPath: 'hdpe', name: 'HDPE Plant', type: 1 }],
  areas: [{ contextualPath: 'hdpe/section_600', name: 'Section 600', type: 2 }],
  units: [
    { contextualPath: 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5', name: '6002-Pellet Homogenization II Silo 4 & 5', type: 3 },
    { contextualPath: 'hdpe/u9_flat', name: 'Flat unit', type: 3 },
  ],
};

describe('describeLoop', () => {
  it('drops the tag and shows the control station after a dot', () => {
    expect(describeLoop(loop())).toBe('Flow controller · FCS0101');
    expect(describeLoop(loop({ displayName: 'Reactor feed flow' }))).toBe('Reactor feed flow');
  });

  it('is empty when the description is only the tag', () => {
    expect(describeLoop(loop({ displayName: 'FIC10401' }))).toBe('');
    expect(describeLoop(loop({ displayName: '' }))).toBe('');
  });
});

describe('controlStation', () => {
  it('reads the trailing station in brackets, or nothing', () => {
    expect(controlStation(loop())).toBe('FCS0101');
    expect(controlStation(loop({ displayName: 'Reactor feed flow' }))).toBeNull();
  });
});

describe('plant names', () => {
  it('shows a unit number before its name with a dot', () => {
    expect(plantName('6002-Pellet Homogenization II Silo 4 & 5')).toBe('6002 · Pellet Homogenization II Silo 4 & 5');
    expect(plantName('1001 - Polymerization Reactor 1')).toBe('1001 · Polymerization Reactor 1');
    expect(plantName('Blending Unit 1')).toBe('Blending Unit 1');
  });

  it('names the plant, area and unit from the asset model, never the slugs', () => {
    expect(placeOf(locations, loop())).toEqual({ plant: 'HDPE Plant', area: 'Section 600', unit: '6002 · Pellet Homogenization II Silo 4 & 5' });
    expect(placeOf(locations, loop({ area: null, unit: 'u9_flat' }))).toEqual({ plant: 'HDPE Plant', area: null, unit: 'Flat unit' });
  });

  it('says a place the asset model does not hold is not in the plant model, and nothing before the model is read', () => {
    expect(placeOf(locations, loop({ unit: 'u_gone' })).unit).toBe('Not in the plant model');
    expect(placeOf(undefined, loop())).toEqual({ plant: null, area: null, unit: null });
  });
});

describe('vpWord', () => {
  it('says Connected, Not connected, Not fitted or Not applicable', () => {
    expect(vpWord(loop({ tags: { VP: 'x/y.vp' } }))).toEqual({ label: 'Connected', tone: 'plain' });
    expect(vpWord(loop())).toEqual({ label: 'Not connected', tone: 'warn', glyph: '!' });
    expect(vpWord(loop({ engineering: { vpApplicability: 'NOT_INSTALLED' } }))).toEqual({ label: 'Not fitted', tone: 'muted', glyph: '—' });
    expect(vpWord(loop({ engineering: { vpApplicability: 'NOT_APPLICABLE' } }))).toEqual({ label: 'Not applicable', tone: 'muted', glyph: '—' });
    expect(vpWord(loop({ model: { commandPath: 'OP_TO_VFD' } as CpmLoop['model'] })).label).toBe('Not applicable');
  });
});

describe('sourceTagOf', () => {
  it('is the control system tag the map records', () => {
    expect(sourceTagOf(loop({ sourceTags: { PV: 'FIC10401.PV' } }), 'PV')).toBe('FIC10401.PV');
  });

  it('else the signal name from the path, upper-cased, never the path', () => {
    expect(sourceTagOf(loop(), 'PV')).toBe('FIC10401.PV');
    expect(sourceTagOf(loop({ sourceTags: { SP: 'X' } }), 'PV')).toBe('FIC10401.PV');
    expect(sourceTagOf(loop({ tags: { PV: 'fic10401.pv' } }), 'PV')).toBe('FIC10401.PV');
  });

  it('is nothing for a signal that is not connected', () => {
    expect(sourceTagOf(loop(), 'SP')).toBeNull();
    expect(sourceTagOf(loop({ tags: { PV: '  ' } }), 'PV')).toBeNull();
  });
});
