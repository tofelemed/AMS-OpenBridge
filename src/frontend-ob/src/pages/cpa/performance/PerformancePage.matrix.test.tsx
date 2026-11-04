import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ApiError } from '../../../api/apiFetch';
import { GATE_LEGEND, gateMark } from '../../../components/Cpm/gateStatus';
import { useAuthStore } from '../../../store/authStore';
import { CATALOGUE, GATE_KEYS, LOOPS, SUMMARY, PERFORMANCE, heatRow, matrixOf, ranked, renderAt, whereNow } from './performanceFixtures';
import PerformancePage from './PerformancePage';

const hooks = vi.hoisted(() => ({
  heatmap: {} as Record<string, unknown>,
  gates: {} as Record<string, unknown>,
  config: vi.fn(),
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
  useFleetSummary: () => ({ data: SUMMARY, isError: false, refetch: vi.fn() }),
  useFleetHeatmap: () => hooks.heatmap,
  useFleetRankings: () => ({ data: { loops: [ranked('FIC101')] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useLatestGates: () => hooks.gates,
  useGateCatalogue: () => ({ data: CATALOGUE }),
  useCpmCalculations: () => ({ data: { gates: [{ key: 'G7', question: 'Is the waveform triangular?', observedInResults: false }] } }),
}));
vi.mock('../../../components/Cpm/kpi/useFleetKpis', () => ({ useFleetKpis: () => ({ data: { performance: PERFORMANCE }, isError: false, refetch: vi.fn() }) }));
vi.mock('../../../components/Cpm/evidence/useEvidence', () => ({ useEvidenceManifest: () => ({ data: undefined, isLoading: false }) }));
vi.mock('../../../api/cpm/fleetKpis', () => ({ getFleetKpiTrend: () => Promise.resolve({ plantDay: { zone: 'Asia/Dubai' } }) }));
vi.mock('../../../api/cpm/config', () => ({ getEffectiveConfig: hooks.config }));

const ok = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const heatmapOf = (loops = LOOPS) => ok({ site: null, windowKind: '12h', gateKeys: GATE_KEYS, count: loops.length, total: loops.length, truncated: false, loops });
const permissions = (...held: string[]) => useAuthStore.setState({ hasPermission: (p: string) => held.includes(p) } as never);

const open = (url: string) => renderAt(url, <PerformancePage />);
const where = () => whereNow(screen.getByTestId('where'));
const MATRIX = '/cpm/performance?view=matrix&rows=all';
const cell = (name: RegExp) => screen.getByRole('button', { name });
const inspector = () => screen.getByRole('complementary');

beforeEach(() => {
  hooks.heatmap = heatmapOf();
  hooks.gates = ok(matrixOf());
  hooks.config.mockReset();
  hooks.config.mockResolvedValue({ profileId: 'FLOW_FAST', bundle: { version: 3 }, properties: { 'G7.min_accepted_cycles': 5 } });
  permissions('analytics.view');
});

afterEach(cleanup);

describe('full gate matrix', () => {
  it('groups the gates under the five tiers', () => {
    open(MATRIX);
    for (const tier of ['Eligibility', 'Performance', 'Diagnostic evidence', 'Confirmation', 'Fusion']) {
      expect(screen.getByRole('columnheader', { name: tier }).getAttribute('scope')).toBe('colgroup');
    }
    expect(screen.getByRole('columnheader', { name: 'Eligibility' }).getAttribute('colspan')).toBe('4');
  });

  it('heads each column with the gate name first and its code below (CD18)', () => {
    open(MATRIX);
    const head = screen.getByRole('columnheader', { name: 'Data quality G0' }).textContent ?? '';
    expect(head.indexOf('Data quality')).toBeLessThan(head.indexOf('G0'));
  });

  it('labels every cell with loop, gate and state', () => {
    open(MATRIX);
    expect(cell(/^FIC101, Data quality · G0: /).querySelector('.ui-sr')?.textContent).toBe(`FIC101, Data quality · G0: ${gateMark('FAIL', 'G0').label}`);
    expect(cell(/^LIC202, Base performance · G3: /).querySelector('.ui-sr')?.textContent).toBe(`LIC202, Base performance · G3: ${gateMark('WARN', 'G3').label}`);
  });

  it.each([
    ['G0', 'FAIL'], ['G3', 'FAIL'], ['G3', 'PASS'], ['G3', 'WARN'], ['G4', 'STRONG'], ['G7', 'PASS'], ['G7', 'WARN'],
    ['G1', 'EXCLUDED_MODE'], ['G15', 'SUSPECTED'], ['G15', 'CONFIRMED'], ['G3', 'DISABLED'], ['G3', 'NOT_EVALUATED'], ['G3', 'NOT_APPLICABLE'],
  ])('%s %s shows the vocabulary mark and word, unchanged', (gate, status) => {
    hooks.heatmap = heatmapOf([heatRow('FIC101', { gates: { [gate]: status } })]);
    open(MATRIX);
    const mark = gateMark(status, gate);
    const text = cell(new RegExp(`^FIC101, .* ${gate}: `)).textContent ?? '';
    expect(text).toContain(mark.glyph);
    expect(text).toContain(mark.word);
  });

  it('a pass on a diagnostic gate reads Not seen, and never as a check mark', () => {
    open(MATRIX);
    const text = cell(/^LIC202, Stiction shape · G7: /).textContent ?? '';
    expect(text).toContain('Not seen');
    expect(text).not.toContain('✓');
  });

  it('a pass without one of its inputs reads OK on available data', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101', { observabilityFlags: ['NO_VP'], gates: { G14: 'PASS' } })]);
    open(MATRIX);
    expect(cell(/^FIC101, VP confirmation · G14: /).textContent).toContain('OK on available data');
  });

  it('DISABLED reads as its own word', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101', { gates: { G3: 'DISABLED' } })]);
    open(MATRIX);
    const text = cell(/^FIC101, Base performance · G3: /).textContent ?? '';
    expect(text).toContain('n/a');
    expect(text).toContain('Disabled');
  });

  it('D-08: a strong result is a warning, not grey', () => {
    open(MATRIX);
    expect(cell(/^FIC101, Actuator effort · G4: /).querySelector('.ui-badge--warning')).toBeTruthy();
  });

  it('a gate the server did not send reads Not evaluated, not a pass', () => {
    open(MATRIX);
    const text = cell(/^PIC404, Data quality · G0: /).textContent ?? '';
    expect(text).toContain('Not evaluated');
    expect(text).not.toContain('✓');
  });

  it('D-15: the result column names each exclusion by its own cause', () => {
    open(MATRIX);
    const row = screen.getAllByRole('row').find(r => r.textContent?.includes('TIC303')) as HTMLElement;
    expect(row.textContent).toContain('Excluded: sensor fault');
    expect(row.textContent).not.toContain('not in automatic');
  });

  it('names an older verdict as older', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101', { lastVerdict: { windowEnd: null, diagnosis: 'SUSPECTED_OSCILLATION', confidence: 0.8, ageMs: 3 * 3_600_000 } })]);
    open(MATRIX);
    expect(screen.getByText(/last verdict Oscillation suspected · evidence score 80 · 3 h ago/)).toBeTruthy();
  });

  it('links the loop to its page with the context', () => {
    open('/cpm/performance?view=matrix&rows=all&site=hdpe&range=7d&window=24h');
    const href = screen.getByRole('link', { name: /^Open FIC101/ }).getAttribute('href') ?? '';
    expect(href.startsWith('/cpm/loop?')).toBe(true);
    for (const part of ['site=hdpe', 'range=7d', 'window=24h', 'loop=FIC101', 'tab=performance']) expect(href).toContain(part);
  });
});

