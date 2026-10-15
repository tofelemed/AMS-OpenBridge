// CHG-098 (SME review 2 #28): registry wizard validation blocks only clear errors, says why, and an edit's
// change list shows only what changed with its expected effect.
import { describe, expect, it } from 'vitest';
import { checkSignalPath, firstProblem, initialForm, rangeChecks, signalChecks } from './wizardForm';
import { diffSettings } from './changeSummary';
import type { CpmLoop } from '../../../../api/cpmApi';

const loop = {
  loopId: '45FIC-109', assetId: null, displayName: 'Feed flow', site: 'marun', area: 'hdpe', unit: 'u45',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: 'marun/hdpe/u45/45fic-109.pv', SP: 'marun/hdpe/u45/45fic-109.sp', OP: 'marun/hdpe/u45/45fic-109.op', MODE: 'marun/hdpe/u45/45fic-109.mode' },
  observabilityFlags: [], links: [], stepTestApproved: false, thresholdProfileId: null,
  engineering: { pvMin: 0, pvMax: 250, pvUnit: 'kg/h' },
} as unknown as CpmLoop;

describe('checkSignalPath', () => {
  it('accepts a UNS contextual path and an empty optional one', () => {
    expect(checkSignalPath('marun/hdpe/u45/45fic-109.pv', true).error).toBeNull();
    expect(checkSignalPath('site/unit', true).error).toBeNull();
    expect(checkSignalPath('  ', false).error).toBeNull();
  });
  it('blocks empty-when-required, spaces, control characters and the dotted historian form', () => {
    expect(checkSignalPath('', true).error).toMatch(/Required/);
    expect(checkSignalPath('marun/u45/fic 1.pv', true).error).toMatch(/space/);
    expect(checkSignalPath('marun/u45/fic\u00011.pv', true).error).toMatch(/control/);
    expect(checkSignalPath('root.marun.u45.fic.pv', true).error).toMatch(/Not a UNS contextual path/);
    expect(checkSignalPath('fic101.pv', true).error).toMatch(/Not a UNS contextual path/);
  });
  it('never blocks the unchanged stored path of an edit - it only warns', () => {
    const r = checkSignalPath('root.marun.u45.fic.pv', true, 'root.marun.u45.fic.pv');
    expect(r.error).toBeNull();
    expect(r.warning).toMatch(/stored path/);
  });
});

describe('rangeChecks', () => {
  const base = initialForm();
  it('passes blank and complete ranges', () => {
    expect(rangeChecks(base)).toEqual({});
    expect(rangeChecks({ ...base, pvMin: '0', pvMax: '250', opMin: '-5', opMax: '105' })).toEqual({});
  });
  it('flags non-numbers, half ranges and min >= max next to the right field', () => {
    expect(rangeChecks({ ...base, pvMin: 'abc' }).pvMin).toBe('Must be a number');
    expect(rangeChecks({ ...base, pvMin: '0' }).pvMax).toMatch(/half-declared/);
    expect(rangeChecks({ ...base, opMax: '100' }).opMin).toMatch(/half-declared/);
    expect(rangeChecks({ ...base, pvMin: '10', pvMax: '10' }).pvMax).toMatch(/greater than the minimum/);
    expect(rangeChecks({ ...base, pvUnit: '<b>' }).pvUnit).toBeTruthy();
  });
  it('names the first problem for the Continue reason', () => {
    expect(firstProblem(rangeChecks({ ...base, pvMin: '0' }), { pvMax: 'PV maximum' })).toMatch(/^PV maximum: PV range is half-declared/);
  });
});

describe('signalChecks + diffSettings for an edit', () => {
  it('prefills from the stored loop with no errors and no changes', () => {
    const before = initialForm(loop);
    const checks = signalChecks(before, before);
    expect(Object.values(checks).every(c => c.error === null)).toBe(true);
    expect(diffSettings(before, before)).toEqual([]);
  });
  it('lists only changed settings, before -> after, with the expected effect', () => {
    const before = initialForm(loop);
    const after = { ...before, pv: 'marun/hdpe/u45/45fic-109b.pv', pvMax: '300', vpApplicability: 'NOT_APPLICABLE' };
    const changes = diffSettings(before, after);
    expect(changes.map(c => c.key)).toEqual(['pv', 'pvRange', 'vpApplicability']);
    expect(changes[0]).toMatchObject({ before: 'marun/hdpe/u45/45fic-109.pv', after: 'marun/hdpe/u45/45fic-109b.pv' });
    expect(changes[0].effect).toMatch(/new path from the next window/);
    expect(changes[1]).toMatchObject({ before: '0–250 kg/h', after: '0–300 kg/h' });
    expect(changes[1].effect).toMatch(/% of PV span/);
    expect(changes[2].effect).toMatch(/valve cause/);
  });
});
