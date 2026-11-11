// CHG-169 (owner review): one vocabulary for the Gate Configuration page. A state reads as tone + glyph + word everywhere
// ("✓ Active (verified)", never ACTIVE_VERIFIED); a class is "Policy" / "◆ State boundary" / "✕ Deployment"; a value carries
// its unit ("3600 s", "0.5 pp") and an unset one reads "No value"; a source names the layer, the bundle's version when the
// value comes from the loop's own bundle.
import { describe, expect, it } from 'vitest';
import { breakableParts, bundleStateWord, classWord, deploymentStateWord, sourceFull, sourceShort, valueWithUnit, valueWords } from './configWords';

describe('bundleStateWord', () => {
  it('names every bundle state with its tone and glyph, as How to read keys them', () => {
    expect(bundleStateWord('ACTIVE_VERIFIED')).toEqual({ label: 'Active (verified)', tone: 'good', glyph: '✓' });
    expect(bundleStateWord('DRAFT')).toEqual({ label: 'Draft', tone: 'muted', glyph: '○' });
    expect(bundleStateWord('SHADOW_EVALUATED')).toEqual({ label: 'Shadow evaluated', tone: 'warn', glyph: '◐' });
    expect(bundleStateWord('EXPIRED')).toEqual({ label: 'Approval expired', tone: 'bad', glyph: '✕' });
    expect(bundleStateWord('PARTIALLY_ACKNOWLEDGED')).toEqual({ label: 'Partially acknowledged', tone: 'bad', glyph: '✕' });
    expect(bundleStateWord('ROLLED_BACK')).toEqual({ label: 'Rolled back', tone: 'muted', glyph: '↺' });
    expect(bundleStateWord('SUPERSEDED')).toEqual({ label: 'Superseded', tone: 'muted', glyph: '⊘' });
    expect(bundleStateWord('NO_ACTIVE_BUNDLE')).toEqual({ label: 'Factory layer', tone: 'muted', glyph: '○' });
  });
  it('an unknown state is humanised, never hidden', () => {
    expect(bundleStateWord('SOME_NEW_STATE').label).toBe('Some new state');
  });
});

describe('deploymentStateWord', () => {
  it('reads the server state; a verification by the probe window only is not good', () => {
    expect(deploymentStateWord({ state: 'ACTIVE_VERIFIED' })).toEqual({ label: 'Active (verified)', tone: 'good', glyph: '✓' });
    expect(deploymentStateWord({ state: 'ACTIVE_VERIFIED', probeResults: { verifiedBy: 'ACK_WINDOW' } }).tone).toBe('warn');
    expect(deploymentStateWord({ state: 'PREPARING' })).toEqual({ label: 'Preparing', tone: 'warn', glyph: '◐' });
    expect(deploymentStateWord({ state: 'ACTIVATION_FAILED' })).toEqual({ label: 'Activation failed', tone: 'bad', glyph: '✕' });
    expect(deploymentStateWord({ state: 'ROLLED_BACK' })).toEqual({ label: 'Rolled back', tone: 'muted', glyph: '↺' });
  });
});

describe('classWord', () => {
  it('Policy plain, State boundary and Deployment marked', () => {
    expect(classWord('POLICY')).toEqual({ label: 'Policy', tone: 'muted', glyph: '' });
    expect(classWord('STATE_BOUNDARY')).toEqual({ label: 'State boundary', tone: 'warn', glyph: '◆' });
    expect(classWord('DEPLOYMENT')).toEqual({ label: 'Deployment', tone: 'bad', glyph: '✕' });
  });
});

describe('values', () => {
  it('a number carries its unit; an unset value reads No value', () => {
    expect(valueWithUnit(3600, 's')).toBe('3600 s');
    expect(valueWithUnit(0.5, 'percentage_point')).toBe('0.5 pp');
    expect(valueWithUnit(30, 'day')).toBe('30 days');
    expect(valueWithUnit(4.5, 'dimensionless')).toBe('4.5');
    expect(valueWithUnit(0.05, 'fraction')).toBe('0.05');
    expect(valueWithUnit('OPERATIONAL', 'state')).toBe('OPERATIONAL');
    expect(valueWithUnit(null, 's')).toBe('No value');
    expect(valueWithUnit(undefined, 's')).toBe('No value');
    expect(valueWords(null)).toBe('No value');
    expect(valueWords(['a', 'b'])).toBe('a, b');
  });
});

describe('sources', () => {
  const bundle = { scopeKind: 'LOOP', version: 6 };
  it('the short source names the bundle version when it is the loop bundle level', () => {
    expect(sourceShort('LOOP', bundle)).toBe('LOOP v6');
    expect(sourceShort('PROFILE', bundle)).toBe('PROFILE');
    expect(sourceShort('FACTORY', null)).toBe('FACTORY');
    expect(sourceShort('NO_VALUE', null)).toBe('Unset');
    expect(sourceShort(undefined, null)).toBe('Unset');
  });
  it('the full source says where the layer comes from', () => {
    expect(sourceFull('LOOP', bundle, 'FLOW_FAST_SELF_REG')).toBe('LOOP · bundle v6');
    expect(sourceFull('PROFILE', bundle, 'FLOW_FAST_SELF_REG')).toBe('PROFILE · Flow, fast self-regulating');
    expect(sourceFull('FACTORY', null, 'X')).toBe('FACTORY · shipped default');
    expect(sourceFull('NO_VALUE', null, 'X')).toBe('Unset · no layer sets it');
  });
});

describe('breakableParts', () => {
  it('a long property name may break after its underscores and dots, never inside a word', () => {
    expect(breakableParts('G0.evidence_retention_days')).toEqual(['G0.', 'evidence_', 'retention_', 'days']);
    expect(breakableParts('mode')).toEqual(['mode']);
  });
});
