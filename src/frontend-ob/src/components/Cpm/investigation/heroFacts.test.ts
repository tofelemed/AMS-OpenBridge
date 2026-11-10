// CHG-141: the result card. Its three facts depend on what the window is; missing is never 0, and the title is this window's result, never an older one.
import { describe, expect, it } from 'vitest';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { row } from '../evidence/windowFixtures';
import { causeOf, episodeAt, heroFacts, heroNextCheck, heroTitle } from './heroFacts';

const END = '2026-11-05T10:15:00Z';
const hoursBefore = (h: number) => new Date(Date.parse(END) - h * 3600_000).toISOString();
const finding = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 1, metrics: { good_error_pct: 0.13 } });
const excluded = row(END, { diagnosis: 'EXCLUDED_MODE', metrics: { auto_pct: 0, saturation_pct: 1, completeness: 1, good_error_pct: 1 } });
const verdict = (over: Record<string, unknown>) => over as unknown as CpmGateMatrix['verdictV2'];

describe('heroFacts', () => {
  it('shows good-error time, persisting and evidence score for a finding', () => {
    expect(heroFacts(finding, { opened_at: hoursBefore(11) })).toEqual([
      { value: '13 %', label: 'Good-error time' },
      { value: '11 h', label: 'Persisting' },
      { value: '100', label: 'Evidence score' },
    ]);
  });

  it('shows normal-mode, time at OP limit and data coverage for an excluded window', () => {
    expect(heroFacts(excluded, null)).toEqual([
      { value: '0 %', label: 'Time in normal mode' },
      { value: '100 %', label: 'Time at an OP limit' },
      { value: '100 %', label: 'Data coverage' },
    ]);
  });

  it('shows the same three window facts for a window with no verdict, and no evidence score', () => {
    const labels = heroFacts(row(END, { diagnosis: 'INSUFFICIENT_DATA', confidence: 0.4, metrics: { completeness: 0.5 } }), null).map(f => f.label);
    expect(labels).toEqual(['Time in normal mode', 'Time at an OP limit', 'Data coverage']);
  });

  it('shows how a no-fault window did, with no evidence score: it has no verdict to score', () => {
    for (const diagnosis of ['NO_CALL', 'INSUFFICIENT_EVIDENCE']) {
      expect(heroFacts(row(END, { diagnosis, confidence: 0.2, metrics: { good_error_pct: 0.91, auto_pct: 1, completeness: 1 } }), null)).toEqual([
        { value: '91 %', label: 'Good-error time' },
        { value: '100 %', label: 'Time in normal mode' },
        { value: '100 %', label: 'Data coverage' },
      ]);
    }
  });

  it('shows No open episode, never 0', () => {
    const facts = heroFacts(finding, null);
    expect(facts[1]).toEqual({ value: 'No open episode', label: 'Persisting' });
    expect(facts.map(f => f.value)).not.toContain('0');
  });

  it('shows a dash, not No open episode, when the episodes could not be read', () => {
    expect(heroFacts(finding, undefined)[1]).toEqual({ value: '—', label: 'Persisting' });
  });

  it('never turns a missing value into 0', () => {
    expect(heroFacts(row(END, { diagnosis: 'EXCLUDED_MODE' }), null).map(f => f.value)).toEqual(['—', '—', '—']);
    const noScore = heroFacts(row(END, { diagnosis: 'CONFIRMED_OSCILLATION' }), null);
    expect(noScore[0].value).toBe('—');
    expect(noScore[2].value).toBe('—');
  });

  it('never calls a ratio above 100 % full: it shows what was stored', () => {
    expect(heroFacts(row(END, { diagnosis: 'EXCLUDED_MODE', metrics: { completeness: 1.03 } }), null)[2].value).toBe('103 %');
  });

  it('measures Persisting at the window end, so an older window does not read today', () => {
    const older = row(hoursBefore(3), { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 1 });
    expect(heroFacts(older, { opened_at: hoursBefore(11) })[1].value).toBe('8 h');
  });
});

