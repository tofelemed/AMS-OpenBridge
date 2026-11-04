import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EMPTY_KPIS, fleetRow, KPIS, kpiLoops, NEWEST_END, NOW, ranked } from './overviewFixtures';
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
const figure = (label: string) => [...document.querySelectorAll('.ui-metric')].find(el => el.querySelector('.ui-metric__label span')?.textContent === label) as HTMLElement;
const pressed = () => within(screen.getByRole('group', { name: 'Review filter' })).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent);
const table = (name: string) => screen.getByRole('region', { name });
const columns = (name: string) => within(table(name)).getAllByRole('columnheader').map(h => h.textContent);

beforeEach(() => { resetStage(); vi.useFakeTimers({ toFake: ['Date'], now: NOW }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('title block', () => {
  it('names the page, the scope and the newest window with its zone', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByText('243 loops in scope · 241 monitored')).toBeTruthy();
    expect(screen.getByText(/Results from the newest 12 h window ending 4 Nov 14:15 (GST|GMT\+4) · updated 14:29 (GST|GMT\+4)/)).toBeTruthy();
  });

  it('says so when no window exists, rather than printing a time', () => {
    stage.current.fleet.newest = null;
    open();
    expect(screen.getByText(/No evaluated 12 h window yet/)).toBeTruthy();
  });

  it('writes the window kind to the URL', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
    expect(url().searchParams.get('window')).toBe('24h');
  });
});

