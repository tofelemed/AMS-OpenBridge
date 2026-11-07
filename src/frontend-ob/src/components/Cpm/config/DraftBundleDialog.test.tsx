// Task 25: Prepare bundle draft picks the level, then the parent: the newest version of THAT level, never another level's.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DraftBundleDialog, draftRequest } from './DraftBundleDialog';
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

describe('draftRequest', () => {
  it('takes the newest version of the chosen level as parent, and the level\'s own reference', () => {
    expect(draftRequest('LOOP', levels, 'tighten')).toEqual({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l3', note: 'tighten' });
    expect(draftRequest('PROFILE', levels, '')).toEqual({ scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', parentBundleId: null, note: undefined });
    expect(draftRequest('SITE', levels, '')).toEqual({ scopeKind: 'SITE', scopeRef: null, parentBundleId: 's4', note: undefined });
  });
});

describe('DraftBundleDialog', () => {
  it('offers LOOP, PROFILE and SITE when drafting, and picks the right parent version', () => {
    const onCreate = vi.fn();
    render(<DraftBundleDialog levels={levels} creating={false} onClose={() => {}} onCreate={onCreate} />);
    expect(screen.getAllByRole('radio').map(r => (r as HTMLInputElement).value)).toEqual(['LOOP', 'PROFILE', 'SITE']);
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'wider G4' } });
    fireEvent.click(screen.getByRole('radio', { name: /SITE/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'SITE', scopeRef: null, parentBundleId: 's4', note: 'wider G4' });
  });

  it('waits for the versions of the chosen level, so a draft never starts from the wrong parent', () => {
    const loading: Levels = { ...levels, PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: true, error: null } };
    render(<DraftBundleDialog levels={loading} creating={false} onClose={() => {}} onCreate={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /PROFILE/ }));
    expect((screen.getByRole('button', { name: 'Create draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Loading the PROFILE versions/)).toBeTruthy();
  });
});
