// Task 24: /cpm/registry?loop=X is a page of its own: facts, signal mapping, readiness, loop model and actions.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../AddLoopWizard', () => ({ default: (p: { editLoop?: CpmLoop }) => <div>wizard {p.editLoop?.loopId}</div> }));
vi.mock('../config/GateRolePolicy', () => ({ GateRolePolicy: () => <div>gate role policy</div> }));
vi.mock('./RetireLoopDialog', () => ({
  RetireLoopDialog: (p: { mode: string; onDone: (r: unknown) => void }) => (
    <div role="dialog">{p.mode} dialog
      <button onClick={() => p.onDone({ loopId: 'FIC1', retired: p.mode === 'retire', changed: false, note: 'Already retired' })}>finish</button>
      <button onClick={() => p.onDone({ loopId: 'FIC1', retired: p.mode === 'retire', changed: true, note: null })}>done</button>
    </div>),
}));

let loops: CpmLoop[] = [];
let readiness: Partial<CpmReadiness> | undefined;
let events: unknown[] = [];
let eventsError = false;
const eventsArgs: unknown[][] = [];
vi.mock('../../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCpmReadiness: () => ({ data: readiness }),
  useCpmEvents: (...a: unknown[]) => { eventsArgs.push(a); return { data: { events }, isError: eventsError }; },
  useRepublishEvidence: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { LoopDetail } from './LoopDetail';

const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC1', assetId: null, displayName: 'FIC1 Feed flow', site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'high', isActive: true, monitoringEnabled: true,
  tags: { PV: 'hdpe/A1/U1/fic1.pv', SP: 'hdpe/A1/U1/fic1.sp', VP: 'hdpe/A1/U1/fic1.vp' },
  observabilityFlags: [], links: [{ toLoopId: 'FIC2', relType: 'UPSTREAM', origin: 'x' }],
  stepTestApproved: false, thresholdProfileId: 'prof-1',
  model: { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE',
    acquisition: { mode: 'PERIODIC', gridSeconds: 5 }, classificationSource: 'PRESET_FROM_LOOP_TYPE' },
  ...over,
} as CpmLoop);

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const open = (id = 'FIC1', onBack = vi.fn()) =>
  render(<MemoryRouter><LoopDetail loopId={id} onBack={onBack} /><Where /></MemoryRouter>);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});

beforeEach(() => { loops = [loop()]; readiness = undefined; events = []; eventsError = false; eventsArgs.length = 0; asUser(['cpm.manage', 'asset.view']); });
afterEach(cleanup);