describe('keyboard', () => {
  it('reaches every cell from one tab stop', () => {
    const { container } = open(MATRIX);
    expect(container.querySelectorAll('tbody [tabindex="0"]')).toHaveLength(1);
    const loop = screen.getByRole('link', { name: /^Open LIC202/ });
    loop.focus();
    fireEvent.keyDown(loop, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^LIC202, Data quality · G0: /));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(cell(/^LIC202, Diagnosis band · G15: /));
    expect(container.querySelectorAll('tbody [tabindex="0"]')).toHaveLength(1);
  });

  it('moves between rows along a gate', () => {
    open(MATRIX);
    const start = cell(/^LIC202, Base performance · G3: /);
    start.focus();
    fireEvent.keyDown(start, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(/^FIC101, Base performance · G3: /));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^TIC303, Base performance · G3: /));
  });

  it('is a grid with row headers', () => {
    open(MATRIX);
    const grid = screen.getByRole('grid', { name: 'Gate results by loop' });
    expect(within(grid).getAllByRole('rowheader')).toHaveLength(LOOPS.length);
  });

  it('selects a cell, in the URL, and shows it by more than colour', () => {
    open(MATRIX);
    fireEvent.click(cell(/^LIC202, Base performance · G3: /));
    expect(where().searchParams.get('loop')).toBe('LIC202');
    expect(where().searchParams.get('gate')).toBe('G3');
    const selected = cell(/^LIC202, Base performance · G3: /);
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.getAttribute('data-selected')).toBe('true');
    expect((selected.closest('tr') as HTMLElement).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { level: 2, name: 'Base performance · G3' })).toBeTruthy();
  });

  it('keeps one tab stop in the checks view, where rows differ in length', () => {
    const { container } = open('/cpm/performance?rows=all');
    expect(container.querySelectorAll('tbody [tabindex="0"]')).toHaveLength(1);
    const first = screen.getByRole('link', { name: /^Open FIC101/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^FIC101, Data quality · G0: /));
  });
});

