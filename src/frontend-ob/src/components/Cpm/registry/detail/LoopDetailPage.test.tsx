// CHG-201 (owner-approved mockup, 15 Nov 2026): a loop's own page under the Loop Registry. "‹ All loops" back to the list it
// came from, the tag and its description, the state and readiness pills, Edit loop (the one primary) · Retire / Restore loop ·
// Resend to analysis; then Where it is, How it is controlled, Signals, Ready for analysis, Analysis settings, Linked loops and
// Changes, all in plain words. It reads its loop, its readiness once and the plant names (cached); a loop that does not exist
// says so with "‹ All loops".
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../../store/authStore';
import { ApiError } from '../../../../api/apiFetch';
import type { CpmLoop, CpmReadiness } from '../../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, title: p.title }, p.children),
}));
vi.mock('../../AddLoopWizard', () => ({ default: (p: { editLoop?: CpmLoop }) => <div role="dialog" aria-label="Edit loop">editor of {p.editLoop?.loopId}</div> }));
vi.mock('../RetireLoopDialog', () => ({
  RetireLoopDialog: (p: { mode: string; onDone: (r: unknown) => void }) => (
    <div role="dialog" aria-label={`${p.mode} dialog`}>
      <button onClick={() => p.onDone({ loopId: 'FIC10401', retired: p.mode === 'retire', changed: true, note: null })}>done</button>
    </div>),
}));
const locations = {
  sites: [{ contextualPath: 'hdpe', name: 'HDPE Plant', type: 1 }],
  areas: [{ contextualPath: 'hdpe/section_600', name: 'Section 600', type: 2 }],
  units: [{ contextualPath: 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5', name: '6002-Pellet Homogenization II Silo 4 & 5', type: 3 }],
};
vi.mock('../../plantLocation', async orig => ({
  ...(await orig<typeof import('../../plantLocation')>()),
  usePlantLocations: () => ({ data: locations }),
}));

const P = 'hdpe/section_600/u6002_pellet_homogenization_ii_silo_4_5/fic10401';
const MODEL = { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE', commandPath: 'OP_TO_VALVE',
  acquisition: { mode: 'PERIODIC' }, classificationSource: 'PRESET_FROM_LOOP_TYPE' };
const base = (over: Partial<CpmLoop> = {}): CpmLoop => ({
  loopId: 'FIC10401', assetId: null, displayName: 'Flow controller FIC10401 (FCS0101)', site: 'hdpe', area: 'section_600',
  unit: 'u6002_pellet_homogenization_ii_silo_4_5', loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: `${P}.pv`, SP: `${P}.sp`, OP: `${P}.op`, MODE: `${P}.mode` }, observabilityFlags: ['NO_VP', 'NO_UPSTREAM_LINKS'], links: [],
  stepTestApproved: false, thresholdProfileId: null, engineering: { opMin: 0, opMax: 100, pvMin: 0, pvMax: 2500, pvUnit: 'kg/h' },
  timezone: 'UTC', model: MODEL, createdAt: '2026-08-31T12:00:00Z', updatedAt: '2026-11-04T12:00:00Z', ...over,
} as CpmLoop);
const READY: Partial<CpmReadiness> = {
  checks: [
    { id: 'evidence_short', label: 'Short features produced', ok: true, message: null },
    { id: 'cplm_jobs', label: 'CPLM Flink jobs running', ok: false, message: 'One or more CPLM jobs are not running — see Pipeline Health.' },
    { id: 'peer_links', label: 'Peer / upstream links (G13)', ok: false, message: 'Add the links', state: 'EXPECTED_UNMAPPED' },
  ],
  evidence: { shortFeatures: 10, longFeatures: 1, verdicts: 1 },
};

let loopQuery: { data?: CpmLoop; isLoading?: boolean; isError?: boolean; error?: unknown; refetch?: () => void } = {};
let readiness: { data?: Partial<CpmReadiness>; isLoading?: boolean; isError?: boolean; error?: unknown; refetch?: () => void } = {};
let events: unknown[] = [];
const loopReads = vi.fn();
const readinessReads = vi.fn();
const listReads = vi.fn();
const republish = vi.fn();
vi.mock('../../../../hooks/useCpm', () => ({
  useCpmLoop: (id: string) => { loopReads(id); return loopQuery; },
  useCpmLoops: () => { listReads(); return { data: undefined }; },
  useCpmReadiness: (id?: string) => { readinessReads(id); return readiness; },
  useCpmEvents: (_q: unknown, _ms: unknown, enabled: boolean) => ({ data: enabled ? { events } : undefined, isError: false, refetch: vi.fn() }),
  useRepublishEvidence: () => ({ mutate: republish, isPending: false }),
}));

import { LoopDetailPage } from './LoopDetailPage';

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div>; };
const open = (url = '/cpm/registry/FIC10401?search=fic&page=2') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/cpm/registry" element={<div>the list</div>} />
      <Route path="/cpm/registry/:loopId" element={<LoopDetailPage />} />
    </Routes>
    <Where />
  </MemoryRouter>,
);
const asUser = (permissions: string[]) => useAuthStore.setState({
  user: { user_id: 'u', username: 'u', email: '', role: 'Engineer', is_active: true, permissions }, status: 'authenticated', accessToken: 't',
});
const card = (name: string) => screen.getByRole('region', { name });
/** label → value of a section's rows. */
const facts = (name: string) => Object.fromEntries([...card(name).querySelectorAll('.cpm-reg-kv')].map(r => [r.children[0].textContent, r.children[1].textContent]));
const where = () => screen.getByTestId('where').textContent;
const pageText = () => document.querySelector('.cpm-reg-detail-page')!.textContent!;