describe('LoopDetail', () => {
  it('shows tag, service, state and only useful facts', () => {
    open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('FIC1');
    expect(screen.getByText('Feed flow')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    for (const label of ['Criticality', 'Gate profile', 'Acquisition', 'Valve position', 'Peer links', 'Plant path'])
      expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('prof-1')).toBeTruthy();
    expect(screen.getByText('PERIODIC · 5 s grid')).toBeTruthy();
    expect(screen.getByText('UPSTREAM → FIC2')).toBeTruthy();
    expect(screen.getByText('hdpe / A1 / U1')).toBeTruthy();
    expect(screen.queryByText('Assigned profile')).toBeNull();
    expect(screen.queryByText(/G9 geometry/)).toBeNull();
    expect(screen.queryByText(/preset from loop type/)).toBeNull();
  });

  it('lists the signal mapping with a Copy for each path', () => {
    open();
    const table = screen.getByRole('table', { name: 'Signal mapping' });
    expect(within(table).getByText('hdpe/A1/U1/fic1.pv')).toBeTruthy();
    expect(within(table).getAllByRole('button', { name: /^Copy / }).length).toBe(3);
  });

  it('lists readiness as specific missing fields', () => {
    readiness = { ready: false, checks: [
      { id: 'tag_op', label: 'OP tag', ok: false, message: 'No OP path is mapped' },
      { id: 'tag_pv', label: 'PV tag', ok: true, message: null },
    ], blockers: [], warnings: [] };
    open();
    const sect = screen.getByRole('region', { name: 'Readiness' });
    expect(within(sect).getByText('OP tag')).toBeTruthy();
    expect(within(sect).getByText('No OP path is mapped')).toBeTruthy();
    expect(within(sect).queryByText('PV tag')).toBeNull();
  });

  it('says nothing is missing when every check passes', () => {
    readiness = { ready: true, checks: [{ id: 'tag_pv', label: 'PV tag', ok: true, message: null }], blockers: [], warnings: [] };
    open();
    expect(within(screen.getByRole('region', { name: 'Readiness' })).getByText('Nothing missing')).toBeTruthy();
  });

  it('keeps VP states apart', () => {
    const vp = (l: CpmLoop) => {
      loops = [l];
      const r = open();
      const v = screen.getByText('Valve position').nextElementSibling!.textContent;
      r.unmount();
      return v;
    };
    expect(vp(loop())).toMatch(/^Applicable · mapped/);
    expect(vp(loop({ tags: { PV: 'a/b/c.pv' } }))).toMatch(/^Expected · not mapped: G14 cannot confirm a final-element fault/);
    expect(vp(loop({ tags: {}, engineering: { vpApplicability: 'NOT_APPLICABLE' } as CpmLoop['engineering'] }))).toMatch(/^Not applicable/);
    expect(vp(loop({ tags: {}, engineering: { vpApplicability: 'NOT_INSTALLED' } as CpmLoop['engineering'] }))).toMatch(/^Not installed/);
  });

  it('offers Edit and Retire to cpm.manage only, with the reason on the disabled button', () => {
    asUser([]);
    open();
    expect((screen.getByRole('button', { name: 'Edit configuration' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Retire' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(3);
  });

  it('opens the editor from Edit configuration', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByText('wizard FIC1')).toBeTruthy();
  });

  it('opens the retire dialog, then shows Restore for a retired loop and the note of a no-op', () => {
    const r = open();
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    expect(screen.getByText('retire dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'finish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Already retired')).toBeTruthy();
    r.unmount();
    loops = [loop({ isActive: false })];
    open();
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByText('restore dialog')).toBeTruthy();
  });

  it('shows a retired loop with its history links and its open episode marked', () => {
    loops = [loop({ isActive: false })];
    events = [{ id: 7, family: 'STICTION', opened_at: '2026-11-06T10:00:00Z', condition_state: 'OPEN' }];
    open();
    expect(screen.getAllByText('Loop retired').length).toBe(1);
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Open episode')).toBeTruthy();
    expect(eventsArgs.at(-1)).toEqual([{ loopId: 'FIC1', openOnly: true, includeShelved: true, limit: 1, sort: 'recent' }, 30_000, true]);
    fireEvent.click(screen.getByRole('button', { name: /^Evidence/ }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/evidence?loop=FIC1');
  });

  it('opens Loop Explorer from Open loop', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Open loop/ }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/explorer?loop=FIC1');
  });

  it('shows the effective rules link to cpm.config.read only, and the plant tree link to asset.view', () => {
    open();
    expect(screen.queryByRole('button', { name: /Effective rules/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Plant tree/ })).toBeTruthy();
    cleanup();
    asUser(['cpm.manage', 'cpm.config.read']);
    open();
    expect(screen.getByRole('button', { name: /Effective rules/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Plant tree/ })).toBeNull();
  });

  it('shows a clear state for an unknown loop, with the way back to the list', () => {
    const onBack = vi.fn();
    open('NOPE', onBack);
    expect(screen.getByText('No loop NOPE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '‹ Loop Registry' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('resolves the loop case-insensitively and renders the gate role policy', () => {
    open('fic1');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('FIC1');
    expect(screen.getByText('gate role policy')).toBeTruthy();
  });

  it('does not read the open episode of an active loop', () => {
    open();
    expect(eventsArgs.at(-1)?.[2]).toBe(false);
  });

  it('disables Edit on a retired loop and says to restore first', () => {
    loops = [loop({ isActive: false })];
    open();
    expect((screen.getByRole('button', { name: 'Edit configuration' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Restore the loop first')).toBeTruthy();
  });

  it('disables Re-project without cpm.manage, with the reason', () => {
    asUser(['cpm.read']);
    open();
    expect((screen.getByRole('button', { name: /Re-project/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(3);
  });

  it('says so when the open episode of a retired loop could not be read', () => {
    loops = [loop({ isActive: false })];
    eventsError = true;
    open();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it('shows the G13 consequence when peers are expected but absent', () => {
    loops = [loop({ links: [] })];
    open();
    expect(screen.getByText(/None · expected: G13 not evaluated/)).toBeTruthy();
  });

  it('reads Retired at once after a successful retire, before the list refetch lands', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
  });
});
