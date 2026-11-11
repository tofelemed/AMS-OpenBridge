// CHG-098 (SME review 2 #28): Next is blocked with the reason on screen; signal paths copy with a visible confirmation; the
// edit review shows only the changed settings with their effect; the fixed pipeline windows are help, not a step.
// CHG-168 (owner review, the approved sample and the answers of 11 Nov): a dialog titled "Add loop" / "Edit configuration" with
// tabs Identity · Classification · Signals · Review and "Next: X →" (forward only through Next, back any time); help behind ?;
// the ranges beside the signal paths; the review open; a Monitored switch (3a) and three valve-position choices (3b).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CpmLoop, CpmReadiness } from '../../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; disabled?: boolean; title?: string; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, title: p.title, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
const mutate = vi.fn();
let readiness: Partial<CpmReadiness> | undefined;
let activateError: Error | null = null;
vi.mock('../../../../hooks/useCpm', () => ({
  useCpmRegistryContract: () => ({ data: undefined }),
  useActivateLoop: () => ({ mutate, isPending: false, isError: !!activateError, error: activateError }),
  useCpmReadiness: (id?: string) => ({ data: id ? readiness : undefined }),
  useCpmResolutions: () => ({ data: undefined }),
}));
vi.mock('../../plantLocation', async (orig) => ({
  ...(await orig<typeof import('../../plantLocation')>()),
  PlantLocationPicker: () => null,
}));

import { AddLoopWizard } from '../../AddLoopWizard';

const loop = {
  loopId: '45FIC-109', assetId: null, displayName: 'Feed flow', site: 'marun', area: 'hdpe', unit: 'u45',
  loopType: 'FIC', criticality: 'medium', isActive: true, monitoringEnabled: true,
  tags: { PV: 'marun/hdpe/u45/45fic-109.pv', SP: 'marun/hdpe/u45/45fic-109.sp', OP: 'marun/hdpe/u45/45fic-109.op', MODE: 'marun/hdpe/u45/45fic-109.mode' },
  observabilityFlags: [], links: [], stepTestApproved: false, thresholdProfileId: null,
  engineering: { pvMin: 0, pvMax: 250, pvUnit: 'kg/h' },
} as unknown as CpmLoop;

const next = () => screen.getByRole('button', { name: /^Next: / }) as HTMLButtonElement;
const tab = (name: string) => screen.getByRole('tab', { name }) as HTMLButtonElement;
const pathInput = (role: string) => document.getElementById(`cpm-wizard-path-${role}`) as HTMLInputElement;
const edit = (l: CpmLoop = loop) => render(<AddLoopWizard existing={[l]} editLoop={l} onClose={() => {}} />);
const toTab = (n: number) => { for (let i = 0; i < n; i++) fireEvent.click(next()); };
const saveEdit = (l: CpmLoop, change?: () => void) => {
  edit(l);
  change?.();
  while (screen.queryByRole('button', { name: /^Next: / })) fireEvent.click(next());
  fireEvent.click(screen.getByRole('button', { name: 'Update loop' }));
  return mutate.mock.calls[0][0] as Record<string, unknown>;
};

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { mutate.mockReset(); readiness = undefined; activateError = null; });

