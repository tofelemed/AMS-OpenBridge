import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { episode, fleetRow, KPIS, kpiLoops, NEWEST_END, NOW, SUMMARY } from './overviewFixtures';
import { Frame, here, resetStage, stage } from './overviewTestFrame';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', async () => ({ ObcButton: (await import('./overviewTestFrame')).FakeButton }));
vi.mock('../../../ui/trend', async () => ({
  TrendPanel: (await import('./overviewTestFrame')).FakeTrendPanel,
  trendPointsToPane: (points: unknown[]) => ({ id: 'signals', axes: [], series: [], points }),
}));
vi.mock('../../../cpa/useCpaContext', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../cpa/useCpaContext')>();
  const { useFakeContext } = await import('./overviewTestFrame');
  return { ...actual, useCpaContext: () => useFakeContext(actual.readRange) };
});
vi.mock('../../../components/Cpm/kpi/useFleetKpis', async () => (await import('./overviewTestFrame')).fakeHooks);
vi.mock('../../../hooks/useCpm', async () => (await import('./overviewTestFrame')).fakeHooks);
vi.mock('../../../components/Cpm/events/useEventPage', async () => (await import('./overviewTestFrame')).fakeHooks);
vi.mock('./useOverviewData', async () => (await import('./overviewTestFrame')).fakeHooks);

import OverviewPage from './OverviewPage';

const open = (url = '/cpm') => render(<Frame url={url}><OverviewPage /></Frame>);
const url = () => here(screen.getByTestId('location'));
const inspector = () => document.querySelector('.ui-inspector') as HTMLElement;
const fact = (name: string) => {
  const term = [...inspector().querySelectorAll('dt')].find(t => t.textContent?.startsWith(name));
  return term?.parentElement?.querySelector('dd')?.textContent;
};

