/**
 * CHG-169 (owner review, the approved sample): a bundle's Approval tab - the approvals recorded (Decision · Approver · Content ·
 * Expires · Note; an approval is bound to the content hash and expires), then Approve with its note and validity. Approve sends
 * what the lifecycle column sent ({ note, validityHours }); four eyes, an expired approval and a stale hash are the server's
 * refusals, shown as "Refused:" / "Conflict:". An approval that ran out after the version was activated no longer reads as a
 * warning: its expiry only matters while the version still waits to be activated.
 */
import React, { useState } from 'react';
import { TonePill } from '../shared';
import { Toggletip } from '../../../ui/Toggletip';
import { ReasonedButton } from '../ReasonedButton';
import { stamp, zoneTag } from '../events/eventTime';
import type { Bundle } from '../../../api/cpm/config';
import { shortHash } from './configSupport';
import { errorText, type LifecycleAction } from './lifecycle';

/** The states in which an expired approval still blocks something (approving again, activating again). */
const AWAITING = new Set(['APPROVED', 'EXPIRED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);

export const currentApproval = (bundle: Bundle) => {
  const current = (bundle.approvals ?? []).find(a => a.bindsCurrentContent && a.decision === 'APPROVED');
  const expired = current?.expiresAt ? new Date(current.expiresAt).getTime() < Date.now() : false;
  return { current, expired };
};

export const ApprovalTab: React.FC<{
  bundle: Bundle;
  action: LifecycleAction;
  /** The reason under Approve, or null when the frozen reason above already says it. */
  reason: string | null;
  busy: boolean;
  error: unknown;
  onApprove: (args: { note?: string; validityHours?: number }) => void;
}> = ({ bundle, action, reason, busy, error, onApprove }) => {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('72');
  const approvals = bundle.approvals ?? [];
  const { current, expired } = currentApproval(bundle);
  const failed = errorText(error);
  return (
    <section className="cpm-config-tabpanel" aria-label="Approval">
      <div className="cpm-panel-head">
        <div className="cpm-title-row">
          <h2 className="cpm-panel-title">{current ? `Approved by ${current.approver}` : 'No approval binds the current content'}</h2>
          {current && expired && (AWAITING.has(bundle.state) ? <TonePill tone="bad" glyph="✕">Expired</TonePill> : <TonePill tone="muted" glyph="○">Expired</TonePill>)}
        </div>
      </div>
      {approvals.length > 0 && (
        <div className="cpm-config-table__wrap">
          <table className="cpm-table" aria-label="Approvals">
            <thead><tr><th>Decision</th><th>Approver</th><th>Content</th><th>Expires · {zoneTag()}</th><th>Note</th></tr></thead>
            <tbody>
              {approvals.map(a => (
                <tr key={a.approvalId} className={a.bindsCurrentContent ? undefined : 'cpm-config-approval--stale'}>
                  <td>{a.decision === 'APPROVED'
                    ? <TonePill tone={a.bindsCurrentContent ? 'good' : 'muted'} glyph="✓">Approved</TonePill>
                    : <TonePill tone="bad" glyph="✕">Rejected</TonePill>}</td>
                  <td>{a.approver} ({a.role})</td>
                  <td className="cpm-mono" title={a.contentHash}>{shortHash(a.contentHash, 8)}{a.bindsCurrentContent ? '' : ' (previous content)'}</td>
                  <td>{a.expiresAt ? stamp(a.expiresAt) : 'never expires'}</td>
                  <td>{a.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="cpm-title-row">
        <h3 className="cpm-howto__title">Approve</h3>
        <Toggletip variant="how-to" label="How an approval binds">
          <p>An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is refused by the server.</p>
        </Toggletip>
      </div>
      <div className="cpm-config-form">
        <label className="cpm-field cpm-config-form__grow"><span className="cpm-field__label">Approval note</span>
          <textarea className="cpm-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} disabled={!action.enabled}
            placeholder="Why this content is approved (recorded, hash-bound)" /></label>
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Valid for (h)</span>
          <input className="cpm-input" value={hours} onChange={e => setHours(e.target.value)} inputMode="numeric" disabled={!action.enabled} /></label>
        <ReasonedButton variant={action.enabled ? 'raised' : 'normal'} disabled={!action.enabled || busy} reason={reason}
          onClick={() => onApprove({ note: note || undefined, validityHours: Number(hours) || undefined })}>
          {busy ? 'Recording…' : 'Approve'}
        </ReasonedButton>
      </div>
      {failed && <p className="cpm-field__error" role="alert">{failed}</p>}
    </section>
  );
};

export default ApprovalTab;
