// 2026-09-18 Gate Configuration redesign: the loop's three levels (LOOP → PROFILE → SITE) with their
// versions newest first and a New draft / New version per level, gated by the draft permission; the
// header states what the loop runs under before anything else.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BundlesView } from './BundlesView';
import type { BundleSummary } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const b = (over: Partial<BundleSummary>): BundleSummary => ({
  bundleId: 'b', version: 1, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, changeClass: 'POLICY', state: 'DRAFT',
  effectiveFrom: null, createdBy: 'alice', createdAt: '2026-09-17T06:00:00Z', updatedAt: '2026-09-17T06:36:16Z', note: null, validationErrors: 0, ...over,
});
const levels = {
  LOOP: { ref: 'FIC10302', bundles: [b({ bundleId: 'l1', version: 1, state: 'SUPERSEDED' }), b({ bundleId: 'l3', version: 3, contentHash: '337ddfe7aaaa', state: 'ROLLED_BACK' }), b({ bundleId: 'l2', version: 2, state: 'ACTIVE_VERIFIED', effectiveFrom: '2026-09-17T06:36:16Z' })], loading: false, error: null },
  PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: false, error: null },
  SITE: { ref: 'hdpe', bundles: [b({ bundleId: 's1', scopeKind: 'SITE', scopeRef: null, state: 'DRAFT', validationErrors: 2 })], loading: false, error: null },
};

describe('BundlesView', () => {
  it('lists the three levels, versions newest first with their state, and opens a version', () => {
    const onOpen = vi.fn();
    render(<BundlesView levels={levels} activeBundleId="l2" canDraft onOpen={onOpen} onCreate={() => {}} creating={false} createError={null} />);
    const rows = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-level'));
    expect(rows.map(r => r.getAttribute('data-level'))).toEqual(['LOOP', 'PROFILE', 'SITE']);
    const loop = within(rows[0]);
    expect(loop.getAllByRole('button', { name: /^v\d/ }).map(x => x.textContent)).toEqual([expect.stringMatching(/^v3.*ROLLED_BACK/), expect.stringMatching(/^v2.*ACTIVE_VERIFIED/), expect.stringMatching(/^v1.*SUPERSEDED/)]);
    expect(loop.getByRole('button', { name: /^v2/ }).getAttribute('aria-current')).toBe('true');
    expect(rows[1].textContent).toMatch(/no bundle at this level/);
    expect(rows[2].textContent).toMatch(/2 validation errors/);
    fireEvent.click(loop.getByRole('button', { name: /^v3/ }));
    expect(onOpen).toHaveBeenCalledWith('l3');
  });

  it('shows the Draft, Review, Publish strip and opens Prepare bundle draft with the parent of the chosen level', () => {
    const onCreate = vi.fn();
    render(<BundlesView levels={levels} activeBundleId="l2" canDraft onOpen={() => {}} onCreate={onCreate} creating={false} createError={null} />);
    expect(screen.getByRole('list', { name: 'Bundle steps' }).textContent).toBe('DraftReviewPublish');
    expect(screen.queryByPlaceholderText('draft note')).toBeNull();                 // no per-level note boxes any more
    fireEvent.click(screen.getByRole('button', { name: 'Prepare bundle draft' }));
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'tighten G4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));         // LOOP is the first level
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l3', note: 'tighten G4' });
    expect(screen.getByRole('dialog')).toBeTruthy();                                  // stays open until the draft succeeds
  });

  it('a failed draft shows its error in the dialog and keeps the note; a second submit is blocked while it runs', () => {
    const props = { levels, activeBundleId: 'l2', canDraft: true, onOpen: () => {}, onCreate: vi.fn() };
    const { rerender } = render(<BundlesView {...props} creating={false} createError={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare bundle draft' }));
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'keep me' } });
    rerender(<BundlesView {...props} creating createError={null} />);
    expect((screen.getByRole('button', { name: 'Creating…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<BundlesView {...props} creating={false} createError={new Error('409 parent moved')} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/409 parent moved/);
    expect((within(dialog).getByLabelText('Draft note') as HTMLInputElement).value).toBe('keep me');
    expect(screen.getAllByRole('alert')).toHaveLength(1);                             // the error once
  });

  it('without the draft permission the button is disabled and the reason is on screen; the level lines sit behind a ?', () => {
    render(<BundlesView levels={levels} activeBundleId="l2" canDraft={false} onOpen={() => {}} onCreate={() => {}} creating={false} createError={null} />);
    expect((screen.getByRole('button', { name: 'Prepare bundle draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/needs cpm\.config\.draft/)).toBeTruthy();
    expect(screen.queryByText('Overrides the profile for this loop only.')).toBeNull();
  });
});
