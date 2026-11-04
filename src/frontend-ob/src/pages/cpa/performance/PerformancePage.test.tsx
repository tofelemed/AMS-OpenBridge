import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '../../../store/authStore';
import { LOOPS, PERFORMANCE, SUMMARY, GATE_KEYS, heatRow, ranked, renderAt, whereNow } from './performanceFixtures';
import PerformancePage from './PerformancePage';

const hooks = vi.hoisted(() => ({
  heatmap: {} as Record<string, unknown>,
  rankings: (() => ({})) as (order: string) => Record<string, unknown>,
  orders: [] as string[],
  summary: {} as Record<string, unknown>,
  kpis: {} as Record<string, unknown>,
  gates: {} as Record<string, unknown>,
}));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', async () => {
  const { createElement } = await import('react');
  return {
    ObcButton: (p: { children?: unknown; disabled?: boolean; onClick?: () => void }) =>
      createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children as never),
  };
});

vi.mock('../../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'FIC101', site: 'hdpe', area: '', unit: '', timezone: 'Asia/Dubai' }] } }),
  useCpmLoop: () => ({ data: undefined }),
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [] } }),
  useFleetSummary: () => hooks.summary,
  useFleetHeatmap: () => hooks.heatmap,
  useFleetRankings: (_scope: unknown, _kind: string, order: string) => { hooks.orders.push(order); return hooks.rankings(order); },
  useLatestGates: () => hooks.gates,
  useGateCatalogue: () => ({ data: undefined }),
  useCpmCalculations: () => ({ data: undefined }),
}));
vi.mock('../../../components/Cpm/kpi/useFleetKpis', () => ({ useFleetKpis: () => hooks.kpis }));
vi.mock('../../../components/Cpm/evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: undefined, isLoading: false }) }));
vi.mock('../../../api/cpm/fleetKpis', () => ({ getFleetKpiTrend: () => Promise.resolve({ plantDay: { zone: 'Asia/Dubai' } }) }));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const heatmapOf = (loops = LOOPS, total = loops.length) => ok({ site: null, windowKind: '12h', gateKeys: GATE_KEYS, count: loops.length, total, truncated: false, loops });

const permissions = (...held: string[]) => useAuthStore.setState({ hasPermission: (p: string) => held.includes(p) } as never);

const open = (url = '/cpm/performance') => renderAt(url, <PerformancePage />);
const where = () => whereNow(screen.getByTestId('where'));
const rowOf = (tag: string) => screen.getAllByRole('row').find(r => r.textContent?.includes(tag)) as HTMLElement;
const button = (name: RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  hooks.heatmap = heatmapOf();
  hooks.rankings = () => ok({ loops: [ranked('LIC202'), ranked('FIC101')] });
  hooks.orders = [];
  hooks.summary = ok(SUMMARY);
  hooks.kpis = ok({ performance: PERFORMANCE });
  hooks.gates = ok(undefined);
  permissions('analytics.view');
});

afterEach(cleanup);

describe('title block', () => {
  it('names the page and states the newest window without the word fused', () => {
    const { container } = open();
    expect(screen.getByRole('heading', { level: 1, name: 'Performance' })).toBeTruthy();
    expect(screen.getByText(/Newest evaluated window ending 4 Nov 2026, 13:15/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/fused/i);
  });

  it('never shows the browser zone: the time is in the site zone', () => {
    open();
    expect(screen.getByText(/13:15 (GST|GMT\+4)/)).toBeTruthy();
  });

  it('switches the window kind in the URL', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '24h' }));
    expect(where().searchParams.get('window')).toBe('24h');
  });

  it('calls out a stale window, keeps the values, and offers Pipeline to those allowed', () => {
    permissions('analytics.view', 'system.manage');
    open();
    const notice = screen.getByTestId('state-stale');
    expect(notice.textContent).toMatch(/The newest evaluated window is .+ old/);
    expect(notice.textContent).not.toMatch(/fused/i);
    expect(within(notice).getByRole('link', { name: 'Pipeline health' }).getAttribute('href')).toContain('/cpm/system');
    expect(rowOf('LIC202')).toBeTruthy();
  });

  it('gives no Pipeline link to a role that cannot open it', () => {
    open();
    expect(within(screen.getByTestId('state-stale')).queryByRole('link')).toBeNull();
  });

  it('does not call a fresh window stale', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101', { windowEnd: new Date().toISOString() })]);
    open();
    expect(screen.queryByTestId('state-stale')).toBeNull();
  });

  it('says so when no window has been evaluated', () => {
    hooks.heatmap = heatmapOf([heatRow('PIC404', { windowEnd: null })]);
    open();
    expect(screen.getByText('No evaluated window')).toBeTruthy();
  });
});

