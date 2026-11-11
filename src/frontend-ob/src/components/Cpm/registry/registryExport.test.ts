// CHG-168 (owner answer 3c): Export CSV writes the registry in the bulk-import format (the template's columns), so the file
// imports back as it is.
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../../api/cpmApi';
import { CSV_HEADERS, parseCsv } from '../csvImport';
import { exportFileName, registryCsv } from './registryExport';

const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: `Flow controller ${id} (FCS0101)`, site: 'hdpe', area: 'section_600', unit: 'u6002',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `hdpe/section_600/u6002/${id.toLowerCase()}.pv`, SP: `hdpe/section_600/u6002/${id.toLowerCase()}.sp`,
    OP: `hdpe/section_600/u6002/${id.toLowerCase()}.op`, MODE: `hdpe/section_600/u6002/${id.toLowerCase()}.mode` },
  observabilityFlags: [], links: [], stepTestApproved: false, thresholdProfileId: null, model: null, ...over,
} as CpmLoop);

describe('registryCsv', () => {
  it('starts with the template header row', () => {
    expect(registryCsv([]).split('\n')[0]).toBe(CSV_HEADERS.join(','));
  });

  it('writes one row per loop in the template columns', () => {
    const csv = registryCsv([loop('FIC10401', {
      tags: { PV: 'hdpe/section_600/u6002/fic10401.pv', VP: 'hdpe/section_600/u6002/fic10401.vp' },
      thresholdProfileId: 'prof-1',
      engineering: { pvMin: 0, pvMax: 2500, opMin: 0, opMax: 100, pvUnit: 'kg/h', vpApplicability: 'NOT_INSTALLED', peerApplicability: 'NOT_APPLICABLE' },
    })]);
    expect(csv.split('\n')[1]).toBe(
      'FIC10401,Flow controller FIC10401 (FCS0101),hdpe,section_600,u6002,FIC,medium,hdpe/section_600/u6002/fic10401.pv,,,,'
      + 'hdpe/section_600/u6002/fic10401.vp,prof-1,0,2500,0,100,kg/h,NOT_INSTALLED,NOT_APPLICABLE');
  });

  it('leaves a derived applicability and an undeclared range blank, so they stay derived and undeclared', () => {
    const row = registryCsv([loop('FIC1', { area: null, unit: 'u1' })]).split('\n')[1].split(',');
    expect(row[3]).toBe('');
    expect(row.slice(13)).toEqual(['', '', '', '', '', '', '']);
  });

  it('quotes a cell with a comma or a quote, and keeps a line break out of a cell', () => {
    const csv = registryCsv([loop('FIC1', { displayName: 'Reactor 1, "feed"\nflow' })]);
    expect(csv.split('\n')[1]).toMatch(/^FIC1,"Reactor 1, ""feed"" flow",hdpe,/);
  });

  it('imports back with no problem and the same values', () => {
    const loops = [loop('FIC10401', { engineering: { pvMin: 0, pvMax: 2500, pvUnit: 'kg/h' }, thresholdProfileId: 'p' }),
      loop('FIC10402', { displayName: 'Feed, train 2' })];
    const parsed = parseCsv(registryCsv(loops), [], undefined, ['FIC']);
    expect(parsed.missing).toEqual([]);
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows.map(r => r.problems)).toEqual([[], []]);
    expect(parsed.rows[0].engineering).toEqual({ pvMin: 0, pvMax: 2500, pvUnit: 'kg/h' });
    expect(parsed.rows[0].paths.pv).toEqual({ path: 'hdpe/section_600/u6002/fic10401.pv', derived: false });
    expect(parsed.rows[1].values.service).toBe('Feed, train 2');
  });
});

describe('exportFileName', () => {
  it('names the file after the template, with the day', () => {
    expect(exportFileName(new Date('2026-11-11T10:00:00Z'))).toBe('cplm-loop-registry-2026-11-11.csv');
  });
});
