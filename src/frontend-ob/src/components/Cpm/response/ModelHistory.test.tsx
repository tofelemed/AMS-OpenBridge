// v2.5 Task 2E.5 (spec §2.8): model history shows parameter estimates as interval markers at the
// instant each model was created - never a line joining models, which would suggest a trajectory
// the kernel never estimated.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ModelHistoryBody } from './ModelHistory';
import type { SystemModel } from '../../../api/cpm/response';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: Record<string, unknown>) => React.createElement('button', { disabled: p.disabled as boolean, 'aria-describedby': p['aria-describedby'] as string, 'data-variant': p.variant as string, onClick: p.onClick as () => void }, p.children as React.ReactNode),
}));
const download = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/csv', () => ({ downloadTextFile: download }));
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
    render(<ModelHistoryBody models={models} timeZone="UTC" pvUnit="m3/h" onReview={() => {}} canReview={false} />);
    expect(captured.length).toBeGreaterThan(0);
    for (const o of captured as Array<{ series: Array<{ name: string; showSymbol: boolean; lineStyle: { width: number } }>; yAxis: Array<{ name: string }> }>) {
      expect(o.series.length).toBeGreaterThan(0);
      for (const s of o.series) {
        expect(s.showSymbol).toBe(true);
        expect(s.lineStyle.width).toBe(0);                                                       // markers only: no line joins two models
      }
    }
    const gain = captured[0] as { series: Array<{ name: string; data: Array<[number, number | null]> }>; yAxis: Array<{ name: string }> };
    expect(gain.yAxis[0].name).toBe('m3/h/pp');   // CHG-097 (SME 2 #15): the loop's PV unit, not the kernel placeholder
    expect(gain.series.find(s => s.name === 'Process gain')!.data.map(d => d[1])).toEqual([3.0, 3.2]);
    // CHG-165: the caps above and below each estimate are one legend entry, its meaning said once
    const caps = gain.series.filter(s => /^Interval/.test(s.name));
    expect(caps).toHaveLength(1);
    expect(caps[0].name).toBe('Interval — ± 1 standard error of the estimate');
    const ys = caps[0].data.map(d => d[1] as number);
    expect(ys[0]).toBeCloseTo(3.02, 9); expect(ys[1]).toBeCloseTo(2.98, 9);   // model a: upper, lower
    expect(ys[2]).toBeCloseTo(3.3, 9); expect(ys[3]).toBeCloseTo(3.1, 9);     // model b
    const tc = captured[2] as { series: Array<{ name: string; data: Array<[number, number | null]> }> };
    expect(tc.series.find(s => s.name === 'Time constant')!.data.map(d => d[1])).toEqual([20]); // a null parameter is not a point
    expect(screen.getByText('Validated')).toBeTruthy();
    expect(screen.getAllByText(/Review/).length).toBeGreaterThan(0);
  });

  it('groups models as candidate, validated and baseline, then the rest', () => {
    const models = [model({ modelId: 'x', modelState: 'SUPERSEDED' }), model({ modelId: 'b', modelState: 'ACTIVE_BASELINE' }), model({ modelId: 'v', modelState: 'VALIDATED' }), model({ modelId: 'c', modelState: 'CANDIDATE' })];
    render(<ModelHistoryBody models={models} timeZone="UTC" onReview={() => {}} canReview />);
    const heads = Array.from(document.querySelectorAll('tr.ui-table__group-row')).map(r => r.textContent);
    expect(heads).toEqual(['Candidate (1)', 'Validated (1)', 'Baseline (1)', 'Other (1)']);
    expect(document.querySelectorAll('tbody tr:not(.ui-table__group-row)')).toHaveLength(4);
  });

  // CHG-195 (owner review item 19): the standard table, no estimator column (Q8; the CSV keeps it), Review a secondary button
  it('draws the models in the standard table without the estimator, Review as a secondary button', () => {
    render(<ModelHistoryBody models={[model({ modelId: 'c', modelState: 'CANDIDATE' })]} timeZone="UTC" onReview={() => {}} canReview />);
    const table = document.querySelector('.ui-table table') as HTMLTableElement;
    expect(table).toBeTruthy();
    expect([...table.querySelectorAll('thead th')].map(h => h.textContent)).toEqual(['Created', 'Family', 'Path', 'State', 'Revision', 'Reviewed by', 'Review']);
    expect(table.textContent).not.toMatch(/OUTPUT_ERROR_LM|estimator/i);
    const review = within(table).getByRole('button', { name: 'Review' });
    expect(review.getAttribute('data-variant')).toBe('flat');
  });

  // CHG-195 (owner review item 19): the three trends one per row, full width, each with its own heading, legend, zoom tools and
  // Export CSV in its head; the hover readout stays inside the chart (confine), so it never hides under the sidebar
  it('draws one parameter trend per row, full width, each with its heading, zoom tools and Export CSV in its own head', () => {
    const p = (v: number) => ({ value: v, unit: 's', uncertainty: 0.5, method: 'COVARIANCE', reason: null });
    const models = [model({ modelId: 'a', parameters: { process_gain: { ...p(3), unit: 'PV_EU/pp' }, dead_time: p(4), time_constant: p(20) } })];
    const { container } = render(<ModelHistoryBody models={models} timeZone="UTC" pvUnit="m3/h" onReview={() => {}} canReview={false} />);
    const rows = container.querySelector('.cpm-response-trend-rows') as HTMLElement;
    expect(rows).toBeTruthy();
    const charts = [...rows.querySelectorAll(':scope > .cpm-chart')];
    expect(charts).toHaveLength(3);
    expect(charts.map(c => c.querySelector('.cpm-chart__bar h3')?.textContent)).toEqual(['Process gain (m3/h/pp)', 'Dead time (s)', 'Time constant (s)']);
    for (const c of charts) {
      const bar = c.querySelector('.cpm-chart__bar') as HTMLElement;
      expect([...bar.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Zoom area', 'Undo', 'Reset', 'Export CSV']);
      expect(c.querySelector('.cpm-chart__more')).toBeNull();
    }
    expect(screen.getAllByText('Export models CSV')).toHaveLength(1);
    for (const o of captured as Array<{ tooltip: { confine?: boolean } }>) expect(o.tooltip.confine).toBe(true);
    // the readout names the model by its state, not by its id (no technical text)
    const gain = captured[0] as { series: Array<{ __meta?: (i: number) => string[] }> };
    expect(gain.series[0].__meta!(0)).toEqual(['Candidate model', 'interval 2.50 … 3.50 (± 1 standard error of the estimate)']);
  });

  it('draws nothing without models: the summary tile says so', () => {
    const { container } = render(<ModelHistoryBody models={[]} timeZone="UTC" onReview={() => {}} canReview />);
    expect(captured).toHaveLength(0);
    expect(container.textContent).toBe('');
  });

  it('shows the permission sentence once, and every disabled Review button is described by it', () => {
    render(<ModelHistoryBody models={[model({ modelId: 'a', modelState: 'CANDIDATE' }), model({ modelId: 'b', modelState: 'VALIDATED' })]} timeZone="UTC" onReview={() => {}} canReview={false} />);
    const why = screen.getByText('Model review needs the cpm.model.review permission.');   // getBy: exactly one
    const buttons = document.querySelectorAll('[aria-describedby]');
    expect(buttons).toHaveLength(2);
    buttons.forEach(b => { expect(b.getAttribute('aria-describedby')).toBe(why.id); expect((b as HTMLButtonElement).disabled).toBe(true); });
  });

  it('exports the models table as CSV, the loop in the file name (CHG-165)', () => {
    render(<ModelHistoryBody models={[model({ modelId: 'm1', parameters: { process_gain: { value: 0.21, unit: 'PV_EU/input_EU', uncertainty: 0.02, method: 'MODEL_FOPDT', reason: null } } })]}
      timeZone="UTC" canReview={false} onReview={() => {}} />);
    fireEvent.click(screen.getByText('Export models CSV'));
    expect(download).toHaveBeenCalledTimes(1);
    const [name, body] = download.mock.calls[0] as [string, string];
    expect(name).toMatch(/^FIC10302-models-/);
    const lines = body.split(/\r?\n/);
    expect(lines[0]).toBe('created_utc,family,path,estimator,state,revision,reviewed_by,process_gain,process_gain_uncertainty,model_id');
    expect(lines[1]).toMatch(/^2026-09-16T12:00:00Z,FOPDT,OP_TO_PV,OUTPUT_ERROR_LM,CANDIDATE,1,,0.21,0.02,m1$/);
  });
});
