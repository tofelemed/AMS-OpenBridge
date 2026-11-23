// Task 25: Prepare bundle draft picks the level, then the parent, never another level's version.
// CHG-169 (owner answer 2b): the parent is the level's ACTIVE version when it has one (a FIC10302 LOOP draft starts from v6,
// active, not v7, rolled back), else the newest by number; the dialog says which ("Starts from"). A disabled Create draft
// says why; the callout sits in the dialog.
// CHG-220 (gap 3): a FIRST version starts from the plant-wide bundle the loop runs under (active PROFILE, else active SITE),
// never from the factory layers while one is active - activating it would drop the plant-wide changes.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DraftBundleDialog, draftRequest, startsFrom } from './DraftBundleDialog';
import type { Levels } from './BundlesView';
import type { BundleSummary } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

const b = (over: Partial<BundleSummary>): BundleSummary => ({
  bundleId: 'b', version: 1, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state: 'DRAFT',
  effectiveFrom: null, createdBy: 'alice', createdAt: 't', updatedAt: 't', note: null, validationErrors: 0, ...over,
});
const levels: Levels = {
  LOOP: { ref: 'FIC10302', bundles: [b({ bundleId: 'l1', version: 1 }), b({ bundleId: 'l3', version: 3 }), b({ bundleId: 'l2', version: 2 })], loading: false, error: null },
  PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: false, error: null },
  SITE: { ref: 'hdpe', bundles: [b({ bundleId: 's4', version: 4, scopeKind: 'SITE', scopeRef: null })], loading: false, error: null },
};
// the lab's FIC10302: v7 rolled back, v6 active (verified), v5 rolled back
const lab: Levels = { ...levels, LOOP: { ref: 'FIC10302', loading: false, error: null, bundles: [
  b({ bundleId: 'v5', version: 5, state: 'ROLLED_BACK' }), b({ bundleId: 'v7', version: 7, state: 'ROLLED_BACK' }), b({ bundleId: 'v6', version: 6, state: 'ACTIVE_VERIFIED' }),
] } };

