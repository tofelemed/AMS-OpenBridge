// @vitest-environment jsdom
// Task 19: Window Inspector. The list and the selected window side by side; the newest window selected by default,
// an exact ?window= kept; counts in words; no raw read on a row click; Pipeline Health only for system.manage.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmKpiRow } from '../../api/cpmApi';

const { kpis, perms, rawSpy } = vi.hoisted(() => ({
  kpis: { rows: [] as unknown[], hasNext: false },
  perms: { manage: false },
  rawSpy: vi.fn(),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('./context/LoopBand', () => ({
  LoopBand: (p: { children?: React.ReactNode }) => React.createElement('div', null, p.children),
}));
vi.mock('../../store/authStore', () => ({
  useAuthStore: (f: (s: { hasPermission: (k: string) => boolean }) => boolean) => f({ hasPermission: k => k === 'system.manage' && perms.manage }),
}));
vi.mock('../../hooks/useCpm', () => {
  const spec = (kind: string, sizeMs: number, slideMs: number | null) => ({
    kind, tier: 'short', assigner: slideMs ? 'sliding' : 'tumbling', sizeMs, slideMs, allowedLatenessMs: 60_000,
    cadenceMs: null, minSamples: 10, feeds: '', overlapping: !!slideMs,
  });
  return {
    useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC10401', timezone: 'UTC', tags: {} }] } }),
    useCpmResolutions: () => ({ data: { windows: [spec('15m', 900_000, 300_000), spec('1m', 60_000, null)], shortWindows: [], longWindows: [] } }),
    usePipelineMetrics: () => ({ data: undefined }),
    useCpmKpisPaged: () => ({
      data: { pages: [{ samples: kpis.rows }] }, isLoading: false, isError: false, hasNextPage: kpis.hasNext,
      isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
    }),
    useCpmKpisByResolution: () => ({ data: { byResolution: {} }, isLoading: false }),
    useRawWindow: (...a: unknown[]) => rawSpy(...a),
  };
});

import { CpmWindows } from './CpmWindows';

const row = (end: string, o: Record<string, unknown> = {}) => ({
  window_start: new Date(Date.parse(end) - 900_000).toISOString(), window_end: end, created_at: end,
  sample_count: 180, expected_sample_count: 180, sufficient_data: true,
  gate0_status: 'PASS', gate1_status: 'PASS', gate2_status: 'PASS', gate2r_status: 'PASS', gate3_status: 'PASS', gate4_status: 'PASS',
  method_run_ids: '{"G15":"run-x"}', ...o,
}) as unknown as CpmKpiRow;

const NEWEST = '2026-11-04T13:50:00Z';
const MID = '2026-11-04T13:35:00Z';
const OLD = '2026-11-03T23:50:00Z';

const Where: React.FC = () => <output data-testid="where">{decodeURIComponent(useLocation().search)}</output>;
const mount = (search = '?loop=FIC10401&profile=15m') => render(
  <MemoryRouter initialEntries={[`/cpm/windows${search}`]}><CpmWindows /><Where /></MemoryRouter>);
const panel = () => within(screen.getByRole('complementary'));
const url = () => screen.getByTestId('where').textContent ?? '';

beforeEach(() => {
  perms.manage = false;
  kpis.hasNext = false;
  kpis.rows = [row(NEWEST, { sample_count: 181 }), row(MID), row(OLD, { sample_count: 4, sufficient_data: false })];
});
afterEach(() => { cleanup(); rawSpy.mockReset(); });

describe('Window Inspector', () => {
  it('selects the newest row by default', () => {
    mount();
    expect(panel().getByText('Received').nextSibling?.textContent).toBe('181');
  });

  it('keeps an exact ?window=', () => {
    mount(`?loop=FIC10401&profile=15m&window=${encodeURIComponent(OLD)}`);
    expect(panel().getByText('Received').nextSibling?.textContent).toBe('4');
  });

  it('lists the window, samples over nominal and the count check; declined stays in the count check', () => {
    mount();
    expect(screen.getByText('13:35 → 13:50')).toBeTruthy();
    expect(screen.getByText('181 / 180')).toBeTruthy();
    expect(screen.getAllByText('+1 sample').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Matches').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Declined').length).toBeGreaterThan(0);
  });

  it('says the date once per day, in a section head', () => {
    mount();
    expect(screen.getAllByText('4 Nov')).toHaveLength(1);
    expect(screen.getAllByText('3 Nov')).toHaveLength(1);
  });

  it('never says full, unknown, emitted, from, or Latest results', () => {
    mount();
    const text = document.body.textContent ?? '';
    for (const bad of ['% full', 'UNKNOWN', 'emitted', 'Latest results', 'All 15m windows', 'What the selected window carried', 'DG-4']) {
      expect(text).not.toContain(bad);
    }
    expect(text).not.toMatch(/\bfrom \d/);
  });

  it('selects a row on click, writes it into the URL, and reads no raw data', () => {
    mount();
    fireEvent.click(screen.getByText('13:20 → 13:35'));
    expect(url()).toContain(`window=${MID}`);
    expect(panel().getByText('Received').nextSibling?.textContent).toBe('180');
    expect(rawSpy).not.toHaveBeenCalled();
  });

  it('counts matching over loaded and filters by count check', () => {
    mount();
    expect(screen.getByText('3 matching / 3 loaded')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sample count'), { target: { value: 'declined' } });
    expect(screen.getByText('1 matching / 3 loaded')).toBeTruthy();
  });

  it('walks the windows with Previous and Next', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(url()).toContain(`window=${MID}`);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(url()).toContain(`window=${NEWEST}`);
  });

  it('offers Pipeline Health only to system.manage', () => {
    mount();
    expect(screen.queryByRole('button', { name: 'Pipeline Health ↗' })).toBeNull();
    cleanup();
    perms.manage = true;
    mount();
    expect(screen.getByRole('button', { name: 'Pipeline Health ↗' })).toBeTruthy();
  });

  it('keeps the profile select and compare across kinds', () => {
    mount();
    const select = screen.getByLabelText('Window profile') as HTMLSelectElement;
    expect(within(select).getByText('15 min · 5 min slide')).toBeTruthy();
    expect(screen.getByText('Same loop, every short granularity')).toBeTruthy();
  });

  it('asks for a loop first', () => {
    mount('');
    expect(screen.getByText('Select a loop')).toBeTruthy();
  });
});
