// CHG-169 (owner review): one vocabulary for the Gate Configuration page. A state reads as tone + glyph + word everywhere
// ("✓ Active (verified)", never ACTIVE_VERIFIED); a class is "Policy" / "◆ State boundary" / "✕ Deployment"; a value carries
// its unit ("3600 s", "0.5 pp") and an unset one reads a dash (CHG-224: never "No value"); a source reads in the plain words of the page (the
// level) or "Worked out automatically".
import { describe, expect, it } from 'vitest';
import { breakableParts, bundleStateWord, classWord, deploymentStateWord, settingName, sourceWord, valueWithUnit, valueWords } from './configWords';

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
    expect(deploymentStateWord({ state: 'ACTIVE_VERIFIED' })).toEqual({ label: 'Running', tone: 'good', glyph: '✓' });
    expect(deploymentStateWord({ state: 'ACTIVE_VERIFIED', probeResults: { verifiedBy: 'ACK_WINDOW' } }).tone).toBe('warn');
    expect(deploymentStateWord({ state: 'PREPARING' })).toEqual({ label: 'Preparing', tone: 'warn', glyph: '◐' });
    expect(deploymentStateWord({ state: 'ACTIVATION_FAILED' })).toEqual({ label: 'Deploy failed', tone: 'bad', glyph: '✕' });
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
  it('a number carries its unit; an unset value reads a dash', () => {
    expect(valueWithUnit(3600, 's')).toBe('3600 s');
    expect(valueWithUnit(0.5, 'percentage_point')).toBe('0.5 pp');
    expect(valueWithUnit(30, 'day')).toBe('30 days');
    expect(valueWithUnit(4.5, 'dimensionless')).toBe('4.5');
    expect(valueWithUnit(0.05, 'fraction')).toBe('0.05');
    expect(valueWithUnit('OPERATIONAL', 'state')).toBe('OPERATIONAL');
    expect(valueWithUnit(null, 's')).toBe('—');
    expect(valueWithUnit(undefined, 's')).toBe('—');
    expect(valueWords(null)).toBe('—');
    expect(valueWords(['a', 'b'])).toBe('a, b');
  });
});

describe('sources', () => {
  it('a level reads in the plain words of the page; no layer sets it reads as worked out automatically', () => {
    expect(sourceWord('LOOP')).toBe('This loop');
    expect(sourceWord('PROFILE')).toBe('Loop type');
    expect(sourceWord('SITE')).toBe('Plant');
    expect(sourceWord('FACTORY')).toBe('Factory');
    expect(sourceWord('REGIME')).toBe('This regime');
    expect(sourceWord('NO_VALUE')).toBe('Worked out automatically');
    expect(sourceWord(undefined)).toBe('Worked out automatically');
    expect(sourceWord(null)).toBe('Worked out automatically');
  });
});

describe('breakableParts', () => {
  it('a long property name may break after its underscores and dots, never inside a word', () => {
    expect(breakableParts('G0.evidence_retention_days')).toEqual(['G0.', 'evidence_', 'retention_', 'days']);
    expect(breakableParts('mode')).toEqual(['mode']);
  });
});

describe('settingName', () => {
  it('names the region settings in plain words', () => {
    expect(settingName('G2r.pv_region_min')).toBe('Region minimum');
    expect(settingName('G2r.out_of_domain_warn_fraction')).toBe('Warn when outside the region');
    expect(settingName('G2r.evidence_retention_days')).toBe('Evidence kept (days)');
  });
  it('humanises any other property from the part after the first dot', () => {
    expect(settingName('G4.activity_warn_ratio')).toBe('Activity warn ratio');
    expect(settingName('G5.settle_time_s')).toBe('Settle time (s)');
    expect(settingName('G6.stiction_pct')).toBe('Stiction (%)');
    expect(settingName('G3.pv_max_limit')).toBe('PV maximum limit');
    expect(settingName('G3.op_min')).toBe('OP minimum');
    expect(settingName('mode')).toBe('Mode');
  });
});

describe('retest fixes (issue 3, 7)', () => {
  it('enum codes read as words, other text stays', async () => {
    const m = await import('./configWords');
    expect(m.valueWords('SUPPORTING')).toBe('Supporting');
    expect(m.enumWords('FAST_SELF_REG')).toBe('Fast self reg');
    expect(m.valueWords('hdpe')).toBe('hdpe');
    expect(m.valueWords(900)).toBe('900');
  });
  it('editableChanges leaves out properties the catalogue says are not editable', async () => {
    const m = await import('./configWords');
    const list = [{ property: 'G7.role' }, { property: 'G8.x' }];
    expect(m.editableChanges(list, [{ property: 'G7.role', editable: false }, { property: 'G8.x', editable: true }])).toEqual([{ property: 'G8.x' }]);
    expect(m.editableChanges(list, undefined)).toEqual(list);
    expect(m.editableChanges(list, null)).toEqual([]);
  });
  it('changeNames adds the gate only where two names are alike', async () => {
    const m = await import('./configWords');
    const n = m.changeNames(['G7.role', 'G10.role', 'G8.asymmetry_display']);
    expect(n.get('G7.role')).toMatch(/^Role · .+/);
    expect(n.get('G7.role')).not.toBe(n.get('G10.role'));
    expect(n.get('G8.asymmetry_display')).toBe('Asymmetry display');
  });
  it('plainNote strips the batch and self-approval markers', async () => {
    const m = await import('./configWords');
    expect(m.plainNote('[batch 3c410b59-00db-499d-a130-4e72f3f3764f inherit] retest one')).toBe('retest one');
    expect(m.plainNote('[self-approved as SuperAdmin] e2e B2')).toBe('e2e B2');
    expect(m.plainNote('[self-approved as SuperAdmin]')).toBe('');
    expect(m.plainNote('keep [this] as is')).toBe('keep [this] as is');
    expect(m.plainNote(null)).toBe('');
  });
});
