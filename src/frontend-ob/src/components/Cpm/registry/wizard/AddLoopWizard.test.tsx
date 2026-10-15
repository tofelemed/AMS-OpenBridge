// CHG-098 (SME review 2 #28): Continue is blocked with the reason on screen; signal paths copy with a visible
// confirmation; the edit review shows the paths and only the changed settings with their effect; the fixed
// pipeline windows are help, not a step.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CpmLoop } from '../../../../api/cpmApi';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; disabled?: boolean; title?: string; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, title: p.title, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; disabled?: boolean; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-help', () => ({ ObiHelp: () => null }));
const mutate = vi.fn();
vi.mock('../../../../hooks/useCpm', () => ({
  useCpmRegistryContract: () => ({ data: undefined }),
  useActivateLoop: () => ({ mutate, isPending: false, isError: false, error: null }),
  useCpmReadiness: () => ({ data: undefined }),
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

const continueBtn = () => screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement;
const pathInput = (role: string) => document.getElementById(`cpm-wizard-path-${role}`) as HTMLInputElement;

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => mutate.mockReset());

describe('AddLoopWizard (edit)', () => {
  it('has four steps: the pipeline windows are help on the review, not a step', () => {
    render(<AddLoopWizard existing={[loop]} editLoop={loop} onClose={() => {}} />);
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
    expect(screen.queryByText('Windows & profile')).toBeNull();
  });

  it('blocks Continue on a half-declared range and says why, beside the field and the button', () => {
    render(<AddLoopWizard existing={[loop]} editLoop={loop} onClose={() => {}} />);
    fireEvent.click(continueBtn());
    fireEvent.change(screen.getByLabelText('OP minimum'), { target: { value: '5' } }); // OP minimum only
    expect(continueBtn().disabled).toBe(true);
    expect(screen.getAllByText(/OP range is half-declared/).length).toBe(2);
    expect(continueBtn().title).toMatch(/^OP maximum: OP range is half-declared/);
  });

  it('blocks a malformed path, copies a path, and reviews only the changes with paths and effect', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<AddLoopWizard existing={[loop]} editLoop={loop} onClose={() => {}} />);
    fireEvent.click(continueBtn());
    fireEvent.click(continueBtn());
    expect(pathInput('pv').title).toBe('marun/hdpe/u45/45fic-109.pv');

    fireEvent.change(pathInput('pv'), { target: { value: 'root.marun.u45.fic.pv' } });
    expect(continueBtn().disabled).toBe(true);
    expect(continueBtn().title).toMatch(/^PV path: Not a UNS contextual path/);

    fireEvent.change(pathInput('pv'), { target: { value: 'marun/hdpe/u45/45fic-109x.pv' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy PV · Process variable * path' })); });
    expect(writeText).toHaveBeenCalledWith('marun/hdpe/u45/45fic-109x.pv');
    expect(screen.getByText('Copied')).toBeTruthy();

    fireEvent.click(continueBtn());
    expect(screen.getByText('Changes (1)')).toBeTruthy();
    const changes = screen.getByTestId('cpm-review-changes');
    expect(changes.textContent).toContain('marun/hdpe/u45/45fic-109.pv');
    expect(changes.textContent).toContain('marun/hdpe/u45/45fic-109x.pv');
    expect(changes.textContent).toMatch(/new path from the next window/);
    expect(changes.textContent).not.toContain('Criticality');
    // the full list, with the actual path per role, stays one click away
    expect(screen.getByText('All settings after saving')).toBeTruthy();
    expect(screen.getAllByText('marun/hdpe/u45/45fic-109.sp').length).toBe(1);
    expect(screen.getByRole('button', { name: /How this loop is evaluated/ })).toBeTruthy();
  });

  it('says so when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<AddLoopWizard existing={[loop]} editLoop={loop} onClose={() => {}} />);
    fireEvent.click(continueBtn());
    fireEvent.click(continueBtn());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy SP · Setpoint * path' })); });
    expect(screen.getByText('Copy failed: select the text')).toBeTruthy();
  });
});
