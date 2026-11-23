// Task 8 (journey): the Approve step in words - Change / Applies to / Past 24 h, Note (optional), the rule's label without a role in
// brackets, the history without hashes, no rule sentence, no Send back.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { ApprovalTab, plainApproveLabel } from './ApprovalTab';
import type { Bundle } from '../../../api/cpm/config';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);
beforeEach(() => { vi.mocked(fetchMod.apiJson).mockReset(); });

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  bundleId: 'b1', version: 13, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', state: 'SHADOW_EVALUATED', shadow: null,
  layers: [{ kind: 'LOOP', ref: 'FIC10302', ordinal: 0, content: { 'G2r.pv_region_max': 125 }, content_hash: 'x' }],
  resolved: { properties: {}, sources: {} }, approvals: [], ...over,
} as unknown as Bundle);
const action = { key: 'approve' as const, label: 'Approve alone (Admin)', enabled: true, reason: null };
const view = (b: Bundle, extra: Partial<React.ComponentProps<typeof ApprovalTab>> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ApprovalTab bundle={b} action={action} reason={null} busy={false} error={null} onApprove={() => {}} {...extra} />
  </QueryClientProvider>);

describe('ApprovalTab', () => {
  it('shows Change, Applies to and On past data, with before and after when given', () => {
    view(bundle(), { changes: [{ property: 'G2r.pv_region_max', before: 120, after: 125 }] });
    expect(screen.getByText('On past data').nextSibling?.textContent).toBe('Not tried');
    expect(screen.queryByText('Past 24 h')).toBeNull();
    expect(screen.getByText('Region maximum 120 → 125')).toBeTruthy();
    expect(screen.getByText('FIC10302')).toBeTruthy();
    expect(screen.getByText('Not tried')).toBeTruthy();
  });

  it('without a before the change names the value the bundle sets', () => {
    view(bundle());
    expect(screen.getByText('Region maximum 125')).toBeTruthy();
  });

  it('On past data reads No result changes or the count, from the comparison', async () => {
    vi.mocked(fetchMod.apiJson).mockResolvedValue({ runState: 'FINISHED', windows: [] } as never);
    view(bundle({ shadow: { analysisRunId: 'r1', contentHash: 'h' } as never }));
    expect(await screen.findByText('No result changes')).toBeTruthy();
    cleanup();
    vi.mocked(fetchMod.apiJson).mockResolvedValue({ runState: 'FINISHED', windows: [{ windowKind: '24h', windowEnd: 't', diagnosisBefore: 'a', diagnosisAfter: 'b', changed: [] }] } as never);
    view(bundle({ shadow: { analysisRunId: 'r1', contentHash: 'h' } as never }));
    expect(await screen.findByText('1 result changes')).toBeTruthy();
  });

  it('the button is the rule label without the role; Note (optional); no Send back, no rule sentence, no validity field', () => {
    const onApprove = vi.fn();
    view(bundle(), { onApprove });
    expect(screen.queryByText(/SuperAdmin|\(Admin\)/)).toBeNull();
    expect(screen.queryByText('Send back')).toBeNull();
    expect(screen.queryByText(/lasts 72|expires; an expired|binds only|Valid for/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve alone' }));
    expect(onApprove).toHaveBeenCalledWith({ note: 'ok', validityHours: 72 });
    expect(plainApproveLabel('Approve alone (SuperAdmin)')).toBe('Approve alone');
    expect(plainApproveLabel('Approve')).toBe('Approve');
  });

  it('the history is who, decision, when - no hash, no role', () => {
    view(bundle({ approvals: [{ approvalId: 'a1', contentHash: 'deadbeef'.repeat(8), approver: 'alice', role: 'Admin', decision: 'APPROVED', note: null, expiresAt: null, createdAt: '2026-11-23T06:40:00Z', bindsCurrentContent: true }] }));
    const table = screen.getByRole('table', { name: 'Approvals' });
    expect(table.textContent).toMatch(/alice/);
    expect(table.textContent).not.toMatch(/deadbeef|Admin|Content|never expires/);
    expect(table.textContent).toMatch(/23 Nov [0-9]{2}:[0-9]{2}/);
  });
});
