// @vitest-environment jsdom
// CHG-170 (owner answer 2): Performance's stale line ("Stale · Newest fused window emitted … ago · Pipeline Health ↗") reads the
// same field as Pipeline Health's Last fused verdict tile - GET fleet/kpis newestResultAt, Stale once older than
// basis.freshSeconds (the Overview's rule) - so the two pages agree. A cplm-api without the field keeps the heatmap's 3 h read.
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setActiveZone } from '../../cpa/activeZone';

const state = vi.hoisted(() => ({ kpis: undefined as unknown, heatmapEnd: null as string | null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock('./performance/PerformanceKpis', () => ({ default: () => null, PerformanceKpis: () => null }));
vi.mock('./performance/HowToReadDialog', () => ({ default: () => null }));
vi.mock('./plantScope', () => ({ useCpmScope: () => ({ params: {} }) }));
vi.mock('./access', () => ({ usePipelineAccess: () => true }));
vi.mock('./kpi/useFleetKpis', () => ({ useFleetKpis: () => ({ data: state.kpis, isError: false }) }));
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [] } }),
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [] } }),
  useFleetSummary: () => ({ data: { loops: { total: 1, monitored: 1 } } }),
  useFleetHeatmap: () => ({
    data: { loops: [{ loopId: 'FIC10301', displayName: 'Feed flow', loopType: 'flow', windowEnd: state.heatmapEnd, diagnosis: 'NO_CALL', confidence: 0.4, gates: { G0: 'PASS' } }], gateKeys: ['G0'], total: 1 },
    isLoading: false, isError: false,
  }),
  useFleetRankings: () => ({ data: undefined }),
  useCpmLoop: () => ({ data: undefined }),
  useGateCatalogue: () => ({ data: undefined }),
}));
beforeAll(() => setActiveZone('UTC'));
afterEach(cleanup);

import CpmPerformance from './CpmPerformance';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const H = 3_600_000;
const kpis = (newestResultAt?: string | null) => ({ basis: { freshSeconds: 3600, windowKind: '12h' }, ...(newestResultAt !== undefined ? { newestResultAt } : {}) });
const page = () => render(<MemoryRouter initialEntries={['/cpm/performance']}><CpmPerformance /></MemoryRouter>);
const line = () => screen.queryByRole('status');

describe('Performance stale line (CHG-170)', () => {
  it('reads the fleet KPI newest result, whatever the heatmap shows', () => {
    state.kpis = kpis(ago(96.3 * H));
    state.heatmapEnd = ago(0.5 * H);
    page();
    expect(line()?.textContent).toMatch(/^Stale · Newest fused window emitted 96\.3 h ago \(/);
    expect(screen.getByRole('button', { name: 'Pipeline Health ↗' })).toBeTruthy();
  });

  it('calls a result older than 60 min stale (the Overview rule, no longer 3 h)', () => {
    state.kpis = kpis(ago(1.5 * H));
    state.heatmapEnd = ago(1.5 * H);
    page();
    expect(line()?.textContent).toMatch(/emitted 1\.5 h ago/);
  });

  it('shows no line while the newest result is fresh, even when the heatmap is old', () => {
    state.kpis = kpis(ago(0.5 * H));
    state.heatmapEnd = ago(5 * H);
    page();
    expect(line()).toBeNull();
  });

  it('keeps the heatmap 3 h read on a cplm-api without the field', () => {
    state.kpis = kpis(undefined);
    state.heatmapEnd = ago(2 * H);
    page();
    expect(line()).toBeNull();
    cleanup();
    state.heatmapEnd = ago(5 * H);
    page();
    expect(line()?.textContent).toMatch(/emitted 5\.0 h ago/);
  });
});