beforeEach(() => { resetStage(); vi.useFakeTimers({ toFake: ['Date'], now: NOW }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('inspector with no selection', () => {
  it('asks for a loop and proves the active filter', () => {
    open('/cpm?review=oscillating');
    expect(screen.getByRole('heading', { level: 2, name: 'Select a loop' })).toBeTruthy();
    expect(fact('Rule')).toBe('Suspected or confirmed oscillation (evidence ≥ 75)');
    expect(fact('Threshold')).toBe('Suspected or confirmed (evidence ≥ 75)');
    expect(fact('Population')).toBe('6 · 4 % of 160 assessed loops');
    expect(fact('Computed')).toMatch(/^4 Nov 2026, 14:29 (GST|GMT\+4)$/);
  });

  it('shows no raw code in the rule', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ kpi: 'acceptable', figure: KPIS.kpis[0] }) };
    open('/cpm?review=acceptable');
    expect(fact('Rule')).not.toContain('NO_CALL');
    expect(fact('Rule')).toContain('Base performance · G3 pass');
    expect(fact('Threshold')).toContain('Base performance · G3');
  });

  it('proves the default filter, whose figure the server does not serve', () => {
    open();
    expect(fact('Rule')).toContain('not shelved');
    expect(fact('Threshold')).toBe('Priority from loop criticality × finding severity');
    expect(fact('Population')).toBe('2 of 241 monitored loops');
  });

  it('proves a filter with no figure from its list', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ kpi: 'finding', figure: null, total: 15, matched: 15 }) };
    open('/cpm?review=finding');
    expect(fact('Rule')).toBe('Suspected or confirmed findings of any family.');
    expect(fact('Threshold')).toBe('As listed');
    expect(fact('Population')).toBe('15 of 241 monitored loops');
  });

  it('never prints "0 % of 0" in the proof (D-39)', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ figure: { ...KPIS.kpis[3], count: 0, denominator: 0 } }) };
    open('/cpm?review=oscillating');
    expect(fact('Population')).toBe('Nothing to judge');
  });

  it('says what the population was narrowed to', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ kpi: 'not-assessable', figure: KPIS.kpis[7] }) };
    open('/cpm?review=not-assessable&reason=MANUAL_MODE');
    expect(fact('Narrowed to')).toBe('manual mode');
  });

  it('reads 30 days of the filter\'s trend, and only with no loop selected', () => {
    open('/cpm?review=oscillating');
    expect(stage.current.calls.samples).toHaveBeenCalledWith('trend', 30);
    expect(screen.getByTestId('trend-Daily trend')).toBeTruthy();
    cleanup();
    resetStage();
    open('/cpm?review=oscillating&loop=FIC101');
    expect(stage.current.calls.samples).not.toHaveBeenCalledWith('trend', expect.anything());
  });

  it('keeps the longer trend spans of the old page', () => {
    open('/cpm?review=oscillating');
    fireEvent.click(within(screen.getByRole('group', { name: 'Trend span' })).getByRole('button', { name: '1 y' }));
    expect(url().searchParams.get('days')).toBe('365');
    expect(stage.current.calls.samples).toHaveBeenCalledWith('trend', 365);
  });

  it('a picked day lists that day\'s loops and can go back to now', () => {
    open('/cpm?review=oscillating');
    fireEvent.click(screen.getByRole('button', { name: 'Pick 2026-11-02T00:00:00Z' }));
    expect(url().searchParams.get('day')).toBe('2026-11-02T00:00:00Z');
    expect(stage.current.calls.list.mock.lastCall?.[0]).toMatchObject({ asOf: '2026-11-02T00:00:00Z' });
    expect(screen.getByTestId('trend-Daily trend').getAttribute('data-selected')).toBe('2026-11-02T00:00:00Z');
    expect(screen.getByText(/As of 2 Nov 2026, 04:00 (GST|GMT\+4)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to now' }));
    expect(url().searchParams.has('day')).toBe(false);
  });

  it('picking today is the live list, as on the old page', () => {
    open('/cpm?review=oscillating&day=2026-11-02T00:00:00Z');
    fireEvent.click(screen.getByRole('button', { name: 'Pick 2026-11-04T10:29:00Z' }));
    expect(url().searchParams.has('day')).toBe(false);
  });

  it('a picked day does not reach the queue, which has no history', () => {
    open('/cpm?day=2026-11-02T00:00:00Z');
    expect(screen.queryByText(/As of 2 Nov/)).toBeNull();
  });

  it('says why the queue has no daily trend, rather than showing empty days', () => {
    open();
    expect(screen.getByText('No daily trend for this filter')).toBeTruthy();
    expect(screen.queryByTestId('trend-Daily trend')).toBeNull();
  });

  it('draws Out of normal mode as its served mirror, and names it', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ kpi: 'out-of-mode', figure: null, total: 10, matched: 10 }) };
    open('/cpm?review=out-of-mode');
    expect(screen.getByTestId('trend-Daily trend').textContent).toContain('In auto mode, last 30 days');
  });

  it('says so when no day had anything to judge', () => {
    stage.current.trend = { ...stage.current.trend, data: { ...stage.current.trend.data!, points: stage.current.trend.data!.points.map(p => ({ ...p, kpis: p.kpis.map(f => ({ ...f, denominator: 0 })) })) } };
    open('/cpm?review=oscillating');
    expect(screen.getByTestId('trend-Daily trend').textContent).toContain('No day had anything to judge.');
  });

  it('shows a trend error with a retry', () => {
    const refetch = vi.fn();
    stage.current.trend = { ...stage.current.trend, data: undefined, isError: true, error: new Error('Trend failed'), refetch };
    open('/cpm?review=oscillating');
    fireEvent.click(within(inspector()).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('has no primary action with nothing selected', () => {
    open();
    expect(inspector().querySelector('.ui-inspector__foot')).toBeNull();
  });
});

describe('inspector with a loop selected', () => {
  it('shows identity, condition and why this loop', () => {
    open('/cpm?loop=FIC101');
    expect(screen.getByRole('heading', { level: 2, name: 'FIC101' })).toBeTruthy();
    expect(fact('Service')).toBe('FIC101 service');
    expect(fact('Asset')).toBe('HDPE › Section 600 › U6002');
    expect(fact('Criticality')).toContain('high');
    expect(fact('Condition')).toContain('Oscillation suspected');
    const why = within(screen.getByRole('region', { name: 'Why this loop' }));
    expect(why.getByText(/High severity/)).toBeTruthy();
    expect(why.getByText(/12 h window ending 4 Nov 14:15/)).toBeTruthy();
  });

  it('shows named statistics, and a missing one is not 0', () => {
    stage.current.fleet.byLoop.set('fic101', fleetRow({ loopId: 'FIC101', inputs: { goodErrorPct: 0.42, autoPct: 0.97 } }));
    open('/cpm?loop=FIC101');
    expect(fact('Good-error share')).toBe('42 %');
    expect(fact('Time in normal mode')).toBe('97 %');
    expect(fact('Time at an OP limit')).toBe('Not measured');
    expect(fact('Data coverage')).toBe('Not measured');
  });

  it('every statistic reaches its definition', () => {
    open('/cpm?loop=FIC101');
    for (const label of ['Evidence score', 'Good-error share', 'Time in normal mode', 'Time at an OP limit', 'Data coverage']) {
      expect(within(inspector()).getByRole('button', { name: `About ${label}` })).toBeTruthy();
    }
  });

  it('shows gate results through GateBadge, name first, with a strong G4 not grey (D-08)', () => {
    open('/cpm?loop=FIC101');
    const term = [...inspector().querySelectorAll('dt')].find(t => t.textContent === 'Actuator effort · G4');
    const badge = term?.parentElement?.querySelector('.ui-badge');
    expect(badge?.className).toContain('ui-badge--warning');
  });

  it('draws the trend over the evaluated window, whatever the header range says', () => {
    open('/cpm?loop=FIC101&range=30d');
    const trend = screen.getByTestId('trend-Evaluated window');
    const end = Date.parse(NEWEST_END);
    expect(trend.getAttribute('data-to')).toBe(String(end));
    expect(trend.getAttribute('data-from')).toBe(String(end - 12 * 3_600_000));
    expect(stage.current.calls.samples).toHaveBeenCalledWith('window', expect.stringContaining('FIC101'), end - 12 * 3_600_000, end, true);
  });

  it('a 24 h row draws 24 h', () => {
    stage.current.fleet.byLoop.set('zz9', fleetRow({ loopId: 'ZZ9', windowKind: '24h' }));
    open('/cpm?loop=ZZ9&window=24h');
    const trend = screen.getByTestId('trend-Evaluated window');
    expect(Number(trend.getAttribute('data-to')) - Number(trend.getAttribute('data-from'))).toBe(24 * 3_600_000);
  });

  it('a loop with no window asks for no samples and says so', () => {
    stage.current.fleet.byLoop.set('new1', fleetRow({ loopId: 'NEW1', state: 'NeverEvaluated', windowEnd: null, diagnosis: null }));
    open('/cpm?loop=NEW1');
    expect(screen.getByTestId('trend-Evaluated window').getAttribute('data-state')).toBe('empty');
    expect(stage.current.calls.samples).toHaveBeenCalledWith('window', expect.anything(), expect.anything(), expect.anything(), false);
  });

  it('shows a trend read error', () => {
    stage.current.samples = { ...stage.current.samples, isError: true, error: new Error('Historian timed out') };
    open('/cpm?loop=FIC101');
    expect(screen.getByTestId('trend-Evaluated window').getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('trend-Evaluated window').textContent).toContain('Historian timed out');
  });

  it('shows the episode, and links to it with the context', () => {
    open('/cpm?loop=FIC101&site=hdpe&range=7d');
    const section = within(screen.getByRole('region', { name: 'Episode' }));
    expect(section.getByText(/Oscillation confirmed/)).toBeTruthy();
    expect(section.getByText('Unacknowledged')).toBeTruthy();
    const href = new URL(section.getByRole('link', { name: 'Open episode' }).getAttribute('href') ?? '', 'http://t');
    expect(href.pathname).toBe('/cpm/events');
    expect(href.searchParams.get('event')).toBe('41');
    expect(href.searchParams.get('loop')).toBe('FIC101');
    expect(href.searchParams.get('site')).toBe('hdpe');
    expect(href.searchParams.get('range')).toBe('7d');
  });

  it('prefers the open episode of this window kind', () => {
    stage.current.events = { ...stage.current.events, data: { events: [episode({ id: 7, window_kind: '24h' }), episode({ id: 8, window_kind: '12h' })] } };
    open('/cpm?loop=FIC101');
    expect(within(screen.getByRole('region', { name: 'Episode' })).getByRole('link', { name: 'Open episode' }).getAttribute('href')).toContain('event=8');
  });

  it('says when the loop has no episode', () => {
    stage.current.events = { ...stage.current.events, data: { events: [] } };
    open('/cpm?loop=FIC101');
    expect(screen.getByText('No episode recorded for this loop.')).toBeTruthy();
  });

  it('has one primary action, Open loop, on the evaluated window', () => {
    open('/cpm?loop=FIC101&site=hdpe&window=12h');
    const foot = inspector().querySelector('.ui-inspector__foot') as HTMLElement;
    expect(within(foot).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(foot).getByRole('button', { name: 'Open loop' }));
    const q = url().searchParams;
    expect(url().pathname).toBe('/cpm/loop');
    expect([q.get('loop'), q.get('window'), q.get('range'), q.get('site')]).toEqual(['FIC101', '12h', 'custom', 'hdpe']);
    expect(q.get('to')).toBe(new Date(NEWEST_END).toISOString());
  });

  it('opens a loop on no page of the table from the fleet read, by link', () => {
    open('/cpm?loop=pic303');
    expect(screen.getByRole('heading', { level: 2, name: 'PIC303' })).toBeTruthy();
    expect(fact('Condition')).toContain('Stale');
    expect(within(screen.getByRole('region', { name: 'Why this loop' })).getByText('Not in the review queue')).toBeTruthy();
  });

  it('says when the loop is not in this scope, with a way out', () => {
    open('/cpm?loop=GHOST');
    expect(screen.getByText('GHOST is not in this scope')).toBeTruthy();
    expect(inspector().querySelector('.ui-inspector__foot')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(url().searchParams.has('loop')).toBe(false);
  });

  it('clearing the selection returns to the proof', () => {
    open('/cpm?loop=FIC101&review=oscillating');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Select a loop' })).toBeTruthy();
  });

  it('writes nothing: no episode action is offered', () => {
    open('/cpm?loop=FIC101');
    for (const name of ['Acknowledge', 'Shelve', 'Unshelve']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
});

describe('below 1280 px', () => {
  const narrow = () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1279'), addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
  };
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

  it('keeps the inspector closed until asked, and the proof reachable', () => {
    narrow();
    open('/cpm?review=oscillating');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'How this filter is counted' }));
    const drawer = within(screen.getByRole('dialog'));
    expect(drawer.getByText('Rule')).toBeTruthy();
    fireEvent.click(drawer.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the drawer on a selection, and closing clears it', () => {
    narrow();
    open('/cpm?loop=FIC101');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close inspector' }));
    expect(url().searchParams.has('loop')).toBe(false);
  });
});

describe('recent episodes', () => {
  const ledger = () => within(screen.getByRole('heading', { name: 'Recent episodes' }).closest('section') as HTMLElement);

  it('asks the server for the plant scope, newest first', () => {
    open('/cpm?site=hdpe');
    expect(stage.current.calls.page.mock.lastCall?.[0]).toMatchObject({ site: 'hdpe', sort: 'recent', state: 'all' });
  });

  it('applies the header range', () => {
    stage.current.page = { ...stage.current.page, data: { total: 2, events: [
      episode({ id: 2, loop_id: 'NEW1', opened_at: new Date(NOW - 3_600_000).toISOString() }),
      episode({ id: 1, loop_id: 'OLD1', opened_at: new Date(NOW - 20 * 3_600_000).toISOString(), closed_at: new Date(NOW - 10 * 3_600_000).toISOString() }),
    ] } };
    open('/cpm?range=8h');
    expect(ledger().getByText('NEW1')).toBeTruthy();
    expect(ledger().queryByText('OLD1')).toBeNull();
  });

  it('links each row and the whole list to Episodes, carrying scope and range', () => {
    open('/cpm?site=hdpe&range=7d&loop=FIC101');
    const all = new URL(screen.getByRole('link', { name: 'All episodes in this scope and range' }).getAttribute('href') ?? '', 'http://t');
    expect(all.pathname).toBe('/cpm/events');
    expect([all.searchParams.get('site'), all.searchParams.get('range')]).toEqual(['hdpe', '7d']);
    expect(all.searchParams.has('loop')).toBe(false);
    const row = ledger().getByRole('link', { name: 'Open episode' }).getAttribute('href') ?? '';
    expect(row).toContain('event=41');
    expect(row).toContain('site=hdpe');
  });

  it('states when the range was checked over a part of the list', () => {
    stage.current.page = { ...stage.current.page, data: { total: 500, events: [episode({ id: 1 })] } };
    open();
    expect(screen.getByText(/Only the newest 100 episodes in scope were checked against the range/)).toBeTruthy();
  });

  it('shows the empty state', () => {
    stage.current.page = { ...stage.current.page, data: { total: 0, events: [] } };
    open();
    expect(screen.getByText('No episodes in this scope and range')).toBeTruthy();
  });

  it('shows an error with a retry', () => {
    const refetch = vi.fn();
    stage.current.page = { ...stage.current.page, data: undefined, isError: true, error: new Error('Episodes failed'), refetch };
    open();
    fireEvent.click(within(ledger().getByRole('alert')).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('configuration limits', () => {
  it('states each limit and links to Setup › Loops filtered, with the context', () => {
    open('/cpm?site=hdpe&loop=FIC101');
    const vp = new URL(screen.getByRole('link', { name: 'VP not mapped on 236 loops' }).getAttribute('href') ?? '', 'http://t');
    expect(vp.pathname).toBe('/cpm/setup');
    expect([vp.searchParams.get('tab'), vp.searchParams.get('filter'), vp.searchParams.get('site')]).toEqual(['loops', 'vp-unmapped', 'hdpe']);
    expect(vp.searchParams.has('loop')).toBe(false);
    expect(screen.getByRole('link', { name: 'Peer links missing on 241 loops' }).getAttribute('href')).toContain('filter=peers-missing');
    expect(screen.getByText(/valve confirmation unavailable/)).toBeTruthy();
    expect(screen.getByText(/interaction analysis unavailable/)).toBeTruthy();
  });

  it('with nothing missing, says so and offers no link', () => {
    stage.current.summary = { ...stage.current.summary, data: { ...SUMMARY, capability: { ...SUMMARY.capability, loopsCappedByMissingVp: 0 } } };
    open();
    expect(screen.getByText(/VP mapped on every loop that expects one/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /VP not mapped/ })).toBeNull();
  });

  it('keeps the plant facts, gates named first', () => {
    open();
    expect(screen.getByText(/Plant facts, nothing to fix: 3 without positioner feedback installed/)).toBeTruthy();
    expect(screen.getByText(/Disturbance context · G13/)).toBeTruthy();
  });

  it('shows an error with a retry', () => {
    const refetch = vi.fn();
    stage.current.summary = { ...stage.current.summary, data: undefined, isError: true, error: new Error('Summary failed'), refetch };
    open();
    fireEvent.click(within(screen.getByRole('region', { name: 'Configuration limits' })).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
