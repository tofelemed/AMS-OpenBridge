// v2.5 workbench (audit F7): when the sibling G0 run kept no arrays (retention keeps them only for
// windows with a finding), the signal context comes from the historian's bucketed trend - one
// request per window, labelled as such, never presented as the run's own qualification.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HistorianLanes, laneSource, modeIntervalsFromTrend, trendRoleSeries } from './HistorianLanes';
import type { CpmTrendPoint } from '../../../api/cpmApi';

const captured: unknown[] = [];
vi.mock('echarts-for-react', () => ({ default: (props: { option: unknown }) => { captured.push(props.option); return React.createElement('div', { 'data-testid': 'echarts' }); } }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
const trendState = { data: undefined as unknown, isLoading: false, error: null as unknown };
const modeState = { data: undefined as unknown, isLoading: false, error: null as unknown };
vi.mock('../../../hooks/useCpm', () => ({ useCpmTrend: () => trendState, useCpmModeTrack: () => modeState }));
afterEach(() => { cleanup(); captured.length = 0; });

const T0 = Date.UTC(2026, 8, 16, 8, 0);
const pts: CpmTrendPoint[] = [
  { ts: T0, pv: 60.1, sp: 63, op: 42.5, vp: null, pv_min: 59.9, pv_max: 60.4 },
  { ts: T0 + 60_000, pv: 60.5, sp: 63, op: 43.1, vp: null, pv_min: 60.2, pv_max: 60.9 },
] as unknown as CpmTrendPoint[];

describe('trendRoleSeries / modeIntervalsFromTrend / laneSource', () => {
  it('turns a role of the bucketed trend into a series (envelope in the tooltip) and omits an all-null role', () => {
    const pv = trendRoleSeries(pts, 'pv', 'EU', () => 't')!;
    expect(pv.label).toBe('PV (historian)');
    expect(pv.y).toEqual([60.1, 60.5]);
    expect(pv.meta!(0).join(' ')).toMatch(/min 59.9 · max 60.4/);
    expect(trendRoleSeries(pts, 'vp', 'pp', () => 't')).toBeNull();
  });
  it('run-lengths the mode track into intervals ending at the window end', () => {
    const modes = [{ ts: T0, mode: 'AUT' }, { ts: T0 + 60_000, mode: 'AUT' }, { ts: T0 + 120_000, mode: 'MAN' }] as unknown as CpmTrendPoint[];
    expect(modeIntervalsFromTrend(modes, T0 + 180_000)).toEqual([
      { startMs: T0, endMs: T0 + 120_000, label: 'AUT', tone: 'good' },
      { startMs: T0 + 120_000, endMs: T0 + 180_000, label: 'MAN', tone: 'warn' },
    ]);
  });
  it('decides the lane source: the run\'s arrays when a COMPLETE role_qualification exists, else the historian', () => {
    expect(laneSource({ isLoading: true, data: undefined }, true)).toBe('loading');
    expect(laneSource({ isLoading: false, data: { artifacts: [{ kind: 'role_qualification', readiness: 'COMPLETE' }] } }, true)).toBe('run');
    expect(laneSource({ isLoading: false, data: { artifacts: [{ kind: 'role_qualification', readiness: 'EXPIRED' }] } }, true)).toBe('historian');
    expect(laneSource({ isLoading: false, data: { artifacts: [] } }, true)).toBe('historian');
    expect(laneSource({ isLoading: false, data: undefined }, false)).toBe('historian');
  });
});

describe('HistorianLanes', () => {
  it('draws PV/SP and OP/VP from the trend, labelled as historian, and states loading', () => {
    trendState.data = { series: 's', envelope: true, points: pts };
    modeState.data = { series: 's', envelope: false, points: [] };
    render(<HistorianLanes loopId="FIC10405" fromMs={T0} toMs={T0 + 3_600_000} timeZone="UTC" timeFmt={() => 't'} healthLane={<div data-testid="health" />} />);
    expect(screen.getAllByText(/historian \(not the run's own qualification\)/).length).toBeGreaterThanOrEqual(2);
    expect(captured).toHaveLength(2);
    expect(screen.getByTestId('health')).toBeTruthy();
    trendState.data = undefined; trendState.isLoading = true;
    cleanup();
    render(<HistorianLanes loopId="FIC10405" fromMs={T0} toMs={T0 + 3_600_000} timeZone="UTC" timeFmt={() => 't'} healthLane={null} />);
    expect(screen.getByText(/Fetching the historian slice/)).toBeTruthy();
    trendState.isLoading = false;
  });
});
