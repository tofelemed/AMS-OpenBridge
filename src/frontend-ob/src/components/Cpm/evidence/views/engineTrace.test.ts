// SME #14/#15 (CHG-051): the fusion explanations string becomes readable rows; the formatter labels codes,
// counts composite engine records, rounds embedded numbers and reads milliseconds as a duration.
import { describe, expect, it } from 'vitest';
import { parseExplanations } from './engineTrace';
import { fmtQuantity } from '../format';

describe('parseExplanations', () => {
  it('splits symptom, gate, result and the qualifiers into words', () => {
    const rows = parseExplanations('OSCILLATION=G5=PASS,period=NO_VALID_CYCLE;PEER_INTERACTION=G13=NOT_EVALUATED:NOT_CONFIGURED;FREEZE=G11=PASS');
    expect(rows).toEqual([
      { observation: 'OSCILLATION', gate: 'G5', status: 'PASS', note: 'period: no clean oscillation cycle' },
      { observation: 'PEER_INTERACTION', gate: 'G13', status: 'NOT_EVALUATED', note: 'Not configured' },
      { observation: 'FREEZE', gate: 'G11', status: 'PASS', note: '' },
    ]);
    expect(parseExplanations(undefined)).toEqual([]);
  });
});

describe('fmtQuantity (CHG-051)', () => {
  it('labels a lone code and the codes inside text', () => {
    expect(fmtQuantity('HEALTH_NOT_CONFIGURED')).toBe('Instrument health not configured');
    expect(fmtQuantity('CONFIRMED_OSCILLATION', undefined, 'decision_record.case_state')).toBe('Oscillation confirmed');
    expect(fmtQuantity('ARGMAX_RANKED - not an additive waterfall')).toBe('Highest evidence score leads - not an additive waterfall');
  });
  it('counts a composite engine record instead of printing it', () => {
    expect(fmtQuantity('STICTION:DISQUALIFIED:0.0;OSCILLATION_TUNING:QUALIFIED:1.0')).toBe('2 entries — read them in the evidence view');
  });
  it('rounds long decimals inside text and reads milliseconds as a duration', () => {
    expect(fmtQuantity('a 0.3142214703210277 b')).toBe('a 0.314 b');
    expect(fmtQuantity('86400000', undefined, 'qualified_support')).toBe('24 h');
    expect(fmtQuantity(18804, undefined, 'last_duration_ms')).toBe('19 s');
  });
});
