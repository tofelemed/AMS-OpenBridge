/**
 * v2.5 Task 3D.1 (spec §5.6): the lifecycle actions the server owns - validate, approve (an
 * independent reviewer, bound to the content hash, with an expiry), activate (a deployment), and
 * the approvals recorded so far. Every button asks the server; the recorded state renders back.
 * A self-approval, an expired approval or a stale hash is the server's 403 / 409, shown as such.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDateTime } from '../shared';
import { ApiError } from '../../../api/apiFetch';
import type { Bundle } from '../../../api/cpm/config';
import { bundleStateTone, shortHash } from './configSupport';

export interface ApprovalRow { approvalId: string; contentHash: string; approver: string; role: string; decision: string; note: string | null; expiresAt: string | null; createdAt: string; bindsCurrentContent: boolean }

const errorText = (e: unknown): string | null => {
  if (!e) return null;
  if (e instanceof ApiError) return e.status === 403 ? `Refused: ${e.message}` : e.status === 409 ? `Conflict: ${e.message}` : e.message;
  return e instanceof Error ? e.message : String(e);
};

export const ApprovalPanel: React.FC<{
  bundle: Bundle & { approvals?: ApprovalRow[] };
  perms: { validate: boolean; approve: boolean; activate: boolean };
  pending: { validate: boolean; approve: boolean; deploy: boolean };
  errors: { validate: unknown; approve: unknown; deploy: unknown };
  onValidate: () => void;
  onApprove: (args: { note?: string; validityHours?: number }) => void;
  onDeploy: (args: { scheduledFor?: string | null }) => void;
}> = ({ bundle, perms, pending, errors, onValidate, onApprove, onDeploy }) => {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('72');
  const [schedule, setSchedule] = useState('');
  const approvals = bundle.approvals ?? [];
  const current = approvals.find(a => a.bindsCurrentContent && a.decision === 'APPROVED');
  const expired = current?.expiresAt ? new Date(current.expiresAt).getTime() < Date.now() : false;
  const canValidate = perms.validate && (bundle.state === 'DRAFT' || bundle.state === 'REJECTED');
  const canApprove = perms.approve && (bundle.state === 'VALIDATED' || bundle.state === 'SHADOW_EVALUATED');
  const canDeploy = perms.activate && (bundle.state === 'APPROVED' || bundle.state === 'PARTIALLY_ACKNOWLEDGED' || bundle.state === 'ACTIVATION_FAILED') && !expired;
  return (
    <section className="cpm-surface" data-testid="approval-panel">
      <PanelHead eyebrow="Lifecycle" title={`v${bundle.version} · ${shortHash(bundle.contentHash, 12)}`} right={<TonePill tone={bundleStateTone(bundle.state)}>{bundle.state}</TonePill>} />
      <KvRow label="created">{bundle.createdBy} · {fmtDateTime(bundle.createdAt)}</KvRow>
      <KvRow label="updated">{fmtDateTime(bundle.updatedAt)}</KvRow>
      {bundle.note && <KvRow label="note">{bundle.note}</KvRow>}
      <div className="cpm-config-inline">
        <ObcButton variant="raised" disabled={!canValidate || pending.validate} onClick={onValidate}>{pending.validate ? 'Validating…' : 'Validate'}</ObcButton>
        {errorText(errors.validate) && <span className="cpm-field__error" role="alert">{errorText(errors.validate)}</span>}
      </div>
      <PanelHead eyebrow="Approval" title={current ? `approved by ${current.approver}${expired ? ' (expired)' : ''}` : 'no approval binds the current content'} />
      {approvals.length > 0 && (
        <table className="cpm-table" data-table="approvals">
          <thead><tr><th>decision</th><th>by</th><th>hash</th><th>expires</th><th>note</th></tr></thead>
          <tbody>{approvals.map(a => (
            <tr key={a.approvalId} className={a.bindsCurrentContent ? '' : 'cpm-config-approval--stale'}>
              <td><TonePill tone={a.decision === 'APPROVED' ? (a.bindsCurrentContent ? 'good' : 'muted') : 'bad'}>{a.decision}</TonePill></td>
              <td>{a.approver} ({a.role})</td><td className="cpm-mono">{shortHash(a.contentHash, 8)}{a.bindsCurrentContent ? '' : ' (previous content)'}</td>
              <td>{a.expiresAt ? fmtDateTime(a.expiresAt) : 'never'}</td><td>{a.note ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {expired && <p className="cpm-field__error" role="alert">The approval expired; approve again before activating.</p>}
      <label className="cpm-field"><span className="cpm-field__label">Approval note</span>
        <textarea className="cpm-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Why this content is approved (recorded, hash-bound)" /></label>
      <div className="cpm-config-inline">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Valid for (h)</span>
          <input className="cpm-input" value={hours} onChange={e => setHours(e.target.value)} inputMode="numeric" /></label>
        <ObcButton variant="raised" disabled={!canApprove || pending.approve} onClick={() => onApprove({ note: note || undefined, validityHours: Number(hours) || undefined })}>{pending.approve ? 'Recording…' : 'Approve this content'}</ObcButton>
        {errorText(errors.approve) && <span className="cpm-field__error" role="alert">{errorText(errors.approve)}</span>}
      </div>
      {!perms.approve && <p className="cpm-copy">Approval needs cpm.config.approve, by someone other than the author; site-wide, objective and test-permission changes also need the ControlAuthority role.</p>}
      <PanelHead eyebrow="Activation" title="Deploy the approved bundle" />
      <div className="cpm-config-inline">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Effective from (optional, ISO)</span>
          <input className="cpm-input" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="now" /></label>
        <ObcButton variant="raised" disabled={!canDeploy || pending.deploy} onClick={() => onDeploy({ scheduledFor: schedule || null })}>{pending.deploy ? 'Scheduling…' : 'Activate'}</ObcButton>
        {errorText(errors.deploy) && <span className="cpm-field__error" role="alert">{errorText(errors.deploy)}</span>}
      </div>
      {!perms.activate && <p className="cpm-copy">Activation needs cpm.config.activate.</p>}
    </section>
  );
};
