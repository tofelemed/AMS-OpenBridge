// CHG-097 (SME review 2 #17): each download says what it holds and carries the loop, period, time zone and units;
// signal samples are separate from evaluated windows, at the loop's sample period unless the range would be too long.
import { describe, expect, it } from 'vitest';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { SAMPLE_ROW_CAP, headerLines, sampleBucketS, samplesCsv, unitOf, windowsCsv, type ExportContext } from './historyExports';

const loop = { loopId: 'FIC1', displayName: 'Feed, reactor A', site: 'hdpe', area: 'reaction', unit: 'u1',
  engineering: { pvUnit: 'kg/h' } } as unknown as CpmLoop;
const ctx: ExportContext = { loopId: 'FIC1', loop, from: new Date('2026-10-14T00:00:00Z'), to: new Date('2026-10-14T12:00:00Z'), timeZone: 'Asia/Dubai' };

describe('history exports (SME review 2 #17)', () => {
  it('every file names its content, loop, period and zone', () => {
    const h = headerLines(ctx, 'signal samples from the historian');
    expect(h[0]).toBe('# content: signal samples from the historian');
    expect(h).toContain('# loop: FIC1');
    expect(h).toContain('# name: Feed, reactor A');
    expect(h).toContain('# period: 2026-10-14T00:00:00.000Z to 2026-10-14T12:00:00.000Z');
    expect(h.find(l => l.startsWith('# time zone:'))).toMatch(/Asia\/Dubai \(UTC\+04:00\)/);
  });

  it('signal samples carry both clocks and a unit per column', () => {
    const csv = samplesCsv(ctx, [{ ts: Date.parse('2026-10-14T00:00:05Z'), pv: 12.5, sp: 12, op: 40.1, vp: null, mode: 'AUTO' }], 5, false).split('\n');
    expect(csv).toContain('time_utc,time_site,pv [kg/h],sp [kg/h],op [%],vp [%],mode [code]');
    expect(csv).toContain('2026-10-14T00:00:05.000Z,2026-10-14 04:00:05,12.5,12,40.1,,AUTO');
    expect(csv.find(l => l.startsWith('# resolution:'))).toMatch(/^# resolution: 5 s buckets/);
    expect(unitOf('pv', undefined)).toBe('PV unit (not registered)');
  });

  it('evaluated windows are labelled as windows, not samples, with the cap stated when hit', () => {
    const w = { windowKind: '12h', windowStart: '2026-10-14T00:00:00Z', windowEnd: '2026-10-14T12:00:00Z', diagnosis: 'NO_CALL',
      severity: null, confidence: 0.2, sampleCount: 8640, metadata: { calculationVersion: 'v3' } } as unknown as CpmGateMatrix;
    const csv = windowsCsv(ctx, [w], true, 100).split('\n');
    expect(csv[0]).toBe('# content: evaluated windows (fused verdicts) - not signal samples');
    expect(csv).toContain('12h,2026-10-14T00:00:00Z,2026-10-14T12:00:00Z,2026-10-14 16:00:00,NO_CALL,No fault identified,,0.2,8640,v3');
    expect(csv[csv.length - 1]).toMatch(/^# TRUNCATED/);
  });

  it('samples at the loop period, coarser only past the row cap', () => {
    expect(sampleBucketS(ctx.from, ctx.to, 5)).toEqual({ bucketS: 5, coarsened: false });
    const long = sampleBucketS(new Date(0), new Date(30 * 86_400_000), 5);
    expect(long.coarsened).toBe(true);
    expect((30 * 86_400) / long.bucketS).toBeLessThanOrEqual(SAMPLE_ROW_CAP);
  });
});
