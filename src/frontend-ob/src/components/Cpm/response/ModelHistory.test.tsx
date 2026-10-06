// v2.5 Task 2E.5 (spec §2.8): model history shows parameter estimates as interval markers at the
// instant each model was created - never a line joining models, which would suggest a trajectory
// the kernel never estimated.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ModelHistoryBody } from './ModelHistory';
import type { SystemModel } from '../../../api/cpm/response';

const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));
afterEach(() => { cleanup(); captured.length = 0; });

const model = (over: Partial<SystemModel>): SystemModel => ({
  modelId: 'm', loopId: 'FIC10302', pathId: 'OP_TO_PV', family: 'FOPDT', parameters: null, estimator: 'OUTPUT_ERROR_LM', uncertaintyMethod: 'COVARIANCE',
  trainingSupport: null, validationSupport: null, modelState: 'CANDIDATE', approvedDomain: null, controllerSnapshotId: null, contextRevision: 1,
  createdFromEvent: null, methodRunId: null, bundleHash: 'b', revision: 1, reviewedBy: null, reviewedAt: null, reviewNote: null, createdAt: '2026-09-16T12:00:00Z', supersededBy: null, ...over,
});

describe('ModelHistory', () => {
  it('draws every parameter as markers with its uncertainty interval, and no line series', () => {
    const models = [
      model({ modelId: 'a', createdAt: '2026-09-16T10:00:00Z', modelState: 'VALIDATED', parameters: { process_gain: { value: 3.0, unit: 'PV_EU/pp', uncertainty: 0.02, method: 'COVARIANCE', reason: null }, dead_time: { value: 4, unit: 's', uncertainty: 0.5, method: 'COVARIANCE', reason: null }, time_constant: { value: 20, unit: 's', uncertainty: 1, method: 'COVARIANCE', reason: null } } }),
      model({ modelId: 'b', createdAt: '2026-09-16T12:00:00Z', modelState: 'CANDIDATE', parameters: { process_gain: { value: 3.2, unit: 'PV_EU/pp', uncertainty: 0.1, method: 'COVARIANCE', reason: null }, dead_time: { value: 4.5, unit: 's', uncertainty: null, method: 'COVARIANCE', reason: null }, time_constant: { value: null, unit: 's', uncertainty: null, method: '', reason: 'NOT_ESTIMATED' } } }),
    ];
    render(<ModelHistoryBody models={models} timeZone="UTC" onReview={() => {}} canReview={false} />);
    expect(captured.length).toBeGreaterThan(0);
    for (const o of captured as Array<{ series: Array<{ name: string; showSymbol: boolean; lineStyle: { width: number } }>; yAxis: Array<{ name: string }> }>) {
      expect(o.series.length).toBeGreaterThan(0);
      for (const s of o.series) {
        expect(s.showSymbol).toBe(true);
        expect(s.lineStyle.width).toBe(0);                                                       // markers only: no line joins two models
      }
    }
    const gain = captured[0] as { series: Array<{ name: string; data: Array<[number, number | null]> }>; yAxis: Array<{ name: string }> };
    expect(gain.yAxis[0].name).toBe('PV_EU/pp');
    expect(gain.series.find(s => s.name === 'process_gain')!.data.map(d => d[1])).toEqual([3.0, 3.2]);
    const upper = gain.series.find(s => /upper/.test(s.name))!.data.map(d => d[1] as number);
    const lower = gain.series.find(s => /lower/.test(s.name))!.data.map(d => d[1] as number);
    expect(upper[0]).toBeCloseTo(3.02, 9); expect(upper[1]).toBeCloseTo(3.3, 9);
    expect(lower[0]).toBeCloseTo(2.98, 9); expect(lower[1]).toBeCloseTo(3.1, 9);
    const tc = captured[2] as { series: Array<{ name: string; data: Array<[number, number | null]> }> };
    expect(tc.series.find(s => s.name === 'time_constant')!.data.map(d => d[1])).toEqual([20]); // a null parameter is not a point
    expect(screen.getByText('Validated')).toBeTruthy();
    expect(screen.getAllByText(/Review/).length).toBeGreaterThan(0);
  });

  it('states the absence of models rather than drawing an empty chart', () => {
    render(<ModelHistoryBody models={[]} timeZone="UTC" onReview={() => {}} canReview />);
    expect(captured).toHaveLength(0);
    expect(screen.getByText(/No system model/)).toBeTruthy();
  });
});