describe('summary strip', () => {
  it('shows the four figures from the server', () => {
    open();
    expect(figure('Assessed').textContent).toContain('160 of 241 monitored · 66 %');
    expect(figure('Needing review').querySelector('.ui-metric__value')?.textContent).toBe('2');
    expect(figure('Data coverage').textContent).toContain('66 % assessable');
    expect(figure('Performing acceptably').textContent).toContain('120 of 160 assessed · 75 %');
  });

  it('states a window on every figure', () => {
    open();
    for (const label of ['Assessed', 'Needing review', 'Data coverage', 'Performing acceptably']) expect(figure(label).textContent).toContain('12 h window');
  });

  it('shows the change only where the server serves one, and names its denominator', () => {
    open();
    expect(figure('Performing acceptably').textContent).toContain('+8 pp of monitored vs 24 h earlier');
    for (const label of ['Assessed', 'Needing review', 'Data coverage']) expect(figure(label).textContent).not.toContain('24 h earlier');
  });

  it('a figure the service did not give reads Unavailable, never 0', () => {
    stage.current.kpis = { ...stage.current.kpis, data: undefined, isError: true, error: new Error('KPI read failed') };
    open();
    for (const label of ['Assessed', 'Data coverage', 'Performing acceptably']) {
      expect(figure(label).getAttribute('data-state')).toBe('unavailable');
      expect(figure(label).querySelector('.ui-metric__value')).toBeNull();
    }
  });

  it('a real 0 stays 0', () => {
    stage.current.kpis = { ...stage.current.kpis, data: { ...KPIS, kpis: KPIS.kpis.map(f => (f.key === 'acceptable' ? { ...f, count: 0 } : f)) } };
    open();
    expect(figure('Performing acceptably').querySelector('.ui-metric__value')?.textContent).toContain('0');
  });

  it('never prints "0 % of 0" with no loops in scope (D-39)', () => {
    stage.current.kpis = { ...stage.current.kpis, data: EMPTY_KPIS };
    open();
    const strip = screen.getByLabelText('Fleet summary').textContent ?? '';
    expect(strip).not.toMatch(/0 % of 0|NaN/);
    expect(figure('Assessed').textContent).toContain('No loops in scope');
    expect(figure('Data coverage').textContent).toContain('No loops in scope');
  });

  it('says there is nothing to judge when loops exist and none was assessed (D-39)', () => {
    stage.current.kpis = { ...stage.current.kpis, data: { ...KPIS, states: { ...KPIS.states, assessed: 0 }, kpis: KPIS.kpis.map(f => (f.key === 'acceptable' ? { ...f, count: 0 } : f)) } };
    open();
    expect(figure('Performing acceptably').textContent).toContain('Nothing to judge');
  });

  it('opens the breakdown of Data coverage from its ⓘ by keyboard', () => {
    open();
    const button = screen.getByRole('button', { name: 'About Data coverage' });
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    const panel = screen.getByRole('group', { name: 'About Data coverage' });
    for (const text of ['Not assessable', 'Stale', 'Never evaluated', 'incomplete data 3 · manual mode 2']) expect(panel.textContent).toContain(text);
    expect(panel.textContent).toContain('66 · 27 % of 241 monitored · +2 pp vs 24 h earlier');
  });

  it('shows no raw placeholder in a definition', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'About Performing acceptably' }));
    const text = screen.getByRole('group', { name: 'About Performing acceptably' }).textContent ?? '';
    expect(text).toContain('in normal mode ≥ 95 %');
    expect(text).not.toContain('{NormalModeMin');
    expect(text).not.toContain('{fresh}');
  });

  it('every figure reaches its definition by a real button', () => {
    open();
    for (const label of ['Assessed', 'Needing review', 'Data coverage', 'Performing acceptably']) {
      expect(within(figure(label)).getByRole('button', { name: `About ${label}` }).getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('every figure opens the loops behind it, keeping the context', () => {
    open('/cpm?site=hdpe&range=7d&window=24h');
    const href = within(figure('Performing acceptably')).getByRole('link', { name: 'Show these loops' }).getAttribute('href') ?? '';
    const q = new URL(href, 'http://t').searchParams;
    expect(q.get('review')).toBe('acceptable');
    expect([q.get('site'), q.get('range'), q.get('window')]).toEqual(['hdpe', '7d', '24h']);
  });

  it('links to the shelved loops the queue leaves out', () => {
    stage.current.queue = { ...stage.current.queue, data: { ...stage.current.queue.data!, shelvedCount: 3 } };
    open();
    const href = within(figure('Needing review')).getByRole('link', { name: '3 shelved' }).getAttribute('href') ?? '';
    expect(href).toContain('/cpm/events');
    expect(href).toContain('filter=shelved');
  });

  it('marks a queue at the server limit as possibly longer', () => {
    stage.current.queue = { ...stage.current.queue, data: { loops: Array.from({ length: 200 }, (_, i) => ranked({ loopId: `L${i}` })) } };
    open();
    expect(figure('Needing review').querySelector('.ui-metric__value')?.textContent).toBe('200+');
    expect(screen.getByText('The first 200 by priority. The queue may hold more.')).toBeTruthy();
  });
});

describe('distribution band', () => {
  it('names every state with its count for assistive technology', () => {
    open();
    expect(screen.getByRole('img', { name: /With a finding 15, Symptom only 4, Performing acceptably 120, No fault, but limited 20, Result not recognised 1, Not assessable 5, Stale 66, Never evaluated 10/ })).toBeTruthy();
  });

  it('each legend item filters the table', () => {
    open('/cpm?site=hdpe');
    const legend = screen.getByRole('region', { name: 'Monitored loops by state' });
    fireEvent.click(within(legend).getByRole('link', { name: 'Symptom only 4' }));
    expect(url().searchParams.get('review')).toBe('symptom');
    expect(url().searchParams.get('site')).toBe('hdpe');
    expect(pressed()[0]).toContain('Symptom only');
  });

  it('marks the active legend item', () => {
    open('/cpm?review=stale');
    expect(screen.getByRole('link', { name: 'Stale 66' }).getAttribute('aria-current')).toBe('true');
  });
});

describe('review filters', () => {
  it('defaults to Needing review with nothing in the URL', () => {
    open();
    expect(pressed()).toEqual(['Needing review 2']);
    expect(url().searchParams.has('review')).toBe(false);
  });

  it('shows each count from the server', () => {
    open();
    const group = within(screen.getByRole('group', { name: 'Review filter' }));
    for (const name of ['Oscillating 6', 'Suspected valve problem 4', 'Excessive actuator effort 2', 'Saturated / at limit 7', 'In manual 3', 'Out of normal mode 10', 'Performing acceptably 120', 'Not assessable 5', 'Stale 66', 'Never evaluated 10']) {
      expect(group.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('a count not yet known shows nothing, not 0', () => {
    stage.current.kpis = { ...stage.current.kpis, data: undefined };
    stage.current.outOfMode = null;
    open();
    const group = within(screen.getByRole('group', { name: 'Review filter' }));
    expect(group.getByRole('button', { name: 'Oscillating' })).toBeTruthy();
    expect(group.getByRole('button', { name: 'Out of normal mode' })).toBeTruthy();
  });

  it('writes the filter, and clears it on returning to the default', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Oscillating 6' }));
    expect(url().searchParams.get('review')).toBe('oscillating');
    fireEvent.click(screen.getByRole('button', { name: 'Needing review 2' }));
    expect(url().searchParams.has('review')).toBe(false);
  });

  it('opens a filter from an old /cpm/kpi link that is outside the set, and names it', () => {
    open('/cpm?review=finding');
    expect(pressed()).toEqual(['With a finding 15']);
  });

  it('falls back to the default on an unknown value', () => {
    open('/cpm?review=nonsense');
    expect(pressed()).toEqual(['Needing review 2']);
  });

  it('honours the old reason= on Not assessable and offers its reasons', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ kpi: 'not-assessable', reason: 'MANUAL_MODE' }) };
    open('/cpm?review=not-assessable&reason=MANUAL_MODE');
    expect(stage.current.calls.list.mock.lastCall?.[0]).toMatchObject({ kpi: 'not-assessable', reason: 'MANUAL_MODE' });
    const chips = within(screen.getByRole('group', { name: 'Narrow by reason' }));
    expect(chips.getByRole('button', { name: /Manual mode 2/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chips.getByRole('button', { name: /All reasons 5/ }));
    expect(url().searchParams.has('reason')).toBe(false);
  });

  it('ignores reason= on any other filter', () => {
    open('/cpm?review=oscillating&reason=MANUAL_MODE');
    expect(stage.current.calls.list.mock.lastCall?.[0]).toMatchObject({ reason: null });
  });
});

describe('review table', () => {
  const NAME = 'Needing review: loops';

  it('shows the queue in the server order, with the SPEC columns', () => {
    open();
    expect(columns(NAME)).toEqual(['Loop↕', 'Parent asset↕', 'Condition↕', 'Review metric↕', 'Priority↕', 'Persistence↕', 'Coverage↕', 'Last evaluation↕', 'Acknowledgement']);
    const cells = within(within(table(NAME)).getAllByRole('row')[1]).getAllByRole('cell').map(c => c.textContent);
    expect(cells[0]).toBe('FIC101');
    expect(cells[1]).toBe('HDPE › Section 600 › U6002');
    expect(cells[2]).toContain('Oscillation suspected');
    expect(cells[3]).toContain('42 %');
    expect(cells[3]).toContain('Good-error share');
    expect(cells[4]).toContain('High');
    expect(cells[5]).toBe('3 days · 12 windows');
    expect(cells[6]).toBe('97 %');
    expect(cells[7]).toMatch(/^4 Nov 14:15 (GST|GMT\+4)$/);
    expect(cells[8]).toContain('Unacknowledged');
  });

  it('asks the KPI list for nothing on the default view', () => {
    open();
    expect(stage.current.calls.list.mock.calls.every(c => c[1] === false)).toBe(true);
  });

  it('a value no source gives reads as a dash, not 0', () => {
    stage.current.queue = { ...stage.current.queue, data: { loops: [ranked({ loopId: 'X1', episodeOpenedAt: null, episodeWindowCount: null, ackState: null, priority: null, metrics: { ...ranked({ loopId: 'X1' }).metrics, goodErrorPct: null } })] } };
    open();
    const cells = within(within(table(NAME)).getAllByRole('row')[1]).getAllByRole('cell').map(c => c.textContent);
    expect(cells[3]).toContain('—');
    expect(cells[3]).not.toContain('0 %');
    for (const i of [4, 5, 6, 8]) expect(cells[i]).toBe('—');
  });

  it('states the ranking basis, with its definition', () => {
    open();
    expect(screen.getByText(/Ranked by priority/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About Ranked by priority' })).toBeTruthy();
  });

  it('sorts by a heading, reports it, and returns to the ranked order', () => {
    open();
    fireEvent.click(within(table(NAME)).getByRole('button', { name: 'Priority' }));
    fireEvent.click(within(table(NAME)).getByRole('button', { name: 'Priority' }));
    const heading = within(table(NAME)).getByRole('columnheader', { name: /Priority/ });
    expect(heading.getAttribute('aria-sort')).toBe('descending');
    expect(within(within(table(NAME)).getAllByRole('row')[1]).getAllByRole('cell')[0].textContent).toBe('TIC202');
    expect(screen.getByText(/Sorted by Priority, descending/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to ranked order' }));
    expect(within(within(table(NAME)).getAllByRole('row')[1]).getAllByRole('cell')[0].textContent).toBe('FIC101');
  });

  it('searches the whole queue', () => {
    open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search loops' }), { target: { value: 'tic' } });
    expect(within(table(NAME)).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('1 of 2 match the search')).toBeTruthy();
  });

  it('adds Deciding value on any other filter, and the list comes from the server', () => {
    open('/cpm?review=oscillating');
    expect(columns('Oscillating: loops').some(c => c?.includes('Deciding value'))).toBe(true);
    expect(screen.getByText('Evidence score 90 — at or above 75')).toBeTruthy();
    expect(stage.current.calls.list.mock.lastCall).toEqual([expect.objectContaining({ kpi: 'oscillating', page: 1, pageSize: 25 }), true]);
  });

  it('has no Deciding value on the default', () => {
    open();
    expect(columns(NAME).join()).not.toContain('Deciding value');
  });

  it('gives Not assessable a Reason column, each cause in its own words (D-15)', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({
      kpi: 'not-assessable',
      rows: [
        fleetRow({ loopId: 'A1', state: 'NotAssessable', reason: 'MANUAL_MODE' }),
        fleetRow({ loopId: 'A2', state: 'NotAssessable', reason: 'INSTRUMENT_HEALTH' }),
        fleetRow({ loopId: 'A3', state: 'NotAssessable', reason: 'OUTSIDE_OPERATING_REGION' }),
      ],
    }) };
    open('/cpm?review=not-assessable');
    const rows = within(table('Not assessable: loops')).getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows[0]).toContain('Manual mode');
    expect(rows[1]).toContain('Instrument fault');
    expect(rows[2]).toContain('Outside operating region');
    expect(rows.join()).not.toContain('loop not in automatic');
  });

  it('pages and searches on the server', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ total: 60, matched: 60 }) };
    open('/cpm?review=oscillating');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(stage.current.calls.list.mock.lastCall?.[0]).toMatchObject({ page: 2 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search loops' }), { target: { value: 'fic' } });
    expect(stage.current.calls.list.mock.lastCall?.[0]).toMatchObject({ page: 1, q: 'fic' });
  });

  it('does not offer to sort one page of many, and says why', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ total: 60, matched: 60 }) };
    open('/cpm?review=oscillating');
    expect(within(table('Oscillating: loops')).queryByRole('button', { name: /Coverage/ })).toBeNull();
    expect(screen.getByText(/The server pages this list, so headings do not re-sort it/)).toBeTruthy();
  });

  it('sorts a list that fits one page', () => {
    open('/cpm?review=oscillating');
    expect(within(table('Oscillating: loops')).getByRole('button', { name: /Coverage/ })).toBeTruthy();
  });

  it('merges queue fields into a filtered row', () => {
    open('/cpm?review=oscillating');
    const row = within(table('Oscillating: loops')).getAllByRole('row')[1];
    expect(row.textContent).toContain('3 days · 12 windows');
    expect(row.textContent).toContain('Unacknowledged');
  });

  it('shows the empty filter state with one way back', () => {
    stage.current.list = { ...stage.current.list, data: kpiLoops({ total: 0, matched: 0, rows: [] }) };
    open('/cpm?review=oscillating');
    expect(screen.getByText('No loops match Oscillating in this scope')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));
    expect(url().searchParams.has('review')).toBe(false);
  });

  it('shows the empty queue with the way to all loops', () => {
    stage.current.queue = { ...stage.current.queue, data: { loops: [], shelvedCount: 0 } };
    open();
    expect(screen.getByText('No current findings')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Show all monitored loops' }).getAttribute('href')).toContain('review=all');
  });

  it('points to the shelved list when every finding is shelved', () => {
    stage.current.queue = { ...stage.current.queue, data: { loops: [], shelvedCount: 2 } };
    open();
    expect(screen.getByText('Every current finding is shelved (2).')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review shelved loops' })).toBeTruthy();
  });

  it('clears a search that matched nothing', () => {
    open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search loops' }), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(within(table(NAME)).getAllByRole('row')).toHaveLength(3);
  });

  it('shows an error with its reason and a retry, never empty text', () => {
    const refetch = vi.fn();
    stage.current.queue = { ...stage.current.queue, data: undefined, isError: true, error: new Error('Rankings timed out'), refetch };
    open();
    const alert = within(document.querySelector('.ov-panel') as HTMLElement).getByRole('alert');
    expect(alert.textContent).toContain('Rankings timed out');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a skeleton while the queue loads', () => {
    stage.current.queue = { ...stage.current.queue, data: undefined, isLoading: true };
    open();
    expect(screen.getByText('Loading Needing review: loops')).toBeTruthy();
  });
});