describe('checks view', () => {
  it('lists only the gates that move the result, plus the decision', () => {
    open('/cpm/performance?rows=all');
    const row = cell(/^FIC101, Data quality · G0: /).closest('tr') as HTMLElement;
    const named = within(row).getAllByRole('button').map(b => b.textContent);
    expect(named.some(n => n?.includes('· G3:'))).toBe(false);
    expect(named.some(n => n?.includes('· G4:'))).toBe(true);
    expect(named.some(n => n?.includes('· G15:'))).toBe(true);
  });

  it('writes the gate name first: "Data quality · G0"', () => {
    open('/cpm/performance?rows=all');
    expect(cell(/^FIC101, Data quality · G0: /).textContent).toContain('Data quality · G0');
  });

  it('says so when nothing but the decision moved the result', () => {
    hooks.heatmap = heatmapOf([heatRow('FIC101')]);
    open('/cpm/performance?rows=all');
    expect(screen.getByText('No other check moved this result')).toBeTruthy();
  });

  it('shows the same rows as the matrix', () => {
    open('/cpm/performance?rows=attention');
    const checks = screen.getAllByRole('link').filter(l => /^Open /.test(l.textContent ?? '')).map(l => l.textContent);
    fireEvent.click(screen.getByRole('button', { name: 'Full gate matrix' }));
    const matrix = screen.getAllByRole('link').filter(l => /^Open /.test(l.textContent ?? '')).map(l => l.textContent);
    expect(matrix).toEqual(checks);
  });
});

describe('inspector, nothing selected', () => {
  it('shows How to read this view and what the fleet cannot decide, with no primary action', () => {
    open('/cpm/performance');
    const panel = inspector();
    expect(within(panel).getByRole('heading', { level: 2, name: 'How to read this view' })).toBeTruthy();
    expect(panel.textContent).toContain('30 loop(s) have no VP signal');
    expect(panel.textContent).toContain('12 have no peer links');
    expect(panel.textContent).not.toMatch(/click|fused/i);
    expect(within(panel).queryByRole('button', { name: 'Open evidence' })).toBeNull();
  });
});

