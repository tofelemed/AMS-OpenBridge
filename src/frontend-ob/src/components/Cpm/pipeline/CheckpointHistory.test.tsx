// CHG-170 (owner answer 1): Checkpoint history is the page's second view - the same chart, two series, colours and zoom tools;
// the axis names sit clear of the legend (they were cut under it); the view says it covers the CPLM jobs only. Readings are
// taken by the page whichever view shows (the hook), up to 120, from the metrics read only.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { CpmJobMetrics } from '../../../api/cpmApi';

const { chart } = vi.hoisted(() => ({ chart: vi.fn() }));
vi.mock('echarts-for-react', () => ({ default: (p: { option: unknown }) => { chart(p.option); return null; } }));
vi.mock('../../charts/ChartZoomBar', () => ({ default: () => <div>zoom tools</div> }));
afterEach(() => { cleanup(); chart.mockReset(); });

import CheckpointHistory, { useCheckpointSamples } from './CheckpointHistory';

const job = (role: CpmJobMetrics['role'], age: number, dur: number): CpmJobMetrics => ({
  name: `AMS - ${role} ${age}`, jid: 'j', state: 'RUNNING', role, startTime: null, uptimeSec: 60,
  checkpoint: { completed: 1, failed: 0, lastDurationMs: dur, lastSizeBytes: 1, lastCompletedAgeSec: age },
});
const reading = (at: string, jobs: CpmJobMetrics[]) => ({ collectedAt: at, jobs });

describe('useCheckpointSamples', () => {
  it('keeps one reading per metrics answer: the largest age and duration of the CPLM jobs only', () => {
    const { result, rerender } = renderHook(({ m }) => useCheckpointSamples(m), {
      initialProps: { m: reading('2026-11-11T11:56:10Z', [job('cplm', 168, 9710), job('cplm', 60, 200), job('alarm', 900, 99_999)]) as ReturnType<typeof reading> | undefined },
    });
    expect(result.current).toEqual([{ t: Date.parse('2026-11-11T11:56:10Z'), ckptAgeSec: 168, ckptDurMs: 9710 }]);
    rerender({ m: reading('2026-11-11T11:56:10Z', [job('cplm', 1, 1)]) });
    expect(result.current).toHaveLength(1);
    rerender({ m: reading('2026-11-11T11:56:30Z', []) });
    expect(result.current[1]).toEqual({ t: Date.parse('2026-11-11T11:56:30Z'), ckptAgeSec: null, ckptDurMs: null });
    rerender({ m: undefined });
    expect(result.current).toHaveLength(2);
  });
});

describe('CheckpointHistory', () => {
  const samples = [
    { t: Date.parse('2026-11-11T11:56:10Z'), ckptAgeSec: 168, ckptDurMs: 9710 },
    { t: Date.parse('2026-11-11T11:56:30Z'), ckptAgeSec: 196, ckptDurMs: 9705 },
  ];

  it('says it covers the CPLM jobs, held while the page is open, and how many readings it has', () => {
    render(<CheckpointHistory samples={samples} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Checkpoint history' })).toBeTruthy();
    expect(screen.getByText('CPLM jobs · held only while this page is open · 2 readings')).toBeTruthy();
    expect(screen.getByText('zoom tools')).toBeTruthy();
  });

  it('keeps the series, colours and two axes, with the axis names below the legend', () => {
    render(<CheckpointHistory samples={samples} />);
    const option = chart.mock.calls.at(-1)![0] as {
      grid: { top: number }; legend: { top: number }; yAxis: Array<{ name: string; nameGap?: number }>; series: Array<{ name: string; data: unknown[] }>;
    };
    expect(option.series.map(s => s.name)).toEqual(['Max checkpoint age', 'Max checkpoint duration']);
    expect(option.yAxis.map(a => a.name)).toEqual(['ckpt age (s)', 'ckpt dur (ms)']);
    expect(option.series[0].data).toEqual([[samples[0].t, 168], [samples[1].t, 196]]);
    // the legend takes the top 24 px; an axis name sits nameGap (15) above the plot, so the plot starts low enough to clear it
    expect(option.legend.top).toBe(0);
    expect(option.grid.top - (option.yAxis[0].nameGap ?? 15)).toBeGreaterThanOrEqual(32);
  });

  it('asks for a second reading before it draws', () => {
    render(<CheckpointHistory samples={samples.slice(0, 1)} />);
    expect(screen.getByText('Collecting…')).toBeTruthy();
    expect(screen.getByText('The chart needs two readings; keep this page open.')).toBeTruthy();
    expect(screen.getByText('CPLM jobs · held only while this page is open · 1 reading')).toBeTruthy();
    expect(chart).not.toHaveBeenCalled();
  });
});
