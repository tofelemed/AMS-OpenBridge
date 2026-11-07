// CHG-141: Why this result. Five cards, each with a one-line summary of its gates; the words come from gateMark.
import { describe, expect, it } from 'vitest';
import type { CpmGateCell, CpmGateMatrix } from '../../../api/cpm/gates';
import { TIER_GROUPS } from '../gateStatus';
import { row } from '../evidence/windowFixtures';
import { chosenTier, conclusionLimits, gateGroups, tierOf } from './gateGroups';

const END = '2026-11-05T10:15:00Z';
const cells = (s: Record<string, string>) => Object.entries(s).map(([key, status]): CpmGateCell => ({ key, name: key, tier: 'short', status, reason: null }));
const summaries = (m: CpmGateMatrix, flags?: readonly string[]) => Object.fromEntries(gateGroups(m, flags).map(g => [g.tier, g.summary]));

const excluded = row(END, {
  diagnosis: 'EXCLUDED_MODE',
  gates: cells({
    G0: 'PASS', G1: 'EXCLUDED', G2: 'PASS', G2r: 'PASS', G3: 'WARN', G4: 'PASS', G5: 'PASS', G6: 'PASS', G7: 'NOT_EVALUATED', G8: 'PASS', G9: 'NOT_EVALUATED',
    G10: 'WARN', G11: 'PASS', G12: 'NOT_EVALUATED', G13: 'NOT_EVALUATED', G14: 'INSUFFICIENT_EVIDENCE', G15: 'INSUFFICIENT_EVIDENCE',
  }),
});
const finding = row(END, {
  diagnosis: 'CONFIRMED_OSCILLATION',
  gates: cells({
    G0: 'PASS', G1: 'PASS', G2: 'PASS', G2r: 'PASS', G3: 'FAIL', G4: 'PASS', G5: 'WARN', G6: 'PASS', G7: 'PASS', G8: 'PASS', G9: 'WARN', G10: 'PASS', G11: 'PASS',
    G12: 'NOT_EVALUATED', G13: 'NOT_EVALUATED', G14: 'NOT_APPLICABLE', G15: 'CONFIRMED',
  }),
});

describe('gateGroups', () => {
  it('summarises each tier for Why this result', () => {
    expect(summaries(excluded)).toEqual({
      Eligibility: 'G1 · Excluded',
      Performance: 'G3 attention · G4 pass',
      'Diagnostic evidence': 'G10 limit symptom',
      Confirmation: 'Not applicable to this excluded case',
      Fusion: 'G15 · Insufficient evidence',
    });
  });

  it('summarises a finding from its own gates', () => {
    expect(summaries(finding)).toEqual({
      Eligibility: 'All pass',
      Performance: 'G3 failed · G4 pass',
      'Diagnostic evidence': 'G5 / G9 symptom seen',
      Confirmation: 'G12 / G13 not evaluated · G14 n/a',
      Fusion: 'G15 · Confirmed',
    });
  });

  it('always gives the five tiers with all 17 gates, in order', () => {
    const groups = gateGroups(row(END));
    expect(groups.map(g => g.tier)).toEqual(['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']);
    expect(groups.map(g => g.gates)).toEqual(TIER_GROUPS.map(t => t.keys));
    expect(groups.flatMap(g => g.gates)).toHaveLength(17);
  });

  it('says a symptom was not seen, and on what', () => {
    const clean = row(END, { gates: cells({ G5: 'PASS', G6: 'PASS', G7: 'PASS', G8: 'PASS', G9: 'PASS', G10: 'PASS', G11: 'PASS' }) });
    expect(summaries(clean)['Diagnostic evidence']).toBe('Not seen');
    expect(summaries(clean, ['HEALTH_NOT_CONFIGURED'])['Diagnostic evidence']).toBe('Not seen on available data');
  });

  it('says not evaluated rather than not seen when no diagnostic gate ran', () => {
    expect(summaries(row(END))['Diagnostic evidence']).toBe('Not evaluated');
  });

  it('keeps a strong symptom apart from a seen one, and names the limit symptom', () => {
    const m = row(END, { gates: cells({ G5: 'WARN', G7: 'STRONG', G10: 'STRONG' }) });
    expect(summaries(m)['Diagnostic evidence']).toBe('G5 symptom seen · G7 strong symptom · G10 strong limit symptom');
  });

  it('lists every eligibility gate that holds the window back', () => {
    const m = row(END, { gates: cells({ G0: 'FAIL', G1: 'EXCLUDED', G2: 'PASS', G2r: 'PASS' }) });
    expect(summaries(m).Eligibility).toBe('G0 not usable · G1 excluded');
  });
});

