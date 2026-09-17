/**
 * v2.5 Task 3D.1 (spec §5.6) · 2026-09-17 audit F18: the lifecycle the server owns, read top to bottom.
 * The steps a version walks with the one it is on; the actions in that order - Validate · Shadow ·
 * Approve · Activate · Roll back - each disabled one carrying the reason (state or permission); the
 * approvals recorded so far as compact rows (an approval is bound to the content hash and expires).
 * Every button asks the server; a self-approval, an expired approval or a stale hash is the server's
 * 403 / 409, shown as such. Replaces ApprovalPanel.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDateTime } from '../shared';
import { ApiError } from '../../../api/apiFetch';
import type { Bundle } from '../../../api/cpm/config';
import { bundleStateTone, shortHash } from './configSupport';
import { lifecycleActions, lifecycleSteps, type LifecycleAction, type LifecyclePerms } from './lifecycle';

const errorText = (e: unknown): string | null => {
  if (!e) return null;
  if (e instanceof ApiError) return e.status === 403 ? `Refused: ${e.message}` : e.status === 409 ? `Conflict: ${e.message}` : e.message;
  return e instanceof Error ? e.message : String(e);
};

export interface LifecyclePanelProps {
  bundle: Bundle;
  perms: LifecyclePerms;
  pending: { validate: boolean; approve: boolean; deploy: boolean; rollback: boolean };
  errors: { validate: unknown; approve: unknown; deploy: unknown; rollback: unknown };
  hasVerifiedActivation: boolean;
  onValidate: () => void;
  onShadow: () => void;
  onApprove: (args: { note?: string; validityHours?: number }) => void;
  onDeploy: (args: { scheduledFor?: string | null }) => void;
  onRollback: () => void;
}

export const LifecyclePanel: React.FC<LifecyclePanelProps> = ({ bundle, perms, pending, errors, hasVerifiedActivation, onValidate, onShadow, onApprove, onDeploy, onRollback }) => {
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('72');
  const [schedule, setSchedule] = useState('');
  const approvals = bundle.approvals ?? [];
  const current = approvals.find(a => a.bindsCurrentContent && a.decision === 'APPROVED');
  const expired = current?.expiresAt ? new Date(current.expiresAt).getTime() < Date.now() : false;
  const steps = lifecycleSteps(bundle.state);
  const actions = lifecycleActions(bundle, perms, expired, hasVerifiedActivation);
  // a frozen version blocks every editing action for the same reason: say it once, not under each button
  const shared = actions.filter(a => !a.enabled && a.reason?.startsWith('This version is ')).map(a => a.reason);
  const frozenReason = shared.length >= 2 && shared.every(r => r === shared[0]) ? shared[0] : null;

  const busy: Record<LifecycleAction['key'], boolean> = { validate: pending.validate, shadow: false, approve: pending.approve, deploy: pending.deploy, rollback: pending.rollback };
  const busyLabel: Record<LifecycleAction['key'], string> = { validate: 'Validating…', shadow: 'Shadow', approve: 'Recording…', deploy: 'Scheduling…', rollback: 'Rolling back…' };
  const err: Record<LifecycleAction['key'], unknown> = { validate: errors.validate, shadow: null, approve: errors.approve, deploy: errors.deploy, rollback: errors.rollback };
  const run: Record<LifecycleAction['key'], () => void> = {
    validate: onValidate, shadow: onShadow,
    approve: () => onApprove({ note: note || undefined, validityHours: Number(hours) || undefined }),
    deploy: () => onDeploy({ scheduledFor: schedule || null }),
    rollback: onRollback,
  };

  return (
    <section className="cpm-surface cpm-lifecycle" data-testid="approval-panel">
      <PanelHead eyebrow="Lifecycle" title={`v${bundle.version} · ${shortHash(bundle.contentHash, 12)}`} right={<TonePill tone={bundleStateTone(bundle.state)}>{bundle.state}</TonePill>} />
      <ol className="cpm-lifecycle__steps" aria-label="Lifecycle steps">
        {steps.map(s => (
          <li key={s.key} className={`cpm-lifecycle__step cpm-lifecycle__step--${s.status} cpm-tone-${s.tone}`} data-step={s.key} data-status={s.status} aria-current={s.status === 'current' ? 'step' : undefined}>
            <span className="cpm-lifecycle__dot" aria-hidden />
            <span className="cpm-lifecycle__label">{s.label}</span>
          </li>
        ))}
      </ol>
      <KvRow label="created">{bundle.createdBy} · {fmtDateTime(bundle.createdAt)}</KvRow>
      <KvRow label="updated">{fmtDateTime(bundle.updatedAt)}</KvRow>
      {bundle.note && <KvRow label="note">{bundle.note}</KvRow>}

      <PanelHead eyebrow="Actions" title="In order" />
      {frozenReason && <p className="cpm-copy cpm-lifecycle__frozen">{frozenReason}</p>}
      <ol className="cpm-lifecycle__actions" aria-label="Lifecycle actions">
        {actions.map(a => (
          <li key={a.key} className="cpm-lifecycle__action" data-action={a.key} data-enabled={a.enabled}>
            <div className="cpm-lifecycle__action-row">
              <ObcButton variant={a.enabled ? 'raised' : 'flat'} disabled={!a.enabled || busy[a.key]} onClick={run[a.key]}>{busy[a.key] ? busyLabel[a.key] : a.label}</ObcButton>
              {a.reason && a.reason !== frozenReason && <span className="cpm-copy cpm-lifecycle__reason">{a.reason}</span>}
              {errorText(err[a.key]) && <span className="cpm-field__error" role="alert">{errorText(err[a.key])}</span>}
            </div>
            {a.key === 'approve' && a.enabled && (
              <div className="cpm-lifecycle__form">
                <label className="cpm-field"><span className="cpm-field__label">Approval note</span>
                  <textarea className="cpm-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Why this content is approved (recorded, hash-bound)" /></label>
                <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Valid for (h)</span>
                  <input className="cpm-input" value={hours} onChange={e => setHours(e.target.value)} inputMode="numeric" /></label>
              </div>
            )}
            {a.key === 'deploy' && a.enabled && (
              <div className="cpm-lifecycle__form">
                <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Effective from (optional, ISO)</span>
                  <input className="cpm-input" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="now" /></label>
              </div>
            )}
          </li>
        ))}
      </ol>

      <PanelHead eyebrow="Approval" title={current ? `approved by ${current.approver}${expired ? ' (expired)' : ''}` : 'no approval binds the current content'} />
      {approvals.length > 0 && (
        <ul className="cpm-lifecycle__approvals" aria-label="Approvals">
          {approvals.map(a => (
            <li key={a.approvalId} className={`cpm-lifecycle__approval${a.bindsCurrentContent ? '' : ' cpm-config-approval--stale'}`}>
              <TonePill tone={a.decision === 'APPROVED' ? (a.bindsCurrentContent ? 'good' : 'muted') : 'bad'}>{a.decision}</TonePill>
              <span>{a.approver} ({a.role})</span>
              <span className="cpm-mono" title={a.contentHash}>{shortHash(a.contentHash, 8)}{a.bindsCurrentContent ? '' : ' (previous content)'}</span>
              <span className="cpm-event-row__sub">{a.expiresAt ? `expires ${fmtDateTime(a.expiresAt)}` : 'never expires'}{a.note ? ` · ${a.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