describe('AddLoopWizard tabs', () => {
  it('is a dialog titled Edit configuration with four tabs, no step count and no eyebrow', () => {
    edit();
    expect(screen.getByRole('dialog', { name: 'Edit configuration' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Identity', 'Classification', 'Signals', 'Review']);
    for (const gone of ['Step 1 of 4', 'Governed registry workflow', 'Edit loop 45FIC-109', 'Windows & profile']) expect(screen.queryByText(gone)).toBeNull();
    expect(next().textContent).toBe('Next: Classification →');
  });

  it('goes forward only through Next, and back by Back or an earlier tab', () => {
    edit();
    expect(tab('Signals').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tab('Signals'));
    expect(tab('Identity').getAttribute('aria-selected')).toBe('true');
    toTab(2);
    expect(tab('Signals').getAttribute('aria-selected')).toBe('true');
    expect(next().textContent).toBe('Next: Review →');
    fireEvent.click(tab('Identity'));
    expect(tab('Identity').getAttribute('aria-selected')).toBe('true');
    toTab(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(tab('Identity').getAttribute('aria-selected')).toBe('true');
  });

  it('is titled Add loop for a new loop, and says why Next waits', () => {
    render(<AddLoopWizard existing={[loop]} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Add loop' })).toBeTruthy();
    expect(next().disabled).toBe(true);
    expect(screen.getByText('Loop tag is required')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Loop tag *'), { target: { value: '45fic-109' } });
    expect(screen.getByText('This tag already exists')).toBeTruthy();
    expect(next().title).toBe('Loop tag: this tag already exists');
  });

  it('keeps the tag fixed in an edit and says why', () => {
    edit();
    expect((screen.getByLabelText('Loop tag *') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The identity; it cannot change')).toBeTruthy();
  });

  it('keeps the help behind ? instead of paragraphs', () => {
    edit();
    toTab(1);
    expect(screen.queryByText(/The tag type only suggests a model/)).toBeNull();
    expect(screen.queryByText('Classification source')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Loop model' }));
    expect(screen.getByText(/The tag type only suggests a model/)).toBeTruthy();
    toTab(1);
    expect(screen.queryByText(/neither is cosmetic/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ranges' }));
    expect(screen.getByText(/OP range normalises the output to 0–100/)).toBeTruthy();
  });
});

describe('AddLoopWizard checks (edit)', () => {
  it('blocks Next on a half-declared range on the Signals tab, beside the field and the button', () => {
    edit();
    toTab(2);
    fireEvent.change(screen.getByLabelText('OP minimum'), { target: { value: '5' } });
    expect(next().disabled).toBe(true);
    expect(screen.getAllByText(/OP range is half-declared/).length).toBe(2);
    expect(next().title).toMatch(/^OP maximum: OP range is half-declared/);
  });

  it('blocks a malformed path, copies a path, and reviews only the changes with their effect, every setting open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    edit();
    toTab(2);
    expect(pathInput('pv').title).toBe('marun/hdpe/u45/45fic-109.pv');
    fireEvent.change(pathInput('pv'), { target: { value: 'root.marun.u45.fic.pv' } });
    expect(next().disabled).toBe(true);
    expect(next().title).toMatch(/^PV path: Not a UNS contextual path/);
    fireEvent.change(pathInput('pv'), { target: { value: 'marun/hdpe/u45/45fic-109x.pv' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy PV · Process variable * path' })); });
    expect(writeText).toHaveBeenCalledWith('marun/hdpe/u45/45fic-109x.pv');
    expect(screen.getByText('Copied')).toBeTruthy();
    fireEvent.click(next());
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeTruthy();
    const changes = screen.getByTestId('cpm-review-changes');
    expect(changes.textContent).toContain('marun/hdpe/u45/45fic-109.pv');
    expect(changes.textContent).toContain('marun/hdpe/u45/45fic-109x.pv');
    expect(changes.textContent).toMatch(/new path from the next window/);
    expect(changes.textContent).not.toContain('Criticality');
    const all = screen.getByRole('region', { name: 'All settings' });
    expect(within(all).getByText('…/45fic-109.sp').getAttribute('title')).toBe('marun/hdpe/u45/45fic-109.sp');
    expect(screen.queryByText('All settings after saving')).toBeNull();
    expect(screen.getByRole('button', { name: 'How this loop is evaluated' })).toBeTruthy();
  });

  it('says nothing has changed when nothing has', () => {
    edit();
    toTab(3);
    expect(screen.getByText('Nothing has changed. Saving re-submits the loop as it is.')).toBeTruthy();
  });

  it('copies through the http fallback when the clipboard API is missing (B11)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    edit();
    toTab(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy SP · Setpoint * path' })); });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.getByText('Copied')).toBeTruthy();
    Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true });
  });

  it('says so when neither clipboard route works', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    edit();
    toTab(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy SP · Setpoint * path' })); });
    expect(screen.getByText('Copy failed: select the text')).toBeTruthy();
  });

  it('shows the empty VP field as a hint, not as a value, and adds the derived VP on request', () => {
    edit();
    toTab(2);
    expect(pathInput('vp').placeholder).toBe('Not mapped');
    fireEvent.click(screen.getByRole('button', { name: '+ add VP as …/45fic-109.vp' }));
    expect(pathInput('vp').value).toBe('marun/hdpe/u45/45fic-109.vp');
  });
});

describe('AddLoopWizard saving (edit)', () => {
  it('keeps assetId and stepTestApproved through an edit', () => {
    const req = saveEdit({ ...loop, assetId: 'a1b2', stepTestApproved: true } as unknown as CpmLoop);
    expect(req.assetId).toBe('a1b2');
    expect(req.stepTestApproved).toBe(true);
    expect(req.enableMonitoring).toBe(true);
  });

  it('keeps NOT_INSTALLED through an edit', () => {
    const req = saveEdit({ ...loop, engineering: { ...loop.engineering, vpApplicability: 'NOT_INSTALLED' } } as unknown as CpmLoop);
    expect((req.engineering as Record<string, string>).vpApplicability).toBe('NOT_INSTALLED');
  });

  it('keeps a derived VP applicability derived unless the user changes it', () => {
    const drive = { ...loop, model: { serviceFamily: 'FLOW', dynamicClass: 'FAST_SELF_REG', objectiveType: 'TIGHT', topology: 'SINGLE',
      commandPath: 'OP_TO_VFD', acquisition: { mode: 'PERIODIC' }, classificationSource: 'EXPLICIT' } } as unknown as CpmLoop;
    expect((saveEdit(drive).engineering as Record<string, string>).vpApplicability).toBeUndefined();
  });

  it('offers three valve-position choices and saves Not installed (owner answer 3b)', () => {
    const req = saveEdit(loop, () => {
      toTab(2);
      const vp = screen.getByLabelText('Valve position') as HTMLSelectElement;
      expect(Array.from(vp.options).map(o => o.textContent)).toEqual(['Expected', 'Not installed', 'Not applicable']);
      fireEvent.change(vp, { target: { value: 'NOT_INSTALLED' } });
      fireEvent.click(screen.getByRole('tab', { name: 'Identity' }));
    });
    expect((req.engineering as Record<string, string>).vpApplicability).toBe('NOT_INSTALLED');
  });

  it('drops Not installed from Interacting loops, unless the loop already has it', () => {
    edit();
    toTab(2);
    const peers = () => Array.from((screen.getByLabelText('Interacting loops (G13)') as HTMLSelectElement).options).map(o => o.textContent);
    expect(peers()).toEqual(['Derive (expected)', 'Expected', 'Not applicable']);
    cleanup();
    edit({ ...loop, engineering: { ...loop.engineering, peerApplicability: 'NOT_INSTALLED' } } as unknown as CpmLoop);
    toTab(2);
    expect(peers()).toEqual(['Derive (expected)', 'Expected', 'Not installed', 'Not applicable']);
  });

  it('switches monitoring off and on, with the change and its effect in the review (owner answer 3a)', () => {
    const req = saveEdit(loop, () => {
      toTab(1);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monitored' }));
      toTab(2);
      expect(screen.getByTestId('cpm-review-changes').textContent).toMatch(/on.*off.*No new results are produced after saving/);
      fireEvent.click(screen.getByRole('tab', { name: 'Identity' }));
    });
    expect(req.enableMonitoring).toBe(false);
    mutate.mockReset();
    cleanup();
    const req2 = saveEdit({ ...loop, monitoringEnabled: false } as unknown as CpmLoop, () => {
      toTab(1);
      expect((screen.getByRole('checkbox', { name: 'Monitored' }) as HTMLInputElement).checked).toBe(false);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monitored' }));
      fireEvent.click(screen.getByRole('tab', { name: 'Identity' }));
    });
    expect(req2.enableMonitoring).toBe(true);
  });

  it('shows the readiness after saving, the message of a missing check behind its ?', () => {
    readiness = { ready: true, degraded: true, checks: [
      { id: 'tag_pv', label: 'Signal PV', ok: true, message: null },
      { id: 'tag_vp', label: 'Signal VP (valve position, G14)', ok: false, message: 'Map the VP tag.', state: 'EXPECTED_UNMAPPED' },
    ] };
    mutate.mockImplementation((_req, o: { onSuccess: (l: CpmLoop) => void }) => o.onSuccess(loop));
    saveEdit(loop);
    expect(screen.queryAllByRole('tab').length).toBe(0);
    expect(screen.getByText('Ready · degraded')).toBeTruthy();
    expect(screen.getByText('Signal PV').nextElementSibling!.textContent).toContain('OK');
    expect(screen.getByText('Signal VP (valve position, G14)').nextElementSibling!.textContent).toContain('Missing');
    expect(screen.queryByText('Map the VP tag.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Signal VP (valve position, G14)' }));
    expect(screen.getByText('Map the VP tag.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('keeps the server error on the review', () => {
    activateError = new Error('Loop is locked by another change');
    saveEdit(loop);
    expect(screen.getByText('Loop is locked by another change')).toBeTruthy();
  });
});

describe('AddLoopWizard (add)', () => {
  it('waits for a site before Classification', () => {
    render(<AddLoopWizard existing={[]} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Loop tag *'), { target: { value: 'fic9' } });
    fireEvent.change(screen.getByLabelText('Service / description *'), { target: { value: 'Feed' } });
    expect(next().disabled).toBe(true);
    expect(next().title).toBe('Site is required');
  });
});