beforeEach(() => {
  loopQuery = { data: base() }; readiness = { data: READY }; events = [];
  loopReads.mockReset(); readinessReads.mockReset(); listReads.mockReset(); republish.mockReset();
  asUser(['cpm.manage', 'cpm.config.read']);
});
afterEach(cleanup);

describe('LoopDetailPage header', () => {
  it('goes back to the list it came from, and names the loop by its tag, its description and its state', () => {
    open();
    expect(screen.getByRole('link', { name: 'All loops' }).getAttribute('href')).toBe('/cpm/registry?search=fic&page=2');
    expect(screen.getByRole('link', { name: 'All loops' }).textContent).toBe('‹ All loops');
    expect(screen.getByText('Set up · Loop Registry')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('FIC10401');
    expect(screen.getByText('Flow controller · FCS0101')).toBeTruthy();
    const pills = [...document.querySelectorAll('.cpm-reg-detail-head__pills .cpm-pill')].map(p => p.textContent);
    expect(pills).toEqual(['Monitoring on', '!2 items to set']);
  });

  it('offers Edit loop as the one primary, Retire loop and Resend to analysis with its ?', () => {
    open();
    for (const name of ['Edit loop', 'Retire loop', 'Resend to analysis']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'About resending' }));
    expect(screen.getByText('Sends this loop’s settings to the analysis again, after a change.')).toBeTruthy();
  });

  it('reads its loop and its readiness once, and not the whole registry list', () => {
    open();
    expect(loopReads).toHaveBeenCalledWith('FIC10401');
    expect(new Set(readinessReads.mock.calls.map(c => c[0]))).toEqual(new Set(['FIC10401']));
    expect(listReads).not.toHaveBeenCalled();
  });
});

