// Task 23: the Loop Registry list shows Loop, Loop type and VP; a row opens the loop's detail page.
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
vi.mock('./registry/LoopDetail', () => ({ default: (p: { loopId: string; onBack: () => void }) => <aside>detail of {p.loopId}<button onClick={p.onBack}>‹ Loop Registry</button></aside> }));
vi.mock('./AddLoopWizard', () => ({ default: () => <div>wizard</div> }));
vi.mock('./BulkImportDialog', () => ({ default: () => <div>import</div> }));

const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: `${id} service`, site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'medium', isActive: true, monitoringEnabled: true, tags: { VP: 'x' }, observabilityFlags: [], links: [],
  stepTestApproved: false, thresholdProfileId: 'prof-1', model: null, ...over,
} as CpmLoop);

let loops: CpmLoop[] = [];
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useFleetSummary: () => fleet,
}));
const okFleet = { data: { capability: { loopsCappedByMissingVp: 236, loopsWithoutDisturbanceContext: 241 } }, isError: false, error: null, refetch: vi.fn() };
let fleet: Record<string, unknown> = okFleet;

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const SetSite = () => { const [, set] = useSearchParams(); return <button onClick={() => set(p => { p.set('site', 'hdpe'); return p; })}>pick site</button>; };
const SetScope = ({ k, v }: { k: string; v: string }) => { const [, set] = useSearchParams(); return <button onClick={() => set(p => { p.set(k, v); return p; })}>pick {k}</button>; };
const HistoryBack = () => { const nav = useNavigate(); return <button onClick={() => nav(-1)}>history back</button>; };
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><LoopRegistry /><Where /><SetSite /><SetScope k="area" v="A1" /><SetScope k="unit" v="U1" /><HistoryBack /></MemoryRouter>);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});

beforeEach(() => { fleet = okFleet; loops =[loop('FIC1'), loop('FIC2', { loopType: 'PIC' })]; asUser(['cpm.manage']); });
afterEach(cleanup);