describe('episodeAt', () => {
  const open = { id: 1, opened_at: hoursBefore(11), closed_at: null };
  const closed = { id: 2, opened_at: hoursBefore(40), closed_at: hoursBefore(30) };

  it('finds the episode open at the window end', () => {
    expect(episodeAt([closed, open], END)).toBe(open);
    expect(episodeAt([closed, open], hoursBefore(35))).toBe(closed);
  });

  it('finds none between episodes or after one closed', () => {
    expect(episodeAt([closed, open], hoursBefore(20))).toBeNull();
    expect(episodeAt([closed], END)).toBeNull();
    expect(episodeAt([open], null)).toBeNull();
  });
});

describe('heroTitle', () => {
  it('never shows a last verdict as the current result', () => {
    const notEvaluated = row(END, {
      diagnosis: 'INSUFFICIENT_DATA',
      lastVerdict: { windowKind: '12h', windowStart: null, windowEnd: hoursBefore(48), diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 1, ageMs: 48 * 3600_000, insufficientEvidenceReason: null, methodRunIds: {}, computedAt: END },
    });
    expect(heroTitle(notEvaluated)).toBe('Not evaluated: not enough data');
  });

  it('keeps the words of the rest of the page for a judged window with no fault, and names the real exclusion', () => {
    expect(heroTitle(row(END, { diagnosis: 'NO_CALL' }))).toBe('No fault identified');
    expect(heroTitle(row(END, { diagnosis: 'INSUFFICIENT_EVIDENCE' }))).toBe('No fault identified');
    expect(heroTitle(row(END, { diagnosis: 'EXCLUDED_MODE' }))).toBe('Excluded: loop not in automatic');
    expect(heroTitle(row(END, { diagnosis: 'EXCLUDED_OPERATING_REGION' }))).not.toBe('Excluded: loop not in automatic');
  });
});

describe('causeOf', () => {
  it('says not established for a finding with no mechanism: a symptom is not a cause', () => {
    expect(causeOf(finding)).toEqual({ text: 'Not established', unconfirmed: false });
  });

  it('says not qualified where the window was not judged', () => {
    expect(causeOf(excluded)).toEqual({ text: 'Not qualified', unconfirmed: false });
  });

  it('names no mechanism on a no-fault window: one that fell short stays in Hypothesis comparison', () => {
    const fellShort = verdict({ leadingHypothesis: 'STICTION', confirmation: { state: 'NOT_CONFIRMED' } });
    for (const diagnosis of ['NO_CALL', 'INSUFFICIENT_EVIDENCE'])
      expect(causeOf(row(END, { diagnosis, verdictV2: fellShort }))).toEqual({ text: 'None identified', unconfirmed: false });
  });

  it('marks a leading mechanism as not confirmed until G14 confirms it', () => {
    const lead = (state: string) => row(END, { diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY', verdictV2: verdict({ leadingHypothesis: 'STICTION', confirmation: { state } }) });
    expect(causeOf(lead('NOT_CONFIRMED')).unconfirmed).toBe(true);
    expect(causeOf(lead('CONFIRMED')).unconfirmed).toBe(false);
    expect(causeOf(lead('NOT_CONFIRMED')).text).toBe(causeOf(lead('CONFIRMED')).text);
  });
});

describe('heroNextCheck', () => {
  it('reads the engine recommendation first', () => {
    const r = row(END, { diagnosis: 'CONFIRMED_OSCILLATION', narrative: { selectedFamily: null, statusReason: null, recommendation: 'Retune the controller.' } });
    expect(heroNextCheck(r)).toBe('Retune the controller.');
  });

  it('never sends a reader of this page to this page', () => {
    expect(heroNextCheck(finding)).toBe('Compare PV, SP and OP over this window.');
  });

  it('falls back to the state\'s next check elsewhere', () => {
    expect(heroNextCheck(excluded)).toMatch(/Historical shows when it ran/);
  });

  it('never says a no-fault window is short of data', () => {
    expect(heroNextCheck(row(END, { diagnosis: 'INSUFFICIENT_EVIDENCE' }))).toMatch(/No fault reached the evidence threshold/);
  });
});
