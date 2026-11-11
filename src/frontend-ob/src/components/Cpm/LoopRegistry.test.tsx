// Task 23: the Loop Registry list shows Loop, Loop type and VP. CHG-168 (owner review, the approved sample and the answers of
// 11 Nov): the header is the eyebrow and the title (no ?) with How to read, Bulk import and Add loop; one filter row inside the
// list card, search first, then ONE dropdown (Not retired n · With retired n · the three limit counts), Export CSV; the shared
// pager, centred; a row opens the loop in the panel beside the list (the address carries it); "Choose a loop" until one is picked.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LoopRegistry } from './LoopRegistry';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./registry/LoopPanel', () => ({ default: (p: { loopId: string }) => <aside>panel of {p.loopId}</aside> }));
vi.mock('./AddLoopWizard', () => ({ default: () => <div>wizard</div> }));
vi.mock('./BulkImportDialog', () => ({ default: () => <div>import</div> }));
const download = vi.fn();
vi.mock('../../utils/csv', () => ({ downloadTextFile: (...a: unknown[]) => download(...a) }));

const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: `${id} service`, site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'medium', isActive: true, monitoringEnabled: true, tags: { VP: 'x' }, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: 'prof-1', model: null, ...over,
} as CpmLoop);

let loops: CpmLoop[] = [];
let loading = false;
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: loading ? undefined : { loops }, isLoading: loading, isError: false, error: null, refetch: vi.fn() }),
  useFleetSummary: () => fleet,
}));
const okFleet = { data: { capability: { loopsCappedByMissingVp: 236, loopsWithoutDisturbanceContext: 241, vpNotApplicable: 1 } }, isError: false, error: null, refetch: vi.fn() };
let fleet: Record<string, unknown> = okFleet;

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const SetScope = ({ k, v }: { k: string; v: string }) => { const [, set] = useSearchParams(); return <button onClick={() => set(p => { p.set(k, v); return p; })}>pick {k}</button>; };
const PickLoop = () => { const [, set] = useSearchParams(); return <button onClick={() => set(p => { p.set('loop', 'L27'); return p; })}>pick loop</button>; };
const HistoryBack = () => { const nav = useNavigate(); return <button onClick={() => nav(-1)}>history back</button>; };
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><LoopRegistry /><Where />
  <SetScope k="site" v="hdpe" /><SetScope k="area" v="A1" /><SetScope k="unit" v="U1" /><PickLoop /><HistoryBack /></MemoryRouter>);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const where = () => screen.getByTestId('where').textContent!;
const shown = () => screen.getByLabelText('Loops shown') as HTMLSelectElement;
const ids = () => screen.queryAllByRole('link', { name: /^[A-Z0-9-]+$/ }).map(a => a.textContent);
const many = (n: number) => Array.from({ length: n }, (_, i) => loop(`L${String(i).padStart(2, '0')}`));

beforeEach(() => { fleet = okFleet; loading = false; loops = [loop('FIC1'), loop('FIC2', { loopType: 'PIC' })]; asUser(['cpm.manage']); download.mockReset(); });
afterEach(cleanup);

describe('LoopRegistry header', () => {
  it('is the eyebrow and the title, no ?, with How to read, Bulk import and Add loop', () => {
    open('/cpm/registry');
    expect(screen.getByText('Set up')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loop Registry');
    expect(screen.queryByRole('button', { name: 'Loop Registry' })).toBeNull();
    for (const name of ['How to read', 'Bulk import', 'Add loop']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByText(/A loop is only as good as its signal mappings/)).toBeNull();
  });

  it('How to read holds State, VP and Readiness, with the words of the two old ?', () => {
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dlg = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dlg).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['State', 'VP', 'Readiness']);
    for (const word of ['Active', 'Degraded', 'Not monitored', 'Retired', 'Mapped', 'Not mapped', 'No VP']) expect(within(dlg).getByText(word)).toBeTruthy();
    expect(within(dlg).getByText('A loop is only as good as its signal mappings')).toBeTruthy();
    expect(within(dlg).getByText('Map the VP tag so non-following evidence can confirm a valve fault (G14).')).toBeTruthy();
    expect(within(dlg).getByText('Interaction analysis unavailable (G13) until peers are configured.')).toBeTruthy();
    expect(within(dlg).getByText('1 without a valve (valve diagnosis does not apply).')).toBeTruthy();
  });

  it('disables Add loop and Bulk import with a reason without cpm.manage, and enables them with it', () => {
    asUser([]);
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Bulk import' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(2);
    cleanup();
    asUser(['cpm.manage']);
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Needs the cpm.manage permission')).toBeNull();
  });
});