describe('summary strip', () => {
  const figure = (label: string) => screen.getByText(label).closest('.ui-metric') as HTMLElement;

  it('shows the four figures from the server', () => {
    open();
    expect(figure('Good-error time').textContent).toContain('74.5');
    expect(figure('Median error').textContent).toContain('2.3');
    expect(figure('Loops with periodic diagnosis').textContent).toContain('1 of 3');
    expect(figure('Diagnostic capability').textContent).toContain('3 of 35 loops');
  });

  it('keeps the mean, which the old tile showed, beside the median', () => {
    open();
    expect(figure('Good-error time').textContent).toContain('Mean 71.3 %');
  });

  it('gives each figure its definition and a way to the loops behind it', () => {
    open();
    for (const label of ['Good-error time', 'Median error', 'Loops with periodic diagnosis']) {
      expect(within(figure(label)).getByRole('button', { name: `About ${label}` })).toBeTruthy();
      expect(within(figure(label)).getByRole('link', { name: 'Assessed loops' }).getAttribute('href')).toContain('review=assessed');
    }
    expect(within(figure('Diagnostic capability')).getByRole('link').getAttribute('href')).toContain('tab=loops');
  });

  it('fills the coverage reason into the capability definition', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'About Diagnostic capability' }));
    expect((await screen.findByRole('group', { name: 'About Diagnostic capability' })).textContent).toContain('30 valve loop(s) with VP expected but not mapped');
  });

  it('reads a missing value as Unavailable with its reason, never as 0', () => {
    hooks.kpis = ok({ performance: { ...PERFORMANCE, goodError: { ...PERFORMANCE.goodError, medianPct: null, counted: 0 } } });
    open();
    expect(figure('Good-error time').textContent).toContain('Unavailable');
    expect(figure('Good-error time').textContent).toContain('Not measured');
    expect(figure('Good-error time').textContent).not.toMatch(/\b0(\.0)?\s*%/);
  });

  it('keeps a real 0', () => {
    hooks.kpis = ok({ performance: { ...PERFORMANCE, periodic: { count: 0, of: 3 } } });
    open();
    expect(figure('Loops with periodic diagnosis').textContent).toContain('0 of 3');
  });

  it('D-39: an empty denominator reads "No loops in scope", not 0 of 0', () => {
    hooks.kpis = ok({ performance: { ...PERFORMANCE, monitored: 0, assessed: 0, periodic: { count: 0, of: 0 } } });
    hooks.summary = ok({ ...SUMMARY, loops: { ...SUMMARY.loops, total: 0 }, capability: { loopsCappedByMissingVp: 0, loopsWithoutDisturbanceContext: 0 } });
    open();
    expect(figure('Loops with periodic diagnosis').textContent).toContain('No loops in scope');
    expect(figure('Diagnostic capability').textContent).toContain('No loops in scope');
    expect(figure('Diagnostic capability').textContent).not.toContain('0 of 0');
  });

  it('partial: the figures fail on their own, with a retry, and the table stands', () => {
    const kpis = { ...ok(undefined), isError: true, error: new Error('down') };
    hooks.kpis = kpis;
    open();
    expect(figure('Good-error time').textContent).toContain('Could not be read');
    fireEvent.click(within(figure('Good-error time')).getByRole('button', { name: 'Retry' }));
    expect(kpis.refetch).toHaveBeenCalled();
    expect(rowOf('LIC202')).toBeTruthy();
  });

  it('says the figures ignore a health filter', () => {
    open('/cpm/performance?health=stale-collection');
    expect(figure('Good-error time').textContent).toContain('health filter not applied');
  });
});

