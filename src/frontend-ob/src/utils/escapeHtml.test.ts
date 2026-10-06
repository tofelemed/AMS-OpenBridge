import { describe, expect, it } from 'vitest';
import { escapeHtml, isValidPvUnit } from './escapeHtml';

describe('escapeHtml', () => {
  it('neutralises markup', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml("a & b's")).toBe('a &amp; b&#39;s');
    expect(escapeHtml(null)).toBe('');
  });
  it('leaves unit text alone', () => {
    expect(escapeHtml('kg/h')).toBe('kg/h');
    expect(escapeHtml('m³/h')).toBe('m³/h');
  });
});

describe('isValidPvUnit', () => {
  it('accepts real units and rejects markup or overlong text', () => {
    for (const u of ['kg/h', '°C', 'm³/h', '% LEL', 'µS/cm', ' barg ']) expect(isValidPvUnit(u)).toBe(true);
    for (const u of ['<b>', 'a&b', 'kg"/h', 'x'.repeat(25), '']) expect(isValidPvUnit(u)).toBe(false);
  });
});