describe('draftRequest', () => {
  it('takes the newest version of the chosen level as parent when none is active, and the reference of that level', () => {
    expect(draftRequest('LOOP', levels, 'tighten')).toEqual({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l3', note: 'tighten' });
    expect(draftRequest('PROFILE', levels, '')).toEqual({ scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', parentBundleId: null, note: undefined });
    expect(draftRequest('SITE', levels, '   ').note).toBeUndefined();   // whitespace is no note
    expect(draftRequest('SITE', levels, '')).toEqual({ scopeKind: 'SITE', scopeRef: null, parentBundleId: 's4', note: undefined });
  });

  it('starts from the active version of the level, not the newest by number', () => {
    expect(startsFrom('LOOP', lab)?.bundle.bundleId).toBe('v6');
    expect(draftRequest('LOOP', lab, 'next')).toEqual({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'v6', note: 'next' });
    expect(startsFrom('PROFILE', levels)).toBeNull();   // the SITE v4 is only a draft: the factory layers
  });
});

describe('DraftBundleDialog', () => {
  // CHG-192 (owner review item 16): no explanatory sentence over the form; it sits behind the Level ?
  it('keeps "Nothing changes for a loop until a bundle is activated." behind the Level ?', () => {
    render(<DraftBundleDialog levels={levels} creating={false} onClose={() => {}} onCreate={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Prepare bundle draft' });
    expect(dialog.textContent).not.toContain('Nothing changes for a loop');
    fireEvent.click(within(dialog).getByRole('button', { name: 'The three levels' }));
    expect(dialog.textContent).toContain('Nothing changes for a loop until a bundle is activated.');
  });

  it('offers LOOP, PROFILE and SITE when drafting, and picks the right parent version', () => {
    const onCreate = vi.fn();
    render(<DraftBundleDialog levels={levels} creating={false} onClose={() => {}} onCreate={onCreate} />);
    expect(screen.getAllByRole('radio').map(r => (r as HTMLInputElement).value)).toEqual(['LOOP', 'PROFILE', 'SITE']);
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'wider G4' } });
    fireEvent.click(screen.getByRole('radio', { name: /SITE/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'SITE', scopeRef: null, parentBundleId: 's4', note: 'wider G4' });
  });

  it('says which version each level starts from, the active one first, and sends that one', () => {
    const onCreate = vi.fn();
    render(<DraftBundleDialog levels={lab} creating={false} onClose={() => {}} onCreate={onCreate} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    const loopRow = screen.getByRole('radio', { name: /LOOP/ }).closest('tr')!;
    expect(loopRow.textContent).toMatch(/v6.*Active \(verified\)/);
    expect(loopRow.textContent).not.toMatch(/v7/);
    expect(screen.getByRole('radio', { name: /PROFILE/ }).closest('tr')!.textContent).toMatch(/First version at this level/);
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'v6', note: undefined });
  });

  it('waits for the versions of the chosen level, so a draft never starts from the wrong parent, and says why', () => {
    const loading: Levels = { ...levels, PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: true, error: null } };
    render(<DraftBundleDialog levels={loading} creating={false} onClose={() => {}} onCreate={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /PROFILE/ }));
    expect((screen.getByRole('button', { name: 'Create draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Loading the PROFILE versions…')).toBeTruthy();
  });

  it('an unreadable level blocks the draft with its sentence', () => {
    const broken: Levels = { ...levels, SITE: { ref: 'hdpe', bundles: [], loading: false, error: new Error('down') } };
    render(<DraftBundleDialog levels={broken} creating={false} onClose={() => {}} onCreate={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /SITE/ }));
    expect((screen.getByRole('button', { name: 'Create draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('The SITE versions could not be read, so a draft cannot start from the right one.')).toBeTruthy();
  });
});

describe('a first version starts from the plant-wide bundle in force (CHG-220, gap 3)', () => {
  const firstLoop = (profile: BundleSummary[], site: BundleSummary[], over: Partial<Levels> = {}): Levels => ({
    LOOP: { ref: 'FIC10303', bundles: [], loading: false, error: null },
    PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: profile, loading: false, error: null },
    SITE: { ref: 'hdpe', bundles: site, loading: false, error: null },
    ...over,
  });
  const p2 = b({ bundleId: 'p2', version: 2, scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', state: 'ACTIVE_VERIFIED' });
  const p3 = b({ bundleId: 'p3', version: 3, scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', state: 'DRAFT' });
  const s1 = b({ bundleId: 's1', version: 1, scopeKind: 'SITE', scopeRef: null, state: 'ACTIVE_VERIFIED' });

  it('LOOP: the active PROFILE bundle, not a newer PROFILE draft', () => {
    const lv = firstLoop([p3, p2], [s1]);
    expect(startsFrom('LOOP', lv)).toEqual({ kind: 'PROFILE', bundle: p2 });
    expect(draftRequest('LOOP', lv, '')).toEqual({ scopeKind: 'LOOP', scopeRef: 'FIC10303', parentBundleId: 'p2', note: undefined });
  });

  it('LOOP without an active PROFILE bundle, and PROFILE: the active SITE bundle', () => {
    const lv = firstLoop([p3], [s1]);
    expect(draftRequest('LOOP', lv, '').parentBundleId).toBe('s1');
    expect(draftRequest('PROFILE', firstLoop([], [s1]), '').parentBundleId).toBe('s1');
  });

  it('nothing active above: the factory layers (no parent)', () => {
    expect(draftRequest('LOOP', firstLoop([p3], []), '').parentBundleId).toBeNull();
  });

  it('says where the first version starts and sends that bundle', () => {
    const onCreate = vi.fn();
    render(<DraftBundleDialog levels={firstLoop([p2], [s1])} creating={false} onClose={() => {}} onCreate={onCreate} />);
    expect(screen.getByRole('radio', { name: /LOOP/ }).closest('tr')!.textContent).toMatch(/PROFILE v2.*Active \(verified\)/);
    expect(screen.getByRole('radio', { name: /PROFILE/ }).closest('tr')!.textContent).toMatch(/^PROFILE.*v2/);
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'LOOP', scopeRef: 'FIC10303', parentBundleId: 'p2', note: undefined });
  });

  it('waits for the PROFILE versions before a first LOOP version, and says why', () => {
    const lv = firstLoop([], [s1], { PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: true, error: null } });
    render(<DraftBundleDialog levels={lv} creating={false} onClose={() => {}} onCreate={() => {}} />);
    expect((screen.getByRole('button', { name: 'Create draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Loading the PROFILE versions…')).toBeTruthy();
  });
});