describe('inspector, cell selected', () => {
  const G0 = '/cpm/performance?loop=FIC101&gate=G0&rows=all&site=hdpe&range=7d&window=24h';

  it('opens from a deep link with gate and loop', () => {
    open(G0);
    const panel = inspector();
    expect(within(panel).getByRole('heading', { level: 2, name: 'Data quality · G0' })).toBeTruthy();
    expect(panel.textContent).toContain('FIC101');
    expect(panel.textContent).toContain('FIC101 service');
  });

  it('a link with a loop and no gate opens on the decision', () => {
    open('/cpm/performance?loop=FIC101&rows=all');
    expect(within(inspector()).getByRole('heading', { level: 2, name: 'Diagnosis band · G15' })).toBeTruthy();
  });

  it('shows the result, its reason and the window in the site zone', () => {
    open(G0);
    const panel = inspector();
    const mark = gateMark('FAIL', 'G0');
    expect(panel.textContent).toContain(mark.glyph);
    expect(panel.textContent).toContain(mark.word);
    expect(panel.textContent).toContain('too few qualified samples in the window');
    expect(panel.textContent).toMatch(/4 Nov 2026, 13:15 (GST|GMT\+4)/);
    expect(panel.textContent).toContain('4320');
    expect(panel.textContent).toContain('Blocking');
  });

  it('a sample count of 0 stays 0, and a missing one is a dash', () => {
    hooks.gates = ok(matrixOf({ sampleCount: 0 }));
    const { unmount } = open(G0);
    expect(within(inspector()).getByText('Samples').parentElement?.textContent).toContain('0');
    unmount();
    hooks.gates = ok(matrixOf({ sampleCount: null }));
    open(G0);
    expect(within(inspector()).getByText('Samples').parentElement?.textContent).toContain('—');
  });

  it('states the effect on the verdict from the served role', () => {
    open(G0);
    expect(inspector().textContent).toContain('A failure here excludes the whole window before any diagnosis is attempted.');
  });

  it('says what the gate asks, and when no stored result has carried it', () => {
    open('/cpm/performance?loop=FIC101&gate=G7&rows=all');
    expect(inspector().textContent).toContain('Is the waveform triangular?');
    expect(inspector().textContent).toContain('Not yet observed');
  });

  it('D-15: an excluded gate names its cause', () => {
    hooks.gates = ok(matrixOf({ gates: [{ key: 'G1', name: 'Mode', tier: 'short', status: 'EXCLUDED_INSTRUMENT_HEALTH', reason: null }] }));
    open('/cpm/performance?loop=FIC101&gate=G1&rows=all');
    expect(inspector().textContent).toContain('Excluded: instrument fault');
  });

  it('Open evidence carries loop, gate, window and the run of this cell', () => {
    open(G0);
    fireEvent.click(screen.getByRole('button', { name: 'Open evidence' }));
    const to = where();
    expect(to.pathname).toBe('/cpm/evidence');
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      tab: 'gates', loop: 'FIC101', gate: 'G0', window: '24h', kind: '24h', methodRun: 'run-g0', mode: 'FIXED', site: 'hdpe', range: '7d',
    });
  });

  it('with no stored run, says Evidence opens another window, and still goes there', () => {
    open('/cpm/performance?loop=FIC101&gate=G7&rows=all');
    expect(inspector().textContent).toContain('This result has no stored run.');
    fireEvent.click(screen.getByRole('button', { name: 'Open evidence' }));
    expect(where().searchParams.get('methodRun')).toBeNull();
    expect(where().searchParams.get('gate')).toBe('G7');
  });

  it('a window not yet evaluated is an answer, not an error', () => {
    hooks.gates = { ...ok(undefined), isError: true, error: new ApiError(404, 'not found') };
    open(G0);
    expect(screen.getByText('No evaluated window')).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Open evidence' }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    expect(inspector().textContent).toContain('No 24h window has been evaluated for this loop yet');
  });

  it('a failed read gives its reason and a retry, and never reads Not evaluated', () => {
    const failed = { ...ok(undefined), isError: true, error: new Error('Service down') };
    hooks.gates = failed;
    open(G0);
    const panel = inspector();
    expect(panel.textContent).toContain('Service down');
    expect(panel.textContent).not.toContain('Not evaluated');
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it('loading shows the cell it already has rather than an empty panel', () => {
    hooks.gates = { ...ok(undefined), isLoading: true };
    open(G0);
    expect(inspector().textContent).toContain(gateMark('FAIL', 'G0').word);
  });

  it('collapses run ids and versions into Technical details', () => {
    open(G0);
    const panel = inspector();
    const details = within(panel).getByText('Technical details').closest('details') as HTMLElement;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.textContent).toContain('run-g0');
    expect(panel.textContent?.replace(details.textContent ?? '', '')).not.toContain('run-g0');
  });

  it('walks the gates in tier order, and stops at the ends', () => {
    open('/cpm/performance?loop=FIC101&gate=G0&rows=all');
    const previous = screen.getByRole('button', { name: 'Previous gate: none' });
    fireEvent.click(previous);
    expect(where().searchParams.get('gate')).toBe('G0');
    fireEvent.click(screen.getByRole('button', { name: /^Next gate, Mode \/ service · G1/ }));
    expect(where().searchParams.get('gate')).toBe('G1');
  });

  it('links on to the loop and the other Evidence tabs with the context', () => {
    open(G0);
    const href = (name: string) => within(inspector()).getByRole('link', { name }).getAttribute('href') ?? '';
    expect(href('Open loop')).toContain('/cpm/loop?');
    expect(href('Open loop')).toContain('loop=FIC101');
    expect(href('Replay')).toContain('tab=replay');
    expect(href('Replay')).toContain('window=2026-11-04T09');
    expect(href('Windows')).toContain('profile=24h');
    expect(href('Windows')).not.toContain('window=24h');
    expect(href('Calculations')).toContain('gate=G0');
    for (const name of ['Open loop', 'Replay', 'Windows', 'Calculations']) expect(href(name)).toContain('site=hdpe');
  });

  it('clears with the button, returns focus to the grid, and shows the guide', () => {
    open('/cpm/performance?loop=FIC101&gate=G0&rows=all');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(where().searchParams.get('loop')).toBeNull();
    expect(where().searchParams.get('gate')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'How to read this view' })).toBeTruthy();
    expect((document.activeElement as HTMLElement).closest('tbody')).toBeTruthy();
  });

  it('clears with Esc from the inspector', () => {
    open('/cpm/performance?loop=FIC101&gate=G0&rows=all');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear selection' }), { key: 'Escape' });
    expect(where().searchParams.get('gate')).toBeNull();
  });

  it('says when the filters hide the selected loop, and offers all rows', () => {
    open('/cpm/performance?loop=FIC101&gate=G0&rows=notEvaluated');
    expect(inspector().textContent).toContain('This loop is not in the rows shown.');
    fireEvent.click(screen.getByRole('button', { name: 'Show all rows' }));
    expect(where().searchParams.get('rows')).toBe('all');
    expect(where().searchParams.get('loop')).toBe('FIC101');
  });
});