describe('LoopDetailPage sections', () => {
  it('lays the cards out in the approved order', () => {
    open();
    expect([...document.querySelectorAll('.cpm-reg-detail section h2')].map(h => h.textContent)).toEqual([
      'Where it is', 'How it is controlled', 'Signals', 'Ready for analysis', 'Analysis settings', 'Linked loops', 'Changes',
    ]);
  });

  it('says where the loop is by the plant model names, with its control station and time zone', () => {
    open();
    expect(facts('Where it is')).toEqual({
      Plant: 'HDPE Plant', Area: 'Section 600', Unit: '6002 · Pellet Homogenization II Silo 4 & 5', 'Control station': 'FCS0101', 'Times shown in': 'UTC',
    });
  });

  it('leaves the control station out when the description names none', () => {
    loopQuery = { data: base({ displayName: 'Reactor feed flow' }) };
    open();
    expect(facts('Where it is')['Control station']).toBeUndefined();
  });

  it('says how the loop is controlled in the editor’s words, and where that came from', () => {
    open();
    expect(facts('How it is controlled')).toEqual({
      'Loop type': 'Flow', 'Final element': 'Control valve', 'Control structure': 'Single loop', 'Control goal': 'Tight control',
      'Process behaviour': 'Fast, settles on its own', Criticality: 'Medium',
    });
    expect(within(card('How it is controlled')).getByText('Set from the loop type. Change it in Edit loop.')).toBeTruthy();
    cleanup();
    loopQuery = { data: base({ model: { ...MODEL, objectiveType: 'AVERAGING', classificationSource: 'EXPLICIT' } as CpmLoop['model'] }) };
    open();
    expect(facts('How it is controlled')['Control goal']).toBe('Averaging (smooth changes)');
    expect(within(card('How it is controlled')).getByText('Set by a person.')).toBeTruthy();
  });

  it('lists each signal with its source tag, unit, range and whether data arrives', () => {
    loopQuery = { data: base({ sourceTags: { PV: '10-FIC-401.PV' } }) };
    open();
    const rows = [...card('Signals').querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent));
    expect(rows).toEqual([
      ['PVProcess value', '10-FIC-401.PV', 'kg/h', '0 – 2,500', 'Receiving data'],
      ['SPSetpoint', 'FIC10401.SP', 'kg/h', '0 – 2,500', 'Receiving data'],
      ['OPController output', 'FIC10401.OP', '%', '0 – 100', 'Receiving data'],
      ['ModeAuto, manual or cascade', 'FIC10401.MODE', '—', '—', 'Receiving data'],
      ['VPValve position', 'Not connected', '—', '—', '!Expected'],
    ]);
    expect([...card('Signals').querySelectorAll('.cpm-reg-swatch')].map(s => s.getAttribute('data-pen'))).toEqual(['pv', 'sp', 'op', 'mode', 'vp']);
  });

  it('says when the readiness cannot be read, with a retry, and keeps the signals', () => {
    const refetch = vi.fn();
    readiness = { isError: true, error: new Error('boom'), refetch };
    open();
    expect(within(card('Signals')).getByText('Whether data arrives could not be read.')).toBeTruthy();
    fireEvent.click(within(card('Signals')).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
    expect(within(card('Signals')).getByText('FIC10401.PV')).toBeTruthy();
  });

  it('lists what is ready and what is missing with why, from the shared rule, never a system-wide condition', () => {
    open();
    const sect = card('Ready for analysis');
    expect(within(sect).getByText('2 items to set')).toBeTruthy();
    const items = [...sect.querySelectorAll('li')].map(li => li.textContent);
    expect(items).toEqual([
      '✓Done: Process value, setpoint, output and mode connected', '✓Done: Units and ranges set',
      '!To set: Valve position not connectedThe valve checks (sticking, wear) need it. Connect it in Edit loop, or mark the valve position as not fitted.',
      '!To set: No linked loopsLink its interacting loops in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop.',
    ]);
    expect(pageText()).not.toMatch(/Flink|jobs|Pipeline Health/);
  });

  it('shows the analysis settings, Gate Configuration as a link for those who may read it', () => {
    open();
    expect(facts('Analysis settings')).toEqual({
      'Assessment settings': 'Standard Gate Configuration ↗', 'Step tests': 'Not allowed', 'Data arrives': 'At regular intervals', Monitoring: 'On',
    });
    expect(within(card('Analysis settings')).getByRole('link', { name: 'Gate Configuration ↗' }).getAttribute('href')).toBe('/cpm/config/loops/FIC10401');
    cleanup();
    asUser(['cpm.manage']);
    loopQuery = { data: base({ thresholdProfileId: 'Reactor feeds', stepTestApproved: true }) };
    open();
    expect(facts('Analysis settings')['Assessment settings']).toBe('Reactor feeds');
    expect(facts('Analysis settings')['Step tests']).toBe('Allowed');
  });

  it('says each linked loop in words with a link to its page, keeping the list address', () => {
    loopQuery = { data: base({ links: [{ toLoopId: 'FIC10402', relType: 'CASCADE_PRIMARY', origin: 'manual' }, { toLoopId: 'PIC2', relType: 'PEER', origin: 'asset-graph' }] }) };
    open();
    const sect = card('Linked loops');
    expect([...sect.querySelectorAll('li')].map(li => li.textContent)).toEqual(['Cascade master of FIC10402', 'Interacts with PIC2']);
    expect(within(sect).getByRole('link', { name: 'FIC10402' }).getAttribute('href')).toBe('/cpm/registry/FIC10402?search=fic&page=2');
  });

  it('says what to do when there are no linked loops, and nothing is expected of a stand-alone loop', () => {
    open();
    expect(within(card('Linked loops')).getByText('No linked loops yet: link them in the plant model, then use Resend to analysis.')).toBeTruthy();
    cleanup();
    loopQuery = { data: base({ engineering: { ...base().engineering, peerApplicability: 'NOT_APPLICABLE' } }) };
    open();
    expect(within(card('Linked loops')).getByText('A stand-alone loop: no linked loops are expected.')).toBeTruthy();
  });

  it('dates the changes in the app’s day style, and leaves the card out when the server sends no dates', () => {
    open();
    expect(facts('Changes')).toEqual({ Added: '31 Aug 2026', 'Last changed': '4 Nov 2026' });
    cleanup();
    loopQuery = { data: base({ createdAt: undefined, updatedAt: undefined }) };
    open();
    expect(screen.queryByRole('region', { name: 'Changes' })).toBeNull();
  });
});

