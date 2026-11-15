// CHG-168 (owner review, the approved sample and the answers of 11 Nov): the header is the eyebrow and the title (no ?) with
// How to read, Bulk import and Add loop; one filter row inside the list card, search first, then ONE dropdown (Not retired n ·
// With retired n · the three limit counts), Export CSV; the shared pager, centred.
// CHG-201 (owner-approved mockup, 15 Nov 2026): the list is the whole page, no side panel. A row opens the loop's own page
// (/cpm/registry/:loopId) with the list's address kept, so "‹ All loops" returns to the same list; an old ?loop= link lands on
// the loop's page. The plant names are read once; nothing is read per row.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { LoopRegistry } from './LoopRegistry';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./AddLoopWizard', () => ({ default: () => <div>wizard</div> }));
vi.mock('./BulkImportDialog', () => ({ default: () => <div>import</div> }));
const download = vi.fn();
vi.mock('../../utils/csv', () => ({ downloadTextFile: (...a: unknown[]) => download(...a) }));
let plantReads = 0;
const locations = {
  sites: [{ contextualPath: 'hdpe', name: 'HDPE Plant', type: 1 }],
  areas: [{ contextualPath: 'hdpe/A1', name: 'Section 100', type: 2 }],
  units: [{ contextualPath: 'hdpe/A1/U1', name: '1001-Polymerization Reactor 1', type: 3 }],
};
vi.mock('./plantLocation', async orig => ({
  ...(await orig<typeof import('./plantLocation')>()),
  usePlantLocations: () => { plantReads += 1; return { data: locations }; },
}));

