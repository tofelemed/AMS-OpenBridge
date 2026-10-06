import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FacetPill, instrumentHealthText, liveSignalQuality, signalQualityText } from './FacetPill';

describe('FacetPill', () => {
  afterEach(cleanup);

  it('always names its facet, so a value is never read without its subject', () => {
    render(<FacetPill facet="signal" tone="good">Good</FacetPill>);
    const pill = screen.getByTitle(/^Signal quality:/);
    expect(pill.textContent).toBe('Signal qualityGood');
    expect(pill.className).toContain('cpm-pill--good');
  });

  it('gives each facet its own caption', () => {
    render(<>
      <FacetPill facet="health" tone="muted">Not configured</FacetPill>
      <FacetPill facet="diagnosis" tone="bad">Oscillation confirmed</FacetPill>
    </>);
    expect(screen.getByTitle(/^Instrument health:/).textContent).toContain('Instrument health');
    expect(screen.getByTitle(/^Diagnosis:/).textContent).toContain('Oscillation confirmed');
  });
});

describe('facet wording', () => {
  it('turns quality labels into words', () => {
    expect(signalQualityText('GOOD')).toBe('Good');
    expect(signalQualityText('OUT OF SERVICE')).toBe('Out of service');
  });

  it('drops the repeated subject from health labels', () => {
    expect(instrumentHealthText('HEALTH NOT CONFIGURED')).toBe('Not configured · not checked');   // CHG-064: NE107, absent is not OK
    expect(instrumentHealthText('INSTRUMENT FAULT')).toBe('Fault');
    expect(instrumentHealthText('INSTRUMENTS OK')).toBe('OK');
    expect(instrumentHealthText('SOMETHING NEW')).toBe('Something new');
  });
});

describe('liveSignalQuality', () => {
  const NOW = Date.parse('2026-10-06T08:00:00Z');
  const good = { label: 'GOOD', tone: 'good' as const };

  it('is the source quality while the value is fresh', () => {
    expect(liveSignalQuality(good, NOW - 4 * 60_000, NOW)).toEqual({ text: 'Good', tone: 'good' });
    expect(liveSignalQuality(good, null, NOW)).toEqual({ text: 'Good', tone: 'good' });
  });

  it('turns a stalled Good into Uncertain with the age (OPC UA last usable value)', () => {
    expect(liveSignalQuality(good, NOW - 15 * 3600_000, NOW)).toEqual({ text: 'Uncertain · last value 15 h ago', tone: 'warn' });
  });

  it('keeps a stalled Bad as Bad, with the age', () => {
    expect(liveSignalQuality({ label: 'BAD', tone: 'bad' }, NOW - 20 * 60_000, NOW))
      .toEqual({ text: 'Bad · last value 20 min ago', tone: 'bad' });
  });
});