describe('LoopRegistry list', () => {
  it('shows Loop, Loop type and VP, the service under the tag, and no list title or count note', () => {
    open('/cpm/registry');
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'Loop type', 'VP']);
    expect(screen.getAllByText('service').length).toBe(2);
    expect(screen.queryByText('Loop assets')).toBeNull();
    expect(screen.queryByText(/^\d+ loops?/)).toBeNull();
    expect(screen.queryByLabelText('Configuration limits')).toBeNull();
  });

  it('puts the search first in one filter row, then the dropdown and Export CSV', () => {
    open('/cpm/registry');
    const row = screen.getByRole('group', { name: 'Loop filters' });
    const controls = Array.from(row.querySelectorAll('input, select, button')).map(e => e.getAttribute('aria-label') ?? e.textContent);
    expect(controls).toEqual(['Find loop', 'Loops shown', 'Export CSV']);
    expect((screen.getByLabelText('Find loop') as HTMLInputElement).placeholder).toBe('Loop, service, unit or type');
  });

  it('counts each choice in the dropdown, from the list and the server summary, whatever the search', () => {
    loops = [loop('FIC1'), loop('OLD1', { isActive: false }), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} })];
    open('/cpm/registry?search=FIC');
    expect(Array.from(shown().options).map(o => o.textContent)).toEqual([
      'Not retired 2', 'With retired 3', 'VP expected, not mapped 236', 'Peer links expected, missing 241', 'Degraded 1',
    ]);
  });

  it('shows retired loops with With retired, and each limit the loops behind it; Not retired returns', () => {
    loops = [
      loop('A1', { tags: {} }),                                        // VP expected, not mapped
      loop('A2'),                                                      // VP mapped
      loop('A3', { tags: {}, engineering: { vpApplicability: 'NOT_APPLICABLE' } as CpmLoop['engineering'] }),
      loop('OLD', { tags: {}, isActive: false }),                      // retired: not counted by the server
    ];
    open('/cpm/registry?page=1');
    expect(ids()).toEqual(['A1', 'A2', 'A3']);
    fireEvent.change(shown(), { target: { value: 'all' } });
    expect(where()).toContain('retired=1');
    expect(where()).not.toContain('page=');
    expect(ids()).toEqual(['A1', 'A2', 'A3', 'OLD']);
    const old = screen.getByRole('link', { name: 'OLD' }).closest('tr')!;
    expect(within(old).getByText('Retired')).toBeTruthy();
    expect(within(old).getByText('⊘')).toBeTruthy();
    fireEvent.change(shown(), { target: { value: 'vp' } });
    expect(where()).toContain('gap=vp');
    expect(where()).not.toContain('retired=');
    expect(ids()).toEqual(['A1']);
    fireEvent.change(shown(), { target: { value: 'current' } });
    expect(where()).not.toMatch(/gap=|retired=/);
  });

  it('opens on the choice an old link names (?gap=degraded, ?retired=1)', () => {
    loops = [loop('GOOD'), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} }), loop('OFF', { monitoringEnabled: false })];
    open('/cpm/registry?gap=degraded');
    expect(shown().value).toBe('degraded');
    expect(ids()).toEqual(['DEG']);
  });

  it('shows one muted pill beside the name only for Not monitored and Retired', () => {
    loops = [loop('GOOD'), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} }), loop('OFF', { monitoringEnabled: false }), loop('OLD', { isActive: false })];
    open('/cpm/registry?retired=1');
    const rowOf = (id: string) => screen.getByRole('link', { name: id }).closest('tr')!;
    expect(within(rowOf('GOOD')).queryByText(/Degraded|Not monitored|Retired/)).toBeNull();
    expect(within(rowOf('DEG')).queryByText(/Degraded/)).toBeNull();
    expect(within(rowOf('OFF')).getByText('Not monitored')).toBeTruthy();
    expect(within(rowOf('OFF')).getByText('○')).toBeTruthy();
    expect(within(rowOf('OLD')).getByText('Retired')).toBeTruthy();
  });

  it('says so, with a retry beside the dropdown, when the limits cannot be read', () => {
    const refetch = vi.fn();
    fleet = { data: undefined, isError: true, error: new Error('boom'), refetch };
    open('/cpm/registry');
    const row = screen.getByRole('group', { name: 'Loop filters' });
    expect(within(row).getByText('Configuration limits unavailable')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(Array.from(shown().options).map(o => o.textContent)).toContain('VP expected, not mapped');
  });

  it('says no loop matches a search, with Show all loops, and never offers to onboard the first loop', () => {
    open('/cpm/registry?search=zzz&gap=vp');
    expect(screen.getByText('No loop matches “zzz”')).toBeTruthy();
    expect(screen.queryByText('No loops registered')).toBeNull();
    expect(screen.queryAllByRole('button', { name: 'Add loop' }).length).toBe(1);   // the header's only
    fireEvent.click(screen.getByRole('button', { name: 'Show all loops' }));
    expect(where()).not.toMatch(/search=|gap=/);
    expect(ids()).toEqual(['FIC1', 'FIC2']);
  });

  it('offers Add loop beside "No loops registered" only when the registry is empty', () => {
    loops = [];
    open('/cpm/registry');
    expect(screen.getByText('No loops registered')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add loop' }).length).toBe(2);
  });

  it('pages 25 rows with the shared pager and starts at page 1 when the scope, the search or the dropdown changes', () => {
    loops = many(30);
    open('/cpm/registry');
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(where()).toContain('page=2');
    expect(ids()).toEqual(['L25', 'L26', 'L27', 'L28', 'L29']);
    for (const k of ['site', 'area', 'unit']) {
      cleanup();
      open('/cpm/registry?page=2');
      fireEvent.click(screen.getByText(`pick ${k}`));
      expect(where()).not.toContain('page=');
    }
    cleanup();
    open('/cpm/registry?page=2');
    fireEvent.change(screen.getByLabelText('Find loop'), { target: { value: 'L0' } });
    expect(where()).not.toContain('page=');
    cleanup();
    open('/cpm/registry?page=2');
    fireEvent.change(shown(), { target: { value: 'all' } });
    expect(where()).not.toContain('page=');
  });

  it('keeps the page in the address on first load, with the scope already set (B10)', () => {
    loops = many(30);
    open('/cpm/registry?site=hdpe&area=A1&unit=U1&page=2');
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(where()).toContain('page=2');
  });

  it('exports the loops the list holds, every page, in the bulk-import format', () => {
    loops = [...many(30), loop('OLD', { isActive: false })];
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(download).toHaveBeenCalledTimes(1);
    const [name, text] = download.mock.calls[0] as [string, string];
    expect(name).toMatch(/^cplm-loop-registry-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/^tag,service,site,area,unit,loop_type,criticality,pv_tag/);
    expect(lines.length).toBe(31);
    expect(text).not.toContain('OLD');
  });
});

