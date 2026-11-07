import { describe, expect, it } from 'vitest';
import { fmtAge, mergeJobs } from './mergeJobs';
import type { CpmJobMetrics, CpmPipelineJob } from '../../../api/cpmApi';

const names = Array.from({ length: 13 }, (_, i) => `AMS - Job ${i + 1}`);
const status: CpmPipelineJob[] = names.map((name, i) => ({
  name, role: i < 3 ? 'alarm' : 'cplm', state: i < 2 ? 'RUNNING' : 'MISSING', running: i < 2,
}));
const metric = (name: string, state: string): CpmJobMetrics => ({
  name, jid: `jid-${name}`, state, role: 'alarm', startTime: '2026-11-07T00:00:00Z', uptimeSec: 3600,
  checkpoint: { completed: 9, failed: 1, lastDurationMs: 120, lastSizeBytes: 2048, lastCompletedAgeSec: 14 },
});

describe('mergeJobs', () => {
  it('lists every required job, including missing ones', () => {
    const rows = mergeJobs([metric(names[0], 'RUNNING'), metric(names[1], 'RUNNING')], status);
    expect(rows).toHaveLength(13);
    expect(rows.filter(r => r.state === 'MISSING')).toHaveLength(11);
    expect(rows[0].checkpoint?.completed).toBe(9);
    expect(rows[5].checkpoint).toBeNull();
    expect(rows[5].uptimeSec).toBeNull();
  });

  it('takes the state the engine reports over the status list', () => {
    const rows = mergeJobs([metric(names[2], 'FAILING')], status);
    expect(rows[2].state).toBe('FAILING');
  });

  it('falls back to the metrics rows when the status list is unavailable', () => {
    expect(mergeJobs([metric(names[0], 'RUNNING')], [])).toHaveLength(1);
  });

  it('adds a running job the required list does not name as its own row', () => {
    const rows = mergeJobs([metric(names[0], 'RUNNING'), metric('AMS - Extra Job', 'RUNNING')], status);
    expect(rows).toHaveLength(14);
    expect(rows[13]).toMatchObject({ name: 'AMS - Extra Job', required: false, state: 'RUNNING' });
    expect(rows.filter(r => r.required)).toHaveLength(13);
    expect(rows[2].state).toBe('MISSING');
  });

  it('lets the RUNNING entry win when the engine lists a name twice', () => {
    const rows = mergeJobs([metric(names[0], 'CANCELED'), metric(names[0], 'RUNNING')], status);
    expect(rows[0].state).toBe('RUNNING');
    const rows2 = mergeJobs([metric(names[0], 'RUNNING'), metric(names[0], 'CANCELED')], status);
    expect(rows2[0].state).toBe('RUNNING');
  });

  it('formats a long checkpoint age as a duration', () => {
    expect(fmtAge(5400)).toBe('1.5 h');
    expect(fmtAge(null)).toBe('Not exposed');
  });
});