describe('tierOf', () => {
  it('finds a gate\'s tier, whatever its case', () => {
    expect(tierOf('G10')).toBe('Diagnostic evidence');
    expect(tierOf('g2R')).toBe('Eligibility');
    expect(tierOf('G99')).toBeNull();
    expect(tierOf(null)).toBeNull();
  });
});

describe('chosenTier', () => {
  it('opens on the evidence for a finding, on eligibility for a window that was not judged', () => {
    expect(chosenTier(finding, null, null)).toBe('Diagnostic evidence');
    expect(chosenTier(excluded, null, null)).toBe('Eligibility');
    expect(chosenTier(row(END, { diagnosis: 'INSUFFICIENT_DATA' }), null, null)).toBe('Eligibility');
    expect(chosenTier(row(END, { diagnosis: 'NOT_EVALUATED' }), null, null)).toBe('Eligibility');
  });

  it('opens a no-fault window on the evidence that was weighed', () => {
    for (const diagnosis of ['NO_CALL', 'INSUFFICIENT_EVIDENCE'])
      expect(chosenTier(row(END, { diagnosis }), null, null)).toBe('Diagnostic evidence');
  });

  it('follows a gate named in the link', () => {
    expect(chosenTier(excluded, null, 'G14')).toBe('Confirmation');
  });

  it('follows the card the user chose, and ignores a tier that does not exist', () => {
    expect(chosenTier(finding, 'Fusion', 'G5')).toBe('Fusion');
    expect(chosenTier(finding, 'Nonsense', null)).toBe('Diagnostic evidence');
  });
});

describe('conclusionLimits', () => {
  const basis = { lead: 'Confirmed from', from: 'sustained oscillation', notChecked: ['Transmitter health: no NE107 health source is bound, so a sensor fault is not ruled out'] };

  it('says what is still unconfirmed for a finding: what it was judged without, and the rest of the limits', () => {
    const box = conclusionLimits(finding, { basis, limits: ['No clean oscillation cycle: period and waveform shape not measured'], machineReason: null });
    expect(box.title).toBe('What is still unconfirmed');
    expect(box.lines).toEqual([
      'Transmitter health: no NE107 health source is bound, so a sensor fault is not ruled out',
      'No clean oscillation cycle: period and waveform shape not measured',
    ]);
  });

  it('keeps the reason a score stopped where it did on screen', () => {
    const capped = { ...finding, confidence: 0.54, narrative: { selectedFamily: null, recommendation: null, statusReason: 'persistence_cap agree=1/3' } };
    expect(conclusionLimits(capped, { basis: null, limits: [], machineReason: null }).lines).toEqual(['Evidence score capped at 54: not yet persistent (1 of 3 windows agree)']);
  });

  it('gives a window that was not judged its reason in words', () => {
    const box = conclusionLimits(excluded, { basis: null, limits: ['Instrument health not configured: transmitter faults are not checked'], machineReason: 'INSUFFICIENT_SAMPLES' });
    expect(box.title).toBe('Limits on this conclusion');
    expect(box.lines[0]).toBe('Too few samples');
    expect(box.lines).toHaveLength(2);
  });

  it('treats a no-fault window as judged, and keeps the reason on screen', () => {
    const box = conclusionLimits(row(END, { diagnosis: 'NO_CALL' }), { basis: null, limits: ['Instrument health not configured'], machineReason: 'INSUFFICIENT_SAMPLES' });
    expect(box.title).toBe('What is still unconfirmed');
    expect(box.lines).toEqual(['Too few samples', 'Instrument health not configured']);
  });

  it('leaves out an engine trace string: it belongs under Technical details', () => {
    expect(conclusionLimits(excluded, { basis: null, limits: [], machineReason: 'selected_family=none' }).lines).toEqual([]);
  });
});
