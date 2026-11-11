// CHG-169 (owner review, the approved sample): Bundles is one list grouped LOOP / PROFILE / SITE, newest first, beside the
// selected version's panel (class, created, effective from, validation errors, content hash; "Open v6 →" at its foot). With
// no loop it lists the bundles in progress. Prepare bundle draft sits at the list's head, gated by the draft permission; a
// draft starts from the level's active version (owner answer 2b). States read as words with their glyph.
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
  LOOP: { ref: 'FIC10302', bundles: [b({ bundleId: 'l1', version: 1, state: 'SUPERSEDED' }), b({ bundleId: 'l3', version: 3, contentHash: '337ddfe7aaaa', state: 'ROLLED_BACK', note: 'slice-3 e2e v2' }), b({ bundleId: 'l2', version: 2, state: 'ACTIVE_VERIFIED', effectiveFrom: '2026-09-17T06:36:16Z' })], loading: false, error: null },
  PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: false, error: null },
  SITE: { ref: 'hdpe', bundles: [b({ bundleId: 's1', scopeKind: 'SITE', scopeRef: null, state: 'DRAFT', validationErrors: 2, changeClass: 'STATE_BOUNDARY' })], loading: false, error: null },
};
const base = { activeBundleId: 'l2', canDraft: true, onOpen: () => {}, onCreate: () => {}, creating: false, createError: null };
const panel = () => screen.getByRole('complementary');

describe('BundlesView', () => {
  it('lists the three levels as groups, newest first, with state words; the active version is selected and opens from the panel', () => {
    const onOpen = vi.fn();
    render(<BundlesView {...base} levels={levels} onOpen={onOpen} />);
    const groups = screen.getAllByRole('rowgroup').slice(1).map(g => g.getAttribute('aria-label'));
    expect(groups).toEqual(['LOOP', 'PROFILE', 'SITE']);
    const loop = within(screen.getByRole('rowgroup', { name: 'LOOP' }));
    expect(loop.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([
      expect.stringMatching(/^v3slice-3 e2e v2.*alice.*↺Rolled back$/), expect.stringMatching(/^v2.*✓Active \(verified\)$/), expect.stringMatching(/^v1.*⊘Superseded$/),
    ]);
    expect(within(screen.getByRole('rowgroup', { name: 'LOOP' })).getAllByRole('row')[2].getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('rowgroup', { name: 'PROFILE' }).textContent).toMatch(/Flow, fast self-regulating.*no bundle at this level - the layer below applies/);
    expect(screen.getByRole('heading', { name: 'LOOP v2' })).toBeTruthy();
    expect(panel().textContent).toMatch(/Change class.*Policy/);
    expect(panel().textContent).toMatch(/Validation errors.*0/);
    expect(panel().textContent).toMatch(/Content hash.*f9153b00/);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Open v2 →' }));
    expect(onOpen).toHaveBeenCalledWith('l2');
  });

  it('choosing a row selects the version, it does not open it', () => {
    const onOpen = vi.fn();
    render(<BundlesView {...base} levels={levels} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'v3' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'LOOP v3' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('rowgroup', { name: 'SITE' })).getByRole('button', { name: 'v1' }));
    expect(screen.getByRole('heading', { name: 'SITE v1' })).toBeTruthy();
    expect(panel().textContent).toMatch(/◆ State boundary/);
    expect(panel().textContent).toMatch(/Validation errors.*2/);
  });

  it('Prepare bundle draft starts from the active version of the chosen level', () => {
    const onCreate = vi.fn();
    render(<BundlesView {...base} levels={levels} onCreate={onCreate} />);
    expect(screen.queryByText('Publish')).toBeNull();                                   // the Draft → Review → Publish strip is gone
    expect(screen.queryByText(/until a bundle is/)).toBeNull();                         // the callout moved into the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Prepare bundle draft' }));
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'tighten G4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(onCreate).toHaveBeenCalledWith({ scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: 'l2', note: 'tighten G4' });
    expect(screen.getByRole('dialog')).toBeTruthy();                                    // stays open until the draft succeeds
  });

  it('a failed draft shows its error in the dialog and keeps the note; a second submit is blocked while it runs', () => {
    const props = { ...base, levels, onCreate: vi.fn() };
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

  it('a failed draft does not show again when the dialog is reopened (B13)', () => {
    const Host = () => {
      const [err, setErr] = React.useState<unknown>(new Error('409 parent moved'));
      return <BundlesView {...base} levels={levels} createError={err} onDraftOpen={() => setErr(null)} />;
    };
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare bundle draft' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('without the draft permission the button is disabled and the reason is on screen', () => {
    render(<BundlesView {...base} levels={levels} canDraft={false} />);
    expect((screen.getByRole('button', { name: 'Prepare bundle draft' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Drafting a bundle needs cpm.config.draft.')).toBeTruthy();
  });

  it('a level that cannot be read says so with a retry; a loading level says it is loading', () => {
    const retry = vi.fn();
    render(<BundlesView {...base} levels={{ ...levels, PROFILE: { ref: 'FLOW_FAST_SELF_REG', bundles: [], loading: false, error: new Error('down'), retry }, SITE: { ref: 'hdpe', bundles: [], loading: true, error: null } }} />);
    expect(screen.getByText('Versions unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByText('Loading versions…')).toBeTruthy();
  });

  it('with no loop it lists the bundles in progress (active and superseded ones left out) and selects the first', () => {
    const onOpen = vi.fn();
    const progress = { bundles: [b({ bundleId: 'd1', scopeRef: 'FIC10301', updatedAt: '2026-09-17T08:24:00Z', createdBy: 'admin' }), b({ bundleId: 'l2', state: 'ACTIVE_VERIFIED' })], loading: false, error: null, retry: () => {} };
    render(<BundlesView {...base} activeBundleId={undefined} progress={progress} onOpen={onOpen} />);
    expect(screen.getByText('Bundles in progress')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Prepare bundle draft' })).toBeNull();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/LOOP FIC10301.*v1.*○Draft.*admin/);
    expect(screen.getByRole('heading', { name: 'LOOP FIC10301 v1' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open v1 →' }));
    expect(onOpen).toHaveBeenCalledWith('d1');
  });

  it('nothing in progress says so; a failed read says Bundles unavailable', () => {
    render(<BundlesView {...base} progress={{ bundles: [], loading: false, error: null, retry: () => {} }} />);
    expect(screen.getByText('Nothing in progress in this scope.')).toBeTruthy();
    cleanup();
    render(<BundlesView {...base} progress={{ bundles: [], loading: false, error: new Error('x'), retry: () => {} }} />);
    expect(screen.getByText('Bundles unavailable')).toBeTruthy();
  });
});