describe('deciding values against their thresholds', () => {
  const G7 = '/cpm/performance?loop=FIC101&gate=G7&rows=all';
  const flagless = matrixOf({ observabilityFlags: [] });

  it('D-20: without cpm.config.read, thresholds are restricted, not missing, and are not requested', () => {
    hooks.gates = ok(flagless);
    open(G7);
    expect(inspector().textContent).toContain('Thresholds not visible to your role');
    expect(inspector().textContent).not.toMatch(/no threshold configured/i);
    expect(hooks.config).not.toHaveBeenCalled();
  });

  it('with the permission, shows the value against the threshold that applied, and whether it was met', async () => {
    permissions('analytics.view', 'cpm.config.read');
    hooks.gates = ok(flagless);
    open(G7);
    expect(await within(inspector()).findByText('≥ 5 required')).toBeTruthy();
    expect(hooks.config).toHaveBeenCalledWith('FIC101', '2026-11-04T09:15:00Z', expect.anything());
    expect(inspector().textContent).toContain('Not met');
  });

  it('a configuration that failed is not called unconfigured', async () => {
    permissions('analytics.view', 'cpm.config.read');
    hooks.gates = ok(flagless);
    hooks.config.mockRejectedValue(new Error('down'));
    open(G7);
    expect(await within(inspector()).findByText('Thresholds could not be read')).toBeTruthy();
    expect(inspector().textContent).not.toMatch(/no threshold configured/i);
  });

  it('never flashes "no threshold configured" while the configuration loads', () => {
    permissions('analytics.view', 'cpm.config.read');
    hooks.config.mockReturnValue(new Promise(() => undefined));
    hooks.gates = ok(flagless);
    open(G7);
    expect(inspector().textContent).not.toMatch(/no threshold configured/i);
  });

  it('a gate with no measured value says so', () => {
    open('/cpm/performance?loop=FIC101&gate=G0&rows=all');
    expect(inspector().textContent).toContain('This gate reports a state, not a measured value against a threshold.');
  });
});

describe('below 1280 px', () => {
  const narrow = () => vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('1279.98'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
  }));

  afterEach(() => vi.unstubAllGlobals());

  it('the guide has its own way in, and opens as a named drawer', () => {
    narrow();
    open('/cpm/performance');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How to read this view' }));
    expect(screen.getByRole('dialog', { name: 'How to read this view' })).toBeTruthy();
  });

  it('a selected cell opens the drawer with the one primary action', () => {
    narrow();
    open('/cpm/performance?loop=FIC101&gate=G0&rows=all');
    const drawer = screen.getByRole('dialog', { name: 'Data quality · G0' });
    expect(within(drawer).getByRole('button', { name: 'Open evidence' })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close inspector' }));
    expect(where().searchParams.get('gate')).toBeNull();
  });

  it('wide screens need no separate way in', () => {
    open('/cpm/performance');
    expect(screen.queryByRole('button', { name: 'How to read this view' })).toBeNull();
  });
});

describe('legend', () => {
  it('reads every mark from the vocabulary', () => {
    open(MATRIX);
    const key = screen.getByRole('note', { name: 'Gate symbols' }).textContent ?? '';
    for (const item of GATE_LEGEND) expect(key).toContain(item.text);
  });
});