const P = 'hdpe/A1/U1';
const loop = (id: string, over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: id, assetId: null, displayName: `${id} service`, site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}/${id}.pv`, SP: `${P}/${id}.sp`, OP: `${P}/${id}.op`, MODE: `${P}/${id}.mode`, VP: `${P}/${id}.vp` },
  observabilityFlags: [], links: [], stepTestApproved: false, thresholdProfileId: 'prof-1', model: null, ...over,
} as CpmLoop);

let loops: CpmLoop[] = [];
let loading = false;
const readinessReads = vi.fn();
vi.mock('../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: loading ? undefined : { loops }, isLoading: loading, isError: false, error: null, refetch: vi.fn() }),
  useFleetSummary: () => fleet,
  useCpmReadiness: (...a: unknown[]) => { readinessReads(...a); return {}; },
}));
const okFleet = { data: { capability: { loopsCappedByMissingVp: 236, loopsWithoutDisturbanceContext: 241, vpNotApplicable: 1 } }, isError: false, error: null, refetch: vi.fn() };
let fleet: Record<string, unknown> = okFleet;

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const SetScope = ({ k, v }: { k: string; v: string }) => { const [, set] = useSearchParams(); return <button onClick={() => set(p => { p.set(k, v); return p; })}>pick {k}</button>; };
const open = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/cpm/registry" element={<LoopRegistry />} />
      <Route path="/cpm/registry/:loopId" element={<div>page of the loop</div>} />
    </Routes>
    <Where /><SetScope k="site" v="hdpe" /><SetScope k="area" v="A1" /><SetScope k="unit" v="U1" />
  </MemoryRouter>,
);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const where = () => screen.getByTestId('where').textContent!;
const shown = () => screen.getByLabelText('Loops shown') as HTMLSelectElement;
const ids = () => screen.queryAllByRole('link', { name: /^[A-Z0-9-]+$/ }).map(a => a.textContent);
const many = (n: number) => Array.from({ length: n }, (_, i) => loop(`L${String(i).padStart(2, '0')}`));
const rowOf = (id: string) => screen.getByRole('link', { name: id }).closest('tr')!;

beforeEach(() => {
  fleet = okFleet; loading = false; loops = [loop('FIC1'), loop('FIC2', { loopType: 'PIC' })]; asUser(['cpm.manage']);
  download.mockReset(); readinessReads.mockReset(); plantReads = 0;
});
afterEach(cleanup);

describe('LoopRegistry header', () => {
  it('is the eyebrow and the title, no ?, with How to read, Bulk import and Add loop', () => {
    open('/cpm/registry');
    expect(screen.getByText('Set up')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loop Registry');
    expect(screen.queryByRole('button', { name: 'Loop Registry' })).toBeNull();
    for (const name of ['How to read', 'Bulk import', 'Add loop']) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('How to read holds State and Ready for analysis in the list’s words, no gate code', () => {
    fleet = { ...okFleet, data: { capability: { ...okFleet.data.capability, vpNotInstalled: 2 } } };
    open('/cpm/registry');
    fireEvent.click(screen.getByRole('button', { name: 'How to read' }));
    const dlg = screen.getByRole('dialog', { name: 'How to read' });
    expect(within(dlg).getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['State', 'Ready for analysis']);
    for (const word of ['Not monitored', 'Retired', 'Degraded', 'Ready', '2 items to set', 'Plant facts, nothing to fix']) expect(within(dlg).getByText(word)).toBeTruthy();
    expect(within(dlg).getByText('2 with no valve position signal fitted · 1 with no valve.')).toBeTruthy();
    expect(dlg.textContent).not.toMatch(/G1[34]|\bVP\b|Mapped|peer links/);
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
  it('is one full-width table with no side panel: Loop, Type, Plant unit, Valve position, Ready for analysis', () => {
    open('/cpm/registry');
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Loop', 'Type', 'Plant unit', 'Valve position?', 'Ready for analysis', 'Open the loop']);
    expect(screen.queryByRole('heading', { name: 'Choose a loop' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(within(rowOf('FIC2')).getByText('Pressure')).toBeTruthy();
    expect(within(rowOf('FIC1')).getByText('1001 · Polymerization Reactor 1')).toBeTruthy();
  });

  it('reads the plant names once and nothing per row', () => {
    loops = many(20);
    open('/cpm/registry');
    expect(plantReads).toBeGreaterThan(0);
    expect(readinessReads).not.toHaveBeenCalled();
  });

  it('puts the search first in one filter row, then the dropdown and Export CSV', () => {
    open('/cpm/registry');
    const row = screen.getByRole('group', { name: 'Loop filters' });
    const controls = Array.from(row.querySelectorAll('input, select, button')).map(e => e.getAttribute('aria-label') ?? e.textContent);
    expect(controls).toEqual(['Find loop', 'Loops shown', 'Export CSV']);
    expect((screen.getByLabelText('Find loop') as HTMLInputElement).placeholder).toBe('Search loop, description or unit');
  });

  it('finds a loop by its unit name as shown', () => {
    loops = [loop('FIC1'), loop('FIC2', { unit: 'U9' })];
    open('/cpm/registry?search=polymerization');
    expect(ids()).toEqual(['FIC1']);
  });

  it('counts each choice in the dropdown, from the list and the server summary, whatever the search', () => {
    loops = [loop('FIC1'), loop('OLD1', { isActive: false }), loop('DEG', { observabilityFlags: ['NO_VP'], tags: {} })];
    open('/cpm/registry?search=FIC');
    expect(Array.from(shown().options).map(o => o.textContent)).toEqual([
      'Not retired 2', 'With retired 3', 'Valve position not connected 236', 'No linked loops 241', 'Degraded 1',
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
    expect(within(rowOf('OLD')).getByText('Retired')).toBeTruthy();
    expect(within(rowOf('OLD')).getByText('⊘')).toBeTruthy();
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

  it('says so, with a retry beside the dropdown, when the limits cannot be read', () => {
    const refetch = vi.fn();
    fleet = { data: undefined, isError: true, error: new Error('boom'), refetch };
    open('/cpm/registry');
    const row = screen.getByRole('group', { name: 'Loop filters' });
    expect(within(row).getByText('Configuration limits unavailable')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(Array.from(shown().options).map(o => o.textContent)).toContain('Valve position not connected');
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

  it('says no internal code, gate code, slug or path anywhere on the list', () => {
    loops = [
      loop('FIC10401', { displayName: 'Flow controller FIC10401 (FCS0101)', tags: {}, model: { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE', acquisition: { mode: 'PERIODIC' }, classificationSource: 'PRESET_FROM_LOOP_TYPE' } }),
      loop('OFF_1', { monitoringEnabled: false, unit: 'u_unknown_unit' }),
    ];
    open('/cpm/registry?retired=1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Valve position' })[0]);   // the head's (CHG-203: each card has one too)
    const text = document.querySelector('.cpm-registry')!.textContent!.replace(/OFF_1/g, '');   // the page, not the test's address probe
    expect(text).toContain('Not fitted: the valve has no position signal.');
    expect(text).not.toMatch(/[A-Za-z0-9]_[A-Za-z0-9]|G13|G14|FAST_SELF_REG|OP_TO_VALVE|PRESET|\w+\/\w+\/\w/);   // a path has two slashes
  });
});

describe('LoopRegistry opens a loop on its own page', () => {
  it('from anywhere on its row, keeping the list address (search, choice, page, scope)', () => {
    loops = many(30);
    open('/cpm/registry?search=L&retired=1&page=2&site=hdpe');
    fireEvent.click(rowOf('L27').querySelectorAll('td')[1]);
    expect(where()).toBe('/cpm/registry/L27?search=L&retired=1&page=2&site=hdpe');
    expect(screen.getByText('page of the loop')).toBeTruthy();
  });

  it('with Enter on a focused row', () => {
    open('/cpm/registry?search=FIC');
    fireEvent.keyDown(rowOf('FIC2'), { key: 'Enter' });
    expect(where()).toBe('/cpm/registry/FIC2?search=FIC');
  });

  it('when an old link names the loop with ?loop=, keeping the rest of its address', () => {
    open('/cpm/registry?loop=FIC2&site=hdpe');
    expect(where()).toBe('/cpm/registry/FIC2?site=hdpe');
    expect(screen.getByText('page of the loop')).toBeTruthy();
  });
});
