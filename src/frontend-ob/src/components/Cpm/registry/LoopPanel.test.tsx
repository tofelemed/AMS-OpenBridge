// Task 24 / CHG-168 (owner review, the approved sample): the selected loop in the panel beside the list. The heading is the tag,
// the service under it and the state badge; rows; Readiness (VP and peer links once each, the server's advice behind ?, any
// other unmet check); Signals (pen colour, the path under the plant path, Copy); the actions; Record details · Workbench ↗ ·
// Effective rules ↗ · Plant tree ↗; the foot's Loop Explorer →.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('../AddLoopWizard', () => ({ default: (p: { editLoop?: CpmLoop }) => <div>wizard {p.editLoop?.loopId}</div> }));
vi.mock('./RetireLoopDialog', () => ({
  RetireLoopDialog: (p: { mode: string; onDone: (r: unknown) => void }) => (
    <div role="dialog">{p.mode} dialog
      <button onClick={() => p.onDone({ loopId: 'FIC1', retired: p.mode === 'retire', changed: false, note: 'Already retired' })}>finish</button>
      <button onClick={() => p.onDone({ loopId: 'FIC1', retired: p.mode === 'retire', changed: true, note: null })}>done</button>
    </div>),
}));

let loops: CpmLoop[] = [];
let readiness: { data?: Partial<CpmReadiness>; isLoading?: boolean; isError?: boolean; error?: unknown; refetch?: () => void } = {};
let events: unknown[] = [];
let eventsError = false;
const eventsArgs: unknown[][] = [];
const republish = vi.fn();
vi.mock('../../../hooks/useCpm', () => ({
  useCpmLoops: () => ({ data: { loops }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCpmReadiness: () => readiness,
  useCpmEvents: (...a: unknown[]) => { eventsArgs.push(a); return { data: { events }, isError: eventsError, refetch: vi.fn() }; },
  useRepublishEvidence: () => ({ mutate: republish, isPending: false }),
}));

import { LoopPanel } from './LoopPanel';

const P = 'hdpe/A1/U1';
const loop = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC1', assetId: null, displayName: 'FIC1 Feed flow', site: 'hdpe', area: 'A1', unit: 'U1', loopType: 'FIC',
  criticality: 'high', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}/fic1.pv`, SP: `${P}/fic1.sp`, OP: `${P}/fic1.op`, MODE: `${P}/fic1.mode`, VP: `${P}/fic1.vp` },
  observabilityFlags: [], links: [{ toLoopId: 'FIC2', relType: 'UPSTREAM', origin: 'x' }],
  stepTestApproved: false, thresholdProfileId: 'prof-1',
  model: { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE',
    acquisition: { mode: 'PERIODIC', gridSeconds: 5 }, classificationSource: 'PRESET_FROM_LOOP_TYPE' },
  ...over,
} as CpmLoop);
const VPX = 'A valve position (VP) is expected here: map its tag so a valve (stiction) cause can be confirmed (G14).';

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const open = (id = 'FIC1') => render(<MemoryRouter><LoopPanel loopId={id} open onClose={() => undefined} /><Where /></MemoryRouter>);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const where = () => screen.getByTestId('where').textContent;
const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => { loops = [loop()]; readiness = {}; events = []; eventsError = false; eventsArgs.length = 0; republish.mockReset(); asUser(['cpm.manage', 'asset.view']); });
afterEach(cleanup);

describe('LoopPanel heading and rows', () => {
  it('names the loop by its tag once, the service under it and its state', () => {
    open();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('FIC1');
    expect(screen.getByText('Feed flow')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    for (const [label, value] of [['Plant path', 'hdpe / A1 / U1'], ['Loop type', 'FIC'], ['Criticality', 'high'], ['Gate profile', 'prof-1'], ['Model', 'FLOW · FAST_SELF_REG']])
      expect(screen.getByText(label).nextElementSibling!.textContent).toBe(value);
    for (const gone of ['Facts', 'Loop model', 'Observability', 'Acquisition', 'Service', '‹ Loop Registry', 'Open loop →', 'Evidence →']) expect(screen.queryByText(gone)).toBeNull();
  });

  it('uses the list state word on the panel: Not monitored, not Registered', () => {
    loops = [loop({ monitoringEnabled: false })];
    open();
    expect(screen.getByText('Not monitored')).toBeTruthy();
    expect(screen.queryByText('Registered')).toBeNull();
  });

  it('resolves the loop case-insensitively', () => {
    open('fic1');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('FIC1');
  });

  it('says so for an unknown loop', () => {
    open('NOPE');
    expect(screen.getByRole('heading', { name: 'No loop NOPE' })).toBeTruthy();
    expect(screen.getByText('It was renamed, removed or never onboarded.')).toBeTruthy();
  });
});

describe('LoopPanel readiness', () => {
  it('says the valve position and the peer links once each, the server advice behind the ?', () => {
    loops = [loop({ tags: { PV: `${P}/fic1.pv` }, links: [] })];
    readiness = { data: { checks: [
      { id: 'tag_vp', label: 'Signal VP (valve position, G14)', ok: false, message: VPX, state: 'EXPECTED_UNMAPPED' },
      { id: 'peer_links', label: 'Peer / upstream links (G13)', ok: false, message: 'Add the links.', state: 'EXPECTED_UNMAPPED' },
    ] } };
    open();
    const sect = section('Readiness');
    expect(within(sect).getByText('Valve position (G14)').nextElementSibling!.textContent).toContain('Expected · not mapped');
    expect(within(sect).getByText('Peer links (G13)').nextElementSibling!.textContent).toContain('None · expected');
    expect(within(sect).queryByText('Signal VP (valve position, G14)')).toBeNull();
    expect(screen.queryByText(VPX)).toBeNull();
    fireEvent.click(within(sect).getByRole('button', { name: 'Valve position advice' }));
    expect(screen.getByText(VPX)).toBeTruthy();
  });

  it('shows the peer links themselves when the loop has some', () => {
    open();
    expect(within(section('Readiness')).getByText('UPSTREAM → FIC2')).toBeTruthy();
  });

  it('lists any other unmet check by name with its message, and Nothing missing when all pass', () => {
    readiness = { data: { checks: [
      { id: 'monitoring_enabled', label: 'Monitoring enabled', ok: false, message: 'Re-activate with enableMonitoring=true.' },
      { id: 'tag_pv', label: 'Signal PV', ok: true, message: null },
    ] } };
    const r = open();
    expect(within(section('Readiness')).getByText('Monitoring enabled').nextElementSibling!.textContent).toBe('Re-activate with enableMonitoring=true.');
    expect(within(section('Readiness')).queryByText('Signal PV')).toBeNull();
    r.unmount();
    readiness = { data: { checks: [{ id: 'tag_pv', label: 'Signal PV', ok: true, message: null }] } };
    open();
    expect(within(section('Readiness')).getByText('Nothing missing')).toBeTruthy();
  });

  it('says it is checking, or that readiness is unavailable with a retry', () => {
    readiness = { isLoading: true };
    const r = open();
    expect(screen.getByText('Checking readiness…')).toBeTruthy();
    r.unmount();
    const refetch = vi.fn();
    readiness = { isError: true, error: new Error('HTTP 500'), refetch };
    open();
    expect(screen.getByText('Readiness unavailable')).toBeTruthy();
    fireEvent.click(within(section('Readiness')).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps any other observability flag in a row of its own', () => {
    loops = [loop({ observabilityFlags: ['NO_UPSTREAM_LINKS', 'NO_PV_SPAN'] })];
    open();
    expect(within(section('Readiness')).getByText('Observability')).toBeTruthy();
    expect(within(section('Readiness')).getByText('No PV span declared')).toBeTruthy();
  });
});

describe('LoopPanel signals', () => {
  it('lists each role with its pen, the path under the plant path, the whole path on hover and in Copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    open();
    const sect = section('Signals');
    const pv = within(sect).getByText('…/fic1.pv');
    expect(pv.getAttribute('title')).toBe(`${P}/fic1.pv`);
    expect(sect.querySelectorAll('[data-pen]').length).toBe(5);
    expect(sect.querySelector('[data-pen="pv"]')).toBeTruthy();
    await act(async () => { fireEvent.click(within(sect).getByRole('button', { name: 'Copy PV path' })); });
    expect(writeText).toHaveBeenCalledWith(`${P}/fic1.pv`);
    expect(within(sect).getByText('Copied')).toBeTruthy();
  });

  it('says a required role is not mapped, with its advice', () => {
    loops = [loop({ tags: {} })];
    readiness = { data: { checks: [{ id: 'tag_pv', label: 'Signal PV', ok: false, message: 'Map the PV role at onboarding.' }] } };
    open();
    const sect = section('Signals');
    expect(within(sect).getAllByText('Not mapped').length).toBe(4);
    fireEvent.click(within(sect).getByRole('button', { name: 'PV advice' }));
    expect(screen.getByText('Map the PV role at onboarding.')).toBeTruthy();
    expect(within(sect).queryByText('No signal is mapped.')).toBeNull();
  });
});

describe('LoopPanel actions and links', () => {
  it('offers Edit, Retire and Re-project to cpm.manage only, each disabled one saying why', () => {
    asUser([]);
    open();
    for (const name of ['Edit configuration', 'Retire', 'Re-project links & republish evidence'])
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(3);
  });

  it('opens the editor from Edit configuration', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit configuration' }));
    expect(screen.getByText('wizard FIC1')).toBeTruthy();
  });

  it('retires, reads Retired at once, then offers Restore; a no-op shows its note', () => {
    const r = open();
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    fireEvent.click(screen.getByRole('button', { name: 'finish' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Already retired')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    fireEvent.click(screen.getByRole('button', { name: 'done' }));
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
    r.unmount();
    loops = [loop({ isActive: false })];
    open();
    expect((screen.getByRole('button', { name: 'Edit configuration' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Restore the loop first')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(screen.getByText('restore dialog')).toBeTruthy();
  });

  it('republishes the loop and keeps the long label the readiness advice names', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Re-project links & republish evidence' }));
    expect(republish).toHaveBeenCalledWith('FIC1', expect.anything());
    const { onSuccess } = republish.mock.calls[0][1] as { onSuccess: (r: unknown) => void };
    act(() => onSuccess({ loopId: 'FIC1', republished: true, projected: 1, links: 1, signalAssets: 5 }));
    expect(screen.getByText(/^Republished FIC1 by u at .*: 1 link\(s\) live on the broadcast, 5 signal asset\(s\) projected into the UNS\.$/)).toBeTruthy();
  });

  it('shows a retired loop with its open episode marked, read once', () => {
    loops = [loop({ isActive: false })];
    events = [{ id: 7, family: 'STICTION', opened_at: '2026-11-06T10:00:00Z', condition_state: 'OPEN' }];
    open();
    expect(screen.getByText('Retired')).toBeTruthy();
    expect(screen.getByText('Open episode')).toBeTruthy();
    expect(screen.getByText('Loop retired')).toBeTruthy();
    expect(eventsArgs.at(-1)).toEqual([{ loopId: 'FIC1', openOnly: true, includeShelved: true, limit: 1, sort: 'recent' }, 0, true]);
  });

  it('does not read the open episode of an active loop, and says so when a retired one could not be read', () => {
    const r = open();
    expect(eventsArgs.at(-1)?.[2]).toBe(false);
    r.unmount();
    loops = [loop({ isActive: false })];
    eventsError = true;
    open();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it('opens Record details as a dialog with objective, acquisition and how the model was set', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Record details' }));
    const dlg = screen.getByRole('dialog', { name: 'Record details' });
    expect(within(dlg).getByText('TIGHT · SINGLE · OP_TO_VALVE')).toBeTruthy();
    expect(within(dlg).getByText('PERIODIC · 5 s grid')).toBeTruthy();
    expect(within(dlg).getByText('The loop type')).toBeTruthy();
    expect(within(dlg).getByText('Declare it in Edit configuration to make it explicit.')).toBeTruthy();
  });

  it('opens the Workbench and, from the foot, the Loop Explorer', () => {
    const r = open();
    fireEvent.click(screen.getByRole('button', { name: 'Workbench ↗' }));
    expect(where()).toBe('/cpm/evidence?loop=FIC1');
    r.unmount();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Loop Explorer →' }));
    expect(where()).toBe('/cpm/explorer?loop=FIC1');
  });

  // CHG-153: Plant tree opens /admin/plant-model: the /admin/* guard (any administration permission) and the tab's asset.view
  it('shows Effective rules to cpm.config.read only, and Plant tree to asset.view with an administration right', () => {
    open();
    expect(screen.queryByRole('button', { name: /Effective rules/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Plant tree/ })).toBeNull();
    cleanup();
    asUser(['cpm.manage', 'asset.view', 'admin.users.edit']);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Plant tree ↗' }));
    expect(where()).toBe('/admin/plant-model?search=fic1');
    cleanup();
    asUser(['cpm.manage', 'cpm.config.read', 'admin.users.edit']);
    open();
    expect(screen.getByRole('button', { name: 'Effective rules ↗' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Plant tree/ })).toBeNull();
  });
});
