// 2026-09-17 audit F18: the right column is the lifecycle - the steps with the current one, the actions
// in order with the blocking reason under each disabled one, the approvals as compact rows. The server
// still owns every decision; the panel only asks and renders what came back.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LifecyclePanel } from './LifecyclePanel';
import type { Bundle } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const bundle = (over: Partial<Bundle>): Bundle => ({
  bundleId: 'b1', version: 2, contentHash: 'f'.repeat(64), site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, parentHash: null, catalogueHash: 'c', executionPlanHash: 'e',
  changeClass: 'POLICY', state: 'VALIDATED', layers: [], resolved: { properties: {}, sources: {} }, validation: { errors: [], warnings: [] }, shadow: null, effectiveFrom: null,
  createdBy: 'alice', createdAt: '2026-09-17T08:00:00Z', updatedAt: '2026-09-17T08:05:00Z', etag: 'W/"2"', note: 'slice-3 e2e', approvals: [], ...over,
} as unknown as Bundle);
const perms = { validate: true, shadow: true, approve: true, activate: true, rollback: true };
const idle = { validate: false, approve: false, deploy: false, rollback: false };
const none = { validate: null, approve: null, deploy: null, rollback: null };

describe('LifecyclePanel', () => {
  it('shows the steps with the current one, the actions in order and the reason under each disabled one', () => {
    render(<LifecyclePanel bundle={bundle({})} perms={perms} pending={idle} errors={none} hasVerifiedActivation={false}
      onValidate={() => {}} onApprove={() => {}} onDeploy={() => {}} onRollback={() => {}} onShadow={() => {}} />);
    const steps = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-step'));
    expect(steps.map(s => s.getAttribute('data-status'))).toEqual(['done', 'current', 'todo', 'todo', 'todo', 'todo']);
    const actions = screen.getAllByRole('listitem').filter(li => li.getAttribute('data-action'));
    expect(actions.map(a => a.getAttribute('data-action'))).toEqual(['validate', 'shadow', 'approve', 'deploy', 'rollback']);
    expect((screen.getByRole('button', { name: 'Validate' }) as HTMLButtonElement).disabled).toBe(true);
    expect(actions[0].textContent).toMatch(/Already validated/);
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(false);
    expect(actions[3].textContent).toMatch(/Approve the content first/);
  });

  it('approving sends the note and validity; an expired approval is said and blocks activation', () => {
    const onApprove = vi.fn();
    render(<LifecyclePanel bundle={bundle({ state: 'APPROVED', approvals: [{ approvalId: 'a1', contentHash: 'f'.repeat(64), approver: 'bob', role: 'Reviewer', decision: 'APPROVED', note: 'ok', expiresAt: '2020-01-01T00:00:00Z', createdAt: '2019-12-31T00:00:00Z', bindsCurrentContent: true }] })}
      perms={perms} pending={idle} errors={none} hasVerifiedActivation={false} onValidate={() => {}} onApprove={onApprove} onDeploy={() => {}} onRollback={() => {}} onShadow={() => {}} />);
    expect(screen.getByText(/approved by bob \(expired\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Activate' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/The approval expired; approve again before activating/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Approval note'), { target: { value: 'reviewed again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledWith({ note: 'reviewed again', validityHours: 72 });
  });
});