describe('keyboard', () => {
  const rowOf = (tag: string) => within(table('Needing review: loops')).getByText(tag).closest('tr') as HTMLElement;

  it('rows take focus', () => {
    open();
    expect(rowOf('FIC101').getAttribute('tabindex')).toBe('0');
  });

  it('Enter opens the loop on the evaluated window, keeping the context', () => {
    open('/cpm?site=hdpe&window=12h');
    fireEvent.keyDown(rowOf('FIC101'), { key: 'Enter' });
    const q = url().searchParams;
    expect(url().pathname).toBe('/cpm/loop');
    expect(q.get('loop')).toBe('FIC101');
    expect(q.get('window')).toBe('12h');
    expect(q.get('range')).toBe('custom');
    expect(q.get('from')).toBe(new Date(Date.parse(NEWEST_END) - 12 * 3_600_000).toISOString());
    expect(q.get('to')).toBe(new Date(NEWEST_END).toISOString());
    expect(q.get('site')).toBe('hdpe');
  });

  it('Space selects, without leaving the page', () => {
    open();
    fireEvent.keyDown(rowOf('FIC101'), { key: ' ' });
    expect(url().pathname).toBe('/cpm');
    expect(url().searchParams.get('loop')).toBe('FIC101');
    expect(rowOf('FIC101').getAttribute('aria-current')).toBe('true');
  });

  it('a click selects, and marks the row by more than colour', () => {
    open();
    fireEvent.click(rowOf('TIC202'));
    expect(url().searchParams.get('loop')).toBe('TIC202');
    expect(rowOf('TIC202').getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('heading', { level: 2, name: 'TIC202' })).toBeTruthy();
  });
});