describe('LoopDetailPage states', () => {
  it('a retired loop: Retired, Restore loop, Edit loop waits for the restore, its open episode kept', () => {
    loopQuery = { data: base({ isActive: false, monitoringEnabled: false }) };
    events = [{ id: 7, family: 'oscillation', opened_at: '2026-11-01T12:00:00Z' }];
    open();
    expect([...document.querySelectorAll('.cpm-reg-detail-head__pills .cpm-pill')].map(p => p.textContent)).toEqual(['⊘Retired']);
    expect(screen.getByRole('button', { name: 'Restore loop' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Edit loop' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Restore the loop first')).toBeTruthy();
    expect(facts('Changes')['Open episode']).toBe('Oscillation, open since 1 Nov 2026');
    expect(facts('Analysis settings').Monitoring).toBe('Off');
  });

  it('a loop that is not monitored: Monitoring off, and the checklist says how to turn it on', () => {
    loopQuery = { data: base({ monitoringEnabled: false }) };
    open();
    expect(screen.getByText('Monitoring off', { selector: '.cpm-reg-detail-head__pills *' })).toBeTruthy();
    expect(within(card('Ready for analysis')).getByText('The analysis skips this loop while monitoring is off. Turn it on in Edit loop.')).toBeTruthy();
    expect(facts('Analysis settings').Monitoring).toBe('Off');
  });

  it('a loop that does not exist says so plainly, with ‹ All loops', () => {
    loopQuery = { isError: true, error: new ApiError(404, 'Not Found', 'Loop is not registered') };
    open('/cpm/registry/NOPE?page=3');
    expect(screen.getByRole('heading', { name: 'No loop NOPE' })).toBeTruthy();
    expect(screen.getByText('It was renamed, removed or never added.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All loops' }).getAttribute('href')).toBe('/cpm/registry?page=3');
    expect(screen.queryByRole('button', { name: 'Edit loop' })).toBeNull();
  });

  it('says no internal code, gate code, slug, path or tag repeat anywhere on the page', () => {
    loopQuery = { data: base({ links: [{ toLoopId: 'FIC10402', relType: 'CASCADE_SECONDARY', origin: 'asset_graph' }] }) };
    readiness = { data: { checks: [...READY.checks!, { id: 'binding_provenance', label: 'Signal bindings resolve via asset-model', ok: false, message: 'Resolved by path fallback: pv' }] } };
    open();
    fireEvent.click(screen.getByRole('button', { name: 'About resending' }));
    fireEvent.click(screen.getByRole('button', { name: 'Signals' }));
    const text = pageText();
    expect(text).not.toMatch(/[A-Za-z0-9]_[A-Za-z0-9]|G13|G14|FAST_SELF_REG|OP_TO_VALVE|PRESET|\w+\/\w+\/\w|default|asset-graph/);   // a path has two slashes (kg/h is a unit)
    expect(text.match(/FIC10401(?!\.)/g)).toHaveLength(1);   // the title; the source tags name their signal
  });
});

describe('LoopDetailPage actions', () => {
  it('opens the existing editor on Edit loop', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit loop' }));
    expect(screen.getByRole('dialog', { name: 'Edit loop' }).textContent).toBe('editor of FIC10401');
  });

  it('opens the retire dialog and says what was done', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Retire loop' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'retire dialog' })).getByRole('button', { name: 'done' }));
    expect(screen.getByText(/^Retired FIC10401 by u at /)).toBeTruthy();
  });

  it('resends the loop to the analysis and says so in plain words', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Resend to analysis' }));
    expect(republish).toHaveBeenCalledWith('FIC10401', expect.anything());
    const { onSuccess } = republish.mock.calls[0][1] as { onSuccess: (r: unknown) => void };
    act(() => onSuccess({ loopId: 'FIC10401', republished: true, projected: 4, links: 0, signalAssets: 4 }));
    expect(screen.getByText(/^Sent FIC10401 to the analysis again by u at /)).toBeTruthy();
    expect(pageText()).not.toMatch(/broadcast|UNS|signal asset/);
  });

  it('starts the page of a linked loop afresh: no receipt or retire answer carried from the last loop', () => {
    loopQuery = { data: base({ links: [{ toLoopId: 'FIC10402', relType: 'PEER', origin: 'manual' }] }) };
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Retire loop' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'retire dialog' })).getByRole('button', { name: 'done' }));
    expect(screen.getByRole('button', { name: 'Restore loop' })).toBeTruthy();
    loopQuery = { data: base({ loopId: 'FIC10402', displayName: 'Next loop' }) };
    fireEvent.click(within(card('Linked loops')).getByRole('link', { name: 'FIC10402' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('FIC10402');
    expect(screen.getByRole('button', { name: 'Retire loop' })).toBeTruthy();
    expect(screen.queryByText(/^Retired /)).toBeNull();
  });

  it('keeps every action, disabled with its reason, without cpm.manage', () => {
    asUser([]);
    open();
    for (const name of ['Edit loop', 'Retire loop', 'Resend to analysis']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Needs the cpm.manage permission').length).toBe(3);
    expect(where()).toBe('/cpm/registry/FIC10401?search=fic&page=2');
  });
});