describe('gate roll-up', () => {
  const rollup = () => screen.getByRole('toolbar', { name: 'Loops held back, by gate' });

  it('groups the columns by tier, with the name before the code', () => {
    open();
    for (const tier of ['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']) {
      expect(within(rollup()).getByText(tier)).toBeTruthy();
    }
    const column = button(/^Data quality · G0: 1 held back/);
    expect(column.textContent?.indexOf('Data quality')).toBeLessThan(column.textContent?.indexOf('G0') ?? 0);
  });

  it('selecting a column filters the table, and again clears it', () => {
    open('/cpm/performance?rows=all');
    fireEvent.click(button(/^Base performance · G3/));
    expect(where().searchParams.get('fg')).toBe('G3');
    expect(rowOf('LIC202')).toBeTruthy();
    expect(screen.getAllByRole('row').some(r => r.textContent?.includes('FIC101'))).toBe(false);
    fireEvent.click(button(/^Base performance · G3/));
    expect(where().searchParams.get('fg')).toBeNull();
  });

  it('shows the active column by more than colour', () => {
    open('/cpm/performance?fg=G3');
    const column = button(/^Base performance · G3/);
    expect(column.getAttribute('aria-pressed')).toBe('true');
    expect(column.textContent).toContain('Filtering the table');
  });

  it('a column holding no loop back cannot filter and says why', () => {
    open();
    const column = button(/^Setpoint activity · G2: no loops held back/);
    fireEvent.click(column);
    expect(where().searchParams.get('fg')).toBeNull();
  });

  it('is one tab stop, moved with the arrows', () => {
    open();
    const first = button(/^Data quality · G0/);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(button(/^Mode \/ service · G1/));
    expect(within(rollup()).getAllByRole('button').filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('says so when no gate holds a loop back', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101')]);
    open();
    expect(screen.getByText('No gate is holding back any loop in scope for this window.')).toBeTruthy();
  });
});

describe('filters', () => {
  it('filters rows, with counts, and defaults to Needs attention', () => {
    open();
    expect(button(/^Needs attention 3/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('row').some(r => r.textContent?.includes('PIC404'))).toBe(false);
    fireEvent.click(button(/^All 4/));
    expect(where().searchParams.get('rows')).toBe('all');
    expect(rowOf('PIC404')).toBeTruthy();
    fireEvent.click(button(/^Not evaluated 1/));
    expect(where().searchParams.get('rows')).toBe('notEvaluated');
  });

  it('the three quick filters write `health` and toggle off', () => {
    open();
    for (const [label, value] of [['Missing binding', 'missing-binding'], ['Stale collection', 'stale-collection'], ['Active affected-device condition', 'active-affected']]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(where().searchParams.get('health')).toBe(value);
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Active affected-device condition' }));
    expect(where().searchParams.get('health')).toBeNull();
  });

  it('switches the view, and the link keeps it', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Full gate matrix' }));
    expect(where().searchParams.get('view')).toBe('matrix');
    expect(screen.getByRole('grid', { name: 'Gate results by loop' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Checks behind the result' }));
    expect(where().searchParams.get('view')).toBeNull();
    cleanup();
    open('/cpm/performance?view=matrix');
    expect(screen.getByRole('grid', { name: 'Gate results by loop' })).toBeTruthy();
  });

  it('sorts by the server ranking and writes the choice to the URL', () => {
    hooks.rankings = order => ok({ loops: order === 'error' ? [ranked('FIC101'), ranked('LIC202')] : [ranked('LIC202'), ranked('FIC101')] });
    open();
    const order = () => screen.getAllByRole('link').map(l => l.textContent).filter(t => /^Open (FIC|LIC|TIC)/.test(t ?? ''));
    expect(order()[0]).toContain('LIC202');
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), { target: { value: 'error' } });
    expect(where().searchParams.get('sort')).toBe('error');
    expect(hooks.orders).toContain('error');
    expect(order()[0]).toContain('FIC101');
  });

  it('states the sort basis in its help, without an engine term', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'About Sort order' }));
    const help = await screen.findByRole('group', { name: 'About Sort order' });
    expect(help.textContent).toContain('It is not a priority or a probability');
    expect(help.textContent).toContain('newest verdict of any age');
    expect(help.textContent).not.toMatch(/fused|confidence|good_error|LatestProbe/i);
  });

  it('shows the value each row was ranked on, and "Not ranked" with no rank', () => {
    open('/cpm/performance?rows=all');
    expect(rowOf('LIC202').textContent).toContain('evidence score 80');
    expect(rowOf('TIC303').textContent).toContain('Not ranked');
  });

  it('does not say "Not ranked" while the ranking is still loading', () => {
    hooks.rankings = () => ({ ...ok(undefined), isLoading: true });
    open('/cpm/performance?rows=all');
    expect(rowOf('LIC202').textContent).not.toContain('Not ranked');
  });

  it('keeps the table when the ranking fails, and says so', () => {
    const failed = { ...ok(undefined), isError: true, error: new Error('down') };
    hooks.rankings = () => failed;
    open();
    expect(screen.getByText(/Sort unavailable/)).toBeTruthy();
    expect(rowOf('LIC202')).toBeTruthy();
    fireEvent.click(within(screen.getByText(/Sort unavailable/)).getByRole('button', { name: 'Retry' }));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it('keeps a retained ranking after a failed poll, and does not claim rows are by tag', () => {
    hooks.rankings = () => ({ ...ok({ loops: [ranked('LIC202')] }), isError: true, error: new Error('down') });
    open();
    expect(screen.queryByText(/Sort unavailable/)).toBeNull();
    expect(screen.getAllByRole('link', { name: /^Open / })[0].textContent).toContain('LIC202');
  });

  it('finds a loop by text, without writing to the URL', async () => {
    open('/cpm/performance?rows=all');
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a loop' }), { target: { value: 'tic' } });
    await waitFor(() => expect(screen.getAllByRole('row').some(r => r.textContent?.includes('FIC101'))).toBe(false));
    expect(rowOf('TIC303')).toBeTruthy();
    expect(where().search).not.toContain('tic');
  });

  it('names a truncated matrix', () => {
    hooks.heatmap = heatmapOf(LOOPS, 2400);
    open();
    expect(screen.getByText(/The matrix shows the first 4 of 2400 loops in scope/)).toBeTruthy();
  });

  it('shows the legend from the one gate vocabulary', () => {
    open();
    const key = screen.getByRole('note', { name: 'Gate symbols' });
    expect(key.textContent).toContain('OK on available data');
    expect(key.textContent).toContain('not applicable');
  });
});

describe('pager', () => {
  const many = Array.from({ length: 30 }, (_, i) => heatRow(`L${String(i).padStart(2, '0')}`, { gates: { G0: 'FAIL' } }));

  it('pages the rows and keeps the page in the URL', () => {
    hooks.heatmap = heatmapOf(many);
    hooks.rankings = () => ok({ loops: [] });
    open();
    expect(screen.getByText(/Showing 1–25 of 30/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(where().searchParams.get('page')).toBe('2');
    expect(screen.getByText(/Showing 26–30 of 30/)).toBeTruthy();
    expect(rowOf('L29')).toBeTruthy();
  });

  it('a new filter returns to the first page', () => {
    hooks.heatmap = heatmapOf(many);
    open('/cpm/performance?page=2');
    fireEvent.click(button(/^All 30/));
    expect(where().searchParams.get('page')).toBeNull();
  });

  it('pulls back a page number past the end', () => {
    hooks.heatmap = heatmapOf(many);
    open('/cpm/performance?page=9');
    expect(where().searchParams.get('page')).toBe('2');
  });

  it('a deep link opens the page of its loop, and later selections stay there', () => {
    hooks.heatmap = heatmapOf(many);
    hooks.rankings = () => ok({ loops: [] });
    open('/cpm/performance?loop=L27&gate=G0');
    expect(where().searchParams.get('page')).toBe('2');
    expect(rowOf('L27').getAttribute('aria-current')).toBe('true');
    fireEvent.click(button(/^L28, Data quality/));
    expect(rowOf('L28')).toBeTruthy();
    expect(where().searchParams.get('page')).toBe('2');
  });

  it('waits for the ranking before working out that page', () => {
    hooks.heatmap = heatmapOf(many);
    hooks.rankings = () => ({ ...ok(undefined), isLoading: true });
    open('/cpm/performance?loop=L27&gate=G0');
    expect(where().searchParams.get('page')).toBeNull();
  });
});

describe('data states', () => {
  it('loading keeps the page around a labelled skeleton', () => {
    hooks.heatmap = { ...ok(undefined), isLoading: true };
    open();
    expect(screen.getAllByTestId('state-loading').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1, name: 'Performance' })).toBeTruthy();
    expect(screen.queryByText('No monitored loops')).toBeNull();
  });

  it('an error gives its reason and a retry', () => {
    const failed = { ...ok(undefined), isError: true, error: new Error('Gate results timed out') };
    hooks.heatmap = failed;
    open();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Gate results timed out');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it('a failed poll keeps the rows on screen, says so, and offers a retry', () => {
    const failed = { ...heatmapOf(), isError: true, error: new Error('down') };
    hooks.heatmap = failed;
    open();
    expect(rowOf('LIC202')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    const notice = screen.getByTestId('state-partial');
    expect(notice.textContent).toContain('Showing the last results read.');
    fireEvent.click(within(notice).getByRole('button', { name: 'Retry' }));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it('empty scope names the reason and the way to Setup', () => {
    hooks.heatmap = heatmapOf([]);
    open('/cpm/performance?site=hdpe');
    expect(screen.getByText('No monitored loops')).toBeTruthy();
    const link = screen.getAllByRole('link', { name: 'Loops in Setup' }).pop() as HTMLElement;
    expect(link.getAttribute('href')).toContain('site=hdpe');
  });

  it('a quick filter that empties the fleet is not reported as no monitored loops', () => {
    hooks.heatmap = heatmapOf([]);
    open('/cpm/performance?health=missing-binding');
    expect(screen.queryByText('No monitored loops')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(where().searchParams.get('health')).toBeNull();
  });

  it('no loop needing attention reads as good news, with a reset to all', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101')]);
    open();
    expect(screen.getByText('No loop needs attention')).toBeTruthy();
    expect(screen.getByText('Every evaluated loop passed its gates in this window.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(where().searchParams.get('rows')).toBe('all');
  });

  it('a truncated search says the loop may be beyond the rows loaded', async () => {
    hooks.heatmap = heatmapOf(LOOPS, 2400);
    open('/cpm/performance?rows=all');
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a loop' }), { target: { value: 'nothing' } });
    expect(await screen.findByText(/may be beyond them/)).toBeTruthy();
  });
});
