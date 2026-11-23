// CHG-219: the per-loop table's edit rules and the batch buttons, decided the way the server decides them.
import { describe, expect, it } from 'vitest';
import type { Batch, BatchRow, LoopRegion } from '../../../api/cpm/configRegions';
import { approveAction, changedRows, deployAction, fromWord, outsideRange, parseDraft, rangeText } from './regionEdit';

const loop = (loopId: string, over: Partial<LoopRegion> = {}): LoopRegion => ({
  loopId, displayName: null, loopType: 'LIC', site: 'hdpe', pvRangeMin: 0, pvRangeMax: 100, regionMin: null, regionMax: null,
  source: 'NONE', bundleId: null, bundleVersion: null, ...over,
});
const row = (state: string, over: Partial<BatchRow> = {}): BatchRow => ({
  loopId: 'LIC1', site: 'hdpe', bundleId: 'b', version: 2, state, pvMin: 10, pvMax: 90, previousMin: null, previousMax: null,
  error: null, problems: [], deploymentId: null, deploymentState: null, ...over,
});
const batch = (rows: BatchRow[], createdBy = 'ali'): Batch => ({ batchId: 'x', site: 'hdpe', count: rows.length, rows, createdBy });

describe('parseDraft', () => {
  it('both empty clears; one empty, text or min >= max is refused in words', () => {
    expect(parseDraft({ min: ' ', max: '' })).toEqual({ pvMin: null, pvMax: null });
    expect(parseDraft({ min: '10', max: '' }).error).toBe('Give both values, or leave both empty');
    expect(parseDraft({ min: 'ten', max: '20' }).error).toBe('Not a number');
    expect(parseDraft({ min: '20', max: '20' }).error).toBe('Min must be below max');
    expect(parseDraft({ min: '-5.5', max: '1e2' })).toEqual({ pvMin: -5.5, pvMax: 100 });
  });
});

describe('changedRows', () => {
  it('sends only the rows that changed; clears only a loop that has its own region', () => {
    const loops = [
      loop('A', { regionMin: 10, regionMax: 90, source: 'LOOP' }),
      loop('B', { regionMin: 10, regionMax: 90, source: 'LOOP' }),
      loop('C', { regionMin: 5, regionMax: 95, source: 'PROFILE' }),
      loop('D'),
      loop('E'),
    ];
    const { changes, errors } = changedRows(loops, {
      A: { min: '10', max: '90' },          // unchanged
      B: { min: '', max: '' },              // clears its own
      C: { min: '', max: '' },              // plant-wide: nothing of its own to clear
      D: { min: '20', max: '80' },          // new
      E: { min: '30', max: '' },            // half
    });
    expect(changes).toEqual([{ loopId: 'B', pvMin: null, pvMax: null }, { loopId: 'D', pvMin: 20, pvMax: 80 }]);
    expect(errors).toEqual({ E: 'Give both values, or leave both empty' });
  });
});

describe('outsideRange and rangeText', () => {
  it('names the side a region reaches past the PV range; a range reads "min – max"', () => {
    expect(outsideRange(loop('A'), -1, 50)).toBe('Below the PV range');
    expect(outsideRange(loop('A'), 10, 150)).toBe('Above the PV range');
    expect(outsideRange(loop('A'), 10, 90)).toBeNull();
    expect(outsideRange(loop('A', { pvRangeMin: null }), -1, 50)).toBeNull();
    expect(rangeText(0, 100)).toBe('0 – 100');
    expect(rangeText(null, 100)).toBe('');
  });
});

describe('fromWord', () => {
  it('names the level a region comes from; a marker is not own settings', () => {
    expect(fromWord(loop('A', { source: 'LOOP', bundleVersion: 12, regionMin: 1, regionMax: 2 }))).toBe('Own settings v12');
    expect(fromWord(loop('A', { source: 'LOOP', bundleVersion: 12, inherits: true }))).toBe('—');
    expect(fromWord(loop('A', { source: 'PROFILE' }))).toBe('Type settings');
    expect(fromWord(loop('A', { source: 'SITE' }))).toBe('Plant settings');
    expect(fromWord(loop('A'))).toBe('—');
  });
});

describe('approveAction', () => {
  const waiting = batch([row('VALIDATED')]);
  it('someone other than the author approves', () => {
    expect(approveAction(waiting, { username: 'sara', role: 'Engineer' }, true)).toEqual({ label: 'Approve', enabled: true, reason: null });
  });
  it('the author approves alone only as Admin or SuperAdmin', () => {
    expect(approveAction(waiting, { username: 'ALI', role: 'SuperAdmin' }, true)).toEqual({ label: 'Approve alone (Admin)', enabled: true, reason: null });
    expect(approveAction(waiting, { username: 'ali', role: 'Engineer' }, true)).toEqual({ label: 'Approve', enabled: false, reason: 'Needs a second person' });
  });
  it('the author is read from the rows when the batch carries none', () => {
    const b = { ...batch([row('VALIDATED', { createdBy: 'ali' })]), createdBy: null };
    expect(approveAction(b, { username: 'ali', role: 'Admin' }, true).label).toBe('Approve alone (Admin)');
  });
  it('nothing waiting, or no permission, disables it', () => {
    expect(approveAction(batch([row('APPROVED')]), { username: 'sara', role: 'Admin' }, true).enabled).toBe(false);
    expect(approveAction(batch([row('VALIDATED', { error: 'x' })]), { username: 'sara', role: 'Admin' }, true).enabled).toBe(false);
    expect(approveAction(waiting, { username: 'sara', role: 'Admin' }, false)).toEqual({ label: 'Approve', enabled: false, reason: 'Your account cannot approve' });
  });
});

describe('deployAction', () => {
  it('deploys approved rows and redeploys a failed one; not a draft or an active one', () => {
    expect(deployAction(batch([row('APPROVED')]), true).enabled).toBe(true);
    expect(deployAction(batch([row('ACTIVATION_FAILED')]), true).enabled).toBe(true);
    expect(deployAction(batch([row('VALIDATED'), row('ACTIVE_VERIFIED')]), true).enabled).toBe(false);
    expect(deployAction(batch([row('APPROVED')]), false).reason).toBe('Your account cannot deploy');
  });
});
