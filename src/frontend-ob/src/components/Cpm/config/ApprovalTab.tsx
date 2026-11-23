/**
 * CHG-169 (owner review, the approved sample): a bundle's Approval tab - the approvals recorded, then Approve with its note. Approve
 * sends what the lifecycle column sent ({ note, validityHours }); four eyes, an expired approval and a stale hash are the server's
 * refusals, shown as "Refused:" / "Conflict:". An approval that ran out after the version was activated no longer reads as a
 * warning: its expiry only matters while the version still waits to be activated.
 * CHG-184 (owner review item 0): no hash on screen. CHG-220 (owner, 23 Nov): an expired approval can be given again.
 * Task 8 (journey, the approved change-approve look): rows Change, Applies to, On past data, Note (optional), the rule's label as the one
 * button ("Approve alone", never a role in brackets), the history in words (who, decision, when). No rule sentence (the step bar's ?
 * says it), no validity field (an approval lasts 72 h; sent as before), no Send back (the server has no such action). Additive
 * optional props: `changes` (before / after of the changed settings; without them the bundle's own values are named), `appliesTo`.
 */
import React, { useState } from 'react';
import { KvRow, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { changeNames, plainNote, stampZoned, valueWords } from './configWords';
import type { Bundle } from '../../../api/cpm/config';
import { errorText, type LifecycleAction, type SettingChange } from './lifecycle';
import { useShadowReport } from './ShadowComparison';

/** The states in which an expired approval still blocks something (approving again, activating again). */
const AWAITING = new Set(['APPROVED', 'EXPIRED', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED']);
const VALID_HOURS = 72;

export const currentApproval = (bundle: Bundle) => {
  const current = (bundle.approvals ?? []).find(a => a.bindsCurrentContent && a.decision === 'APPROVED');
  const expired = current?.expiresAt ? new Date(current.expiresAt).getTime() < Date.now() : false;
  return { current, expired };
};

/** The changed settings in words; without a before / after, the values the bundle's own layer sets. */
export function changeLine(bundle: Bundle, changes?: SettingChange[]): string {
  const list = changes ?? bundle.layers.filter(l => l.kind === bundle.scopeKind)
    .flatMap(l => Object.entries(l.content ?? {}).map(([property, after]) => ({ property, before: undefined, after })));
  if (list.length === 0) return '—';
  const names = changeNames(list.map(c => c.property));
  return list.map(c => `${names.get(c.property)} ${c.before === undefined ? '' : `${valueWords(c.before)} → `}${valueWords(c.after)}`).join(', ');
}

export const appliesToWord = (bundle: Bundle): string =>
  bundle.scopeKind === 'LOOP' ? bundle.scopeRef ?? 'This loop' : bundle.scopeKind === 'PROFILE' ? `All ${bundle.scopeRef ?? ''} loops`.replace('  ', ' ') : 'The whole plant';

export const ApprovalTab: React.FC<{
  bundle: Bundle;
  action: LifecycleAction;
  /** The reason under Approve, or null when the frozen reason above already says it. */
  reason: string | null;
  busy: boolean;
  error: unknown;
  onApprove: (args: { note?: string; validityHours?: number }) => void;
  changes?: SettingChange[];
  appliesTo?: string;
}> = ({ bundle, action, reason, busy, error, onApprove, changes, appliesTo }) => {
  const [note, setNote] = useState('');
  const approvals = bundle.approvals ?? [];
  const { current, expired } = currentApproval(bundle);
  const failed = errorText(error);
  const recorded = bundle.shadow as { analysisRunId?: string; contentHash?: string } | null;
  const tried = !!recorded?.analysisRunId && (!recorded.contentHash || recorded.contentHash === bundle.contentHash);
  const report = useShadowReport(bundle.bundleId, recorded?.analysisRunId, tried);
  const changed = report.data ? report.data.windows.filter(w => w.changed.length > 0 || w.diagnosisBefore !== w.diagnosisAfter).length : 0;
  const past = !tried ? 'Not tried' : report.data?.runState !== 'FINISHED' ? (report.isError ? 'Not read' : 'Not finished')
    : report.data.comparedWindows === 0 ? (report.data.shadowRows === 0 ? 'Not compared — no data in the period' : 'Not compared — no live results to compare')
    : changed === 0 ? 'No result changes' : `${changed} ${changed === 1 ? 'result changes' : 'results change'}`;
  return (
    <section className="cpm-config-tabpanel" aria-label="Approval">
      <KvRow label="Change">{changeLine(bundle, changes)}</KvRow>
      <KvRow label="Applies to">{appliesTo ?? appliesToWord(bundle)}</KvRow>
      <KvRow label="On past data">{past}</KvRow>
      {current && (
        <div className="cpm-title-row">
          <h2 className="cpm-panel-title">Approved by {current.approver}</h2>
          {expired && (AWAITING.has(bundle.state) ? <TonePill tone="bad" glyph="✕">Expired</TonePill> : <TonePill tone="muted" glyph="○">Expired</TonePill>)}
        </div>
      )}
      {approvals.length > 0 && (
        <div className="cpm-config-table__wrap">
          <table className="cpm-table" aria-label="Approvals">
            <thead><tr><th>Approver</th><th>Decision</th><th>When</th><th>Note</th></tr></thead>
            <tbody>
              {approvals.map(a => (
                <tr key={a.approvalId} className={a.bindsCurrentContent ? undefined : 'cpm-config-approval--stale'}>
                  <td>{a.approver}</td>
                  <td>{a.decision === 'APPROVED'
                    ? <TonePill tone={a.bindsCurrentContent ? 'good' : 'muted'} glyph="✓">{a.bindsCurrentContent ? 'Approved' : 'Approved earlier version'}</TonePill>
                    : <TonePill tone="bad" glyph="✕">Rejected</TonePill>}</td>
                  <td>{stampZoned(a.createdAt)}</td>
                  <td>{plainNote(a.note) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="cpm-config-form">
        <label className="cpm-field cpm-config-form__grow"><span className="cpm-field__label">Note (optional)</span>
          <textarea className="cpm-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} disabled={!action.enabled} /></label>
        <ReasonedButton variant={action.enabled ? 'raised' : 'normal'} disabled={!action.enabled || busy} reason={reason}
          onClick={() => onApprove({ note: note || undefined, validityHours: VALID_HOURS })}>
          {busy ? 'Recording…' : action.label}
        </ReasonedButton>
      </div>
      {failed && <p className="cpm-field__error" role="alert">{failed}</p>}
    </section>
  );
};

export default ApprovalTab;
