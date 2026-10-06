// CHG-047 (SME review #10): the optional pv_unit column of the bulk registry import.
import { describe, expect, it } from 'vitest';
import { CSV_HEADERS, parseCsv } from './csvImport';

const header = 'tag,service,site,unit,loop_type,criticality,pv_min,pv_max,pv_unit';
const parse = (row: string) => parseCsv(`${header}\n${row}`, [], null as never, ['FIC']);

describe('pv_unit column', () => {
  it('is a known column, not reported as a typo', () => {
    expect(CSV_HEADERS).toContain('pv_unit');
    expect(parse('FIC1,Feed,hdpe,u1,FIC,medium,0,900,kg/h').unknownColumns).toEqual([]);
  });

  it('rides along in the engineering block, trimmed, beside the ranges', () => {
    expect(parse('FIC1,Feed,hdpe,u1,FIC,medium,0,900, kg/h ').rows[0].engineering)
      .toEqual({ pvMin: 0, pvMax: 900, pvUnit: 'kg/h' });
  });

  it('is enough on its own, and a blank one is left out', () => {
    expect(parse('FIC1,Feed,hdpe,u1,FIC,medium,,,°C').rows[0].engineering).toEqual({ pvUnit: '°C' });
    expect(parse('FIC1,Feed,hdpe,u1,FIC,medium,0,900,').rows[0].engineering).toEqual({ pvMin: 0, pvMax: 900 });
  });
});

describe('pv_unit safety', () => {
  it('reports markup as a row problem and never sends it', () => {
    const row = parse('FIC1,Feed,hdpe,u1,FIC,medium,0,900,<b>kg</b>').rows[0];
    expect(row.problems.some(p => p.startsWith("pv_unit '<b>kg</b>' is not a unit"))).toBe(true);
    expect(row.engineering).toEqual({ pvMin: 0, pvMax: 900 });
  });
});