describe('page states', () => {
  it('shows the stale banner over retained values, with the last update', () => {
    stage.current.fleet.newest = NOW - 3 * 3_600_000;
    open();
    expect(screen.getByText('Newest results are 3 h old')).toBeTruthy();
    expect(screen.getByText(/Last update 4 Nov 11:30 (GST|GMT\+4)/)).toBeTruthy();
    expect(figure('Assessed').textContent).toContain('160');
  });

  it('shows no banner for results inside the served freshness limit', () => {
    open();
    expect(screen.queryByText(/Newest results are/)).toBeNull();
  });

  it('is partial when the KPI service failed and the table loaded', () => {
    const refetch = vi.fn();
    stage.current.kpis = { ...stage.current.kpis, data: undefined, isError: true, error: new Error('KPI read failed'), refetch };
    open();
    expect(screen.getByText('Fleet figures unavailable')).toBeTruthy();
    expect(screen.getByText('KPI read failed')).toBeTruthy();
    expect(within(table('Needing review: loops')).getByText('FIC101')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('state-partial')).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a skeleton for the strip while the figures load', () => {
    stage.current.kpis = { ...stage.current.kpis, data: undefined, isLoading: true };
    open();
    expect(screen.getByText('Loading the fleet figures')).toBeTruthy();
  });

  it('with no loops in scope, says so and points to Setup', () => {
    stage.current.kpis = { ...stage.current.kpis, data: EMPTY_KPIS };
    open('/cpm?site=hdpe');
    expect(screen.getByRole('heading', { name: 'No loops in scope' })).toBeTruthy();
    const href = screen.getByRole('link', { name: 'Open Setup › Loops' }).getAttribute('href') ?? '';
    expect(href).toContain('/cpm/setup');
    expect(href).toContain('tab=loops');
    expect(href).toContain('site=hdpe');
  });
});
