import { describe, expect, it } from 'vitest';
import { mergeJobs } from './mergeJobs';
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
});