describe('LoopRegistry panel', () => {
  it('says Choose a loop and loads no loop while the address names none', () => {
    open('/cpm/registry');
    expect(screen.getByRole('heading', { name: 'Choose a loop' })).toBeTruthy();
    expect(screen.queryByText(/panel of/)).toBeNull();
    expect(screen.queryByRole('row', { current: true })).toBeNull();
  });

  it('opens the loop the address names beside the list, the list kept and its row marked', () => {
    open('/cpm/registry?loop=FIC2');
    expect(screen.getByText('panel of FIC2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'FIC1' })).toBeTruthy();
    expect(screen.getByRole('row', { current: true }).textContent).toContain('FIC2');
  });

  it('opens a loop from its link or anywhere on its row, keeping the search and the page', () => {
    open('/cpm/registry?search=FIC&page=1');
    fireEvent.click(screen.getByRole('link', { name: 'FIC1' }));
    expect(where()).toContain('loop=FIC1');
    expect(where()).toContain('search=FIC');
    expect(screen.getByText('panel of FIC1')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'FIC2' }).closest('tr')!.querySelectorAll('td')[1]);
    expect(where()).toContain('loop=FIC2');
  });

  it('opens a loop once when the link itself is clicked, so Back returns to the list (B10)', () => {
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('link', { name: 'FIC1' }));
    expect(where()).toContain('loop=FIC1');
    fireEvent.click(screen.getByText('history back'));
    expect(where()).not.toContain('loop=');
    expect(screen.getByRole('heading', { name: 'Choose a loop' })).toBeTruthy();
  });

  it('opens the list at the page that holds a deep-linked loop', () => {
    loops = many(30);
    open('/cpm/registry?loop=L27');
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('row', { current: true }).textContent).toContain('L27');
  });

  it('moves to the page of a loop named from outside the list while the page is open, and stays for a row picked on it', () => {
    loops = many(30);
    open('/cpm/registry');
    fireEvent.click(screen.getByText('pick loop'));               // a link or the search palette names L27, on page 2
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByRole('row', { current: true }).textContent).toContain('L27');
    fireEvent.click(screen.getByRole('link', { name: 'L26' }));
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  });
});