describe('LoopRegistry list', () => {
  it('shows Loop, Loop type and VP only', () => {
    open('/cpm/registry');
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['Loop', 'Loop type', 'VP']);
    for (const gone of ['Profile', 'State', 'Loop model (registry)', 'Type']) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.queryByText('Registered assets')).toBeNull();
    expect(screen.queryByText(/Pick a loop in the registry list/)).toBeNull();
    expect(screen.getAllByText('service').length).toBe(2);
  });

  it('opens detail from a row and keeps search and page for Back', () => {
    open('/cpm/registry?search=FIC&page=2');
    // page 2 of a one-page list is clamped, the row is still there
    fireEvent.click(screen.getByRole('link', { name: /FIC1/ }));
    const where = screen.getByTestId('where').textContent!;
    expect(where).toContain('loop=FIC1');
    expect(where).toContain('search=FIC');
    fireEvent.click(screen.getByRole('button', { name: '‹ Loop Registry' }));
    const back = screen.getByTestId('where').textContent!;
    expect(back).not.toContain('loop=');
    expect(back).toContain('search=FIC');
  });

  it('disables Add loop and Bulk import with a reason without cpm.manage', () => {
    asUser([]);
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Bulk import' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(2);
  });

  it('enables them with cpm.manage', () => {
    open('/cpm/registry');
    expect((screen.getByRole('button', { name: 'Add loop' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Needs the cpm.manage permission')).toBeNull();
  });

  it('shows configuration limits as a compact line', () => {
    open('/cpm/registry');
    const line = screen.getByLabelText('Configuration limits');
    expect(within(line).getByText('236')).toBeTruthy();
    expect(within(line).getByText('241')).toBeTruthy();
    expect(line.textContent).toMatch(/valve positions/);
    expect(line.textContent).toMatch(/peer links/);
  });

  it('marks a retired loop and can show them', () => {
    loops = [loop('FIC1'), loop('OLD1', { isActive: false })];
    open('/cpm/registry');
    expect(screen.queryByText('OLD1')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    expect(screen.getByText('OLD1')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
  });

  it('shows the loop detail page for ?loop=', () => {
    open('/cpm/registry?loop=FIC2');
    expect(screen.getByText('detail of FIC2')).toBeTruthy();
  });

  it('each limit count opens the loops behind it, and Clear returns', () => {
    loops = [
      loop('A1', { tags: {} }),                                        // VP expected, not mapped
      loop('A2'),                                                      // VP mapped
      loop('A3', { tags: {}, engineering: { vpApplicability: 'NOT_APPLICABLE' } as CpmLoop['engineering'] }),
      loop('A4', { tags: {}, isActive: false }),                       // retired: not counted by the server
      loop('B1', { links: [{ toLoopId: 'A2', relType: 'UPSTREAM', origin: 'x' } as CpmLoop['links'][number]] }),
    ];
    open('/cpm/registry?page=1');
    fireEvent.click(screen.getByRole('link', { name: /236 valve positions/ }));
    expect(screen.getByTestId('where').textContent).toContain('gap=vp');
    expect(screen.getAllByRole('link', { name: /^A\d$/ }).map(a => a.textContent)).toEqual(['A1']);
    expect(screen.getByText(/Loops with a valve position expected but not mapped/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('where').textContent).not.toContain('gap=');
    fireEvent.click(screen.getByRole('link', { name: /241 peer links/ }));
    expect(screen.getByTestId('where').textContent).toContain('gap=peers');
    expect(screen.queryByRole('link', { name: 'B1' })).toBeNull();
    expect(screen.getByRole('link', { name: 'A1' })).toBeTruthy();
  });

  it('counts degraded loops, lists them with ?gap=degraded, and Clear returns', () => {
    loops = [loop('GOOD'), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} }), loop('OFF', { monitoringEnabled: false })];
    open('/cpm/registry?page=1');
    fireEvent.click(screen.getByRole('link', { name: /^[0-9]+ degraded$/ }));
    expect(screen.getByTestId('where').textContent).toContain('gap=degraded');
    expect(screen.getAllByRole('link', { name: /^(GOOD|DEG|OFF)$/ }).map(a => a.textContent)).toEqual(['DEG']);
    expect(screen.getByText(/Loops with a readiness gap/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('where').textContent).not.toContain('gap=');
  });

  it('shows one pill beside the name only for an abnormal state', () => {
    loops = [
      loop('GOOD'),
      loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} }),
      loop('OFF', { monitoringEnabled: false }),
      loop('OLD', { isActive: false }),
    ];
    open('/cpm/registry?retired=1');
    const rowOf = (id: string) => screen.getByRole('link', { name: id }).closest('tr')!;
    expect(within(rowOf('GOOD')).queryByText(/Degraded|Not monitored|Retired/)).toBeNull();
    expect(within(rowOf('DEG')).queryByText(/Degraded/)).toBeNull();
    expect(within(rowOf('OFF')).getByText('Not monitored')).toBeTruthy();
    expect(within(rowOf('OLD')).getByText('Retired')).toBeTruthy();
  });

  it('says how many retired loops are hidden', () => {
    loops = [loop('FIC1'), loop('OLD1', { isActive: false }), loop('OLD2', { isActive: false })];
    open('/cpm/registry');
    expect(screen.getByText('1 loop · 2 retired hidden')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    expect(screen.getByText('3 loops')).toBeTruthy();
  });

  it('starts at page 1 when Site changes, search changes or Show retired flips', () => {
    loops = Array.from({ length: 30 }, (_, i) => loop(`L${String(i).padStart(2, '0')}`));
    open('/cpm/registry?page=2');
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    fireEvent.click(screen.getByText('pick site'));
    expect(screen.getByTestId('where').textContent).not.toContain('page=');
    cleanup();
    open('/cpm/registry?page=2');
    fireEvent.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    expect(screen.getByTestId('where').textContent).not.toContain('page=');
    cleanup();
    open('/cpm/registry?page=2');
    fireEvent.change(screen.getByLabelText('Find loop'), { target: { value: 'L0' } });
    expect(screen.getByTestId('where').textContent).not.toContain('page=');
  });

  it('says so, with a retry, when the limits cannot be read', () => {
    const refetch = vi.fn();
    fleet = { data: undefined, isError: true, error: new Error('boom'), refetch };
    open('/cpm/registry');
    expect(screen.getByText('Configuration limits unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('opens the loop from a click anywhere on the row', () => {
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('link', { name: 'FIC2' }).closest('tr')!.querySelectorAll('td')[1]);
    expect(screen.getByTestId('where').textContent).toContain('loop=FIC2');
  });

  it('starts at page 1 when Area or Unit changes (B10)', () => {
    loops = Array.from({ length: 30 }, (_, i) => loop(`L${String(i).padStart(2, '0')}`));
    for (const k of ['area', 'unit']) {
      open('/cpm/registry?page=2');
      expect(screen.getByText('Page 2 of 2')).toBeTruthy();
      fireEvent.click(screen.getByText(`pick ${k}`));
      expect(screen.getByTestId('where').textContent).not.toContain('page=');
      cleanup();
    }
  });

  it('keeps the page in the address on first load, with the scope already set (B10)', () => {
    loops = Array.from({ length: 30 }, (_, i) => loop(`L${String(i).padStart(2, '0')}`));
    open('/cpm/registry?site=hdpe&area=A1&unit=U1&page=2');
    expect(screen.getByText('Page 2 of 2')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toContain('page=2');
  });

  it('opens a loop once when the link itself is clicked, so Back returns to the list (B10)', () => {
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('link', { name: 'FIC1' }));
    expect(screen.getByTestId('where').textContent).toContain('loop=FIC1');
    fireEvent.click(screen.getByText('history back'));
    expect(screen.getByTestId('where').textContent).not.toContain('loop=');
  });

  it('says 1 loop, not 1 loops (B16)', () => {
    loops = [loop('ONLY')];
    open('/cpm/registry');
    expect(screen.getByText('1 loop')).toBeTruthy();
  });
});
