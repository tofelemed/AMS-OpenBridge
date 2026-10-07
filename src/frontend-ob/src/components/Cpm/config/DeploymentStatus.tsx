/**
 * v2.5 Task 3D.1 (spec §5.6-5.7; NR-051): a deployment as the control plane records it - the state
 * in plain words, the ACK matrix per required worker (PREPARE / APPLY, the jar and hash each one
 * answered with, the reason of a NACK), the actual active bundle per job, the probe, the rollback.
 * A partial matrix never reads as active: the word comes from the server's state, nothing else.
 * 2026-09-17 audit F18: one timeline entry per deployment - the state line, one summary line of the
 * matrix ("5 of 5 PREPARE · 5 of 5 APPLY"), the matrix itself unfolded only when something is not
 * verified (or on request), so two deployments no longer repeat two 6-row tables.
 */
import React from 'react';
import { KvRow, PanelHead, TonePill, fmtDateTime } from '../shared';
import type { Deployment, WorkerAck } from '../../../api/cpm/config';
import { deploymentStateText, deploymentStateTone, shortHash } from './configSupport';
import { ackSummary } from './lifecycle';
import { ReasonedButton } from '../ReasonedButton';

const ackCell = (a: WorkerAck | null, expectedHash: string): React.ReactNode => {
  if (!a) return <TonePill tone="muted">pending</TonePill>;
  const matches = a.bundleHash === expectedHash;
  return (
    <span className="cpm-config-ack">
      <TonePill tone={a.status === 'ACK' && matches ? 'good' : 'bad'}>{a.status}{a.status === 'ACK' && !matches ? ' (other hash)' : ''}</TonePill>
      <span className="cpm-mono cpm-config-ack__jar" title={a.jarSha256}>jar {shortHash(a.jarSha256, 8)}</span>
      {a.reason && <span className="cpm-config-ack__reason">{a.reason}</span>}
    </span>
  );
};

export const DeploymentStatus: React.FC<{
  deployment: Deployment;
  canRollback: boolean;
  rollbackPending: boolean;
  onRollback: (deploymentId: string) => void;
}> = ({ deployment: d, canRollback, rollbackPending, onRollback }) => {
  const jars = new Set(d.ackMatrix.flatMap(m => [m.prepare?.jarSha256, m.apply?.jarSha256]).filter((x): x is string => !!x));
  const probe = d.probeResults as { pinnedResults?: number; checkedAt?: string } | null;
  const summary = ackSummary(d);
  const settled = d.state === 'ACTIVE_VERIFIED' || d.state === 'ROLLED_BACK';
  return (
    <li className={`cpm-surface cpm-config-deployment cpm-tone-${deploymentStateTone(d.state, d)}`} data-testid="deployment-status" data-state={d.state}>
      <PanelHead eyebrow={`${d.kind === 'ROLLBACK' ? 'Rollback' : 'Deployment'} · ${fmtDateTime(d.createdAt)}`} title={deploymentStateText(d)}
        right={<TonePill tone={deploymentStateTone(d.state, d)}>{d.state}</TonePill>} />
      <KvRow label="bundle hash"><span className="cpm-mono" title={d.contentHash}>{shortHash(d.contentHash, 16)}</span></KvRow>
      <KvRow label="effective">{d.scheduledFor ? fmtDateTime(d.scheduledFor) : 'immediately'} · epoch {d.epoch ?? '—'} · by {d.createdBy}</KvRow>
      {d.rollbackOf && <KvRow label="rolls back"><span className="cpm-mono" title={d.rollbackOf}>{shortHash(d.rollbackOf, 12)}</span></KvRow>}
      {jars.size > 1 && <p className="cpm-field__error" role="alert">Workers answered from {jars.size} different jars - the control plane never verifies a mixed fleet.</p>}
      <details className="cpm-config-deployment__matrix" open={!settled || summary.nacks > 0 || undefined}>
        <summary>
          <span className={summary.complete ? undefined : 'cpm-config-deployment__partial'}>{summary.text}</span>
          <span className="cpm-event-row__sub"> · {d.ackMatrix.length} required worker{d.ackMatrix.length === 1 ? '' : 's'}</span>
        </summary>
        <div className="cpm-matrix-scroll">
          <table className="cpm-table" data-table="ack-matrix">
            <thead><tr><th>required worker</th><th>PREPARE</th><th>APPLY</th><th>active bundle on this job</th></tr></thead>
            <tbody>
              {d.ackMatrix.map(m => (
                <tr key={m.jobName}>
                  <td>{m.jobName}</td>
                  <td>{ackCell(m.prepare, d.contentHash)}</td>
                  <td>{ackCell(m.apply, d.contentHash)}</td>
                  <td className="cpm-mono">{m.apply?.status === 'ACK' ? shortHash(m.apply.bundleHash, 12) : m.apply?.status === 'NACK' ? 'refused' : 'not yet applied'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.observers && d.observers.length > 0 && <p className="cpm-event-row__sub">Observers: {d.observers.join(', ')} (read no catalogue property; not required to answer)</p>}
      </details>
      {probe && <KvRow label="probe">{probe.pinnedResults ?? 0} result(s) pinned to this hash{probe.checkedAt ? ` · checked ${fmtDateTime(probe.checkedAt)}` : ''}</KvRow>}
      <p className="cpm-event-row__sub">{d.semantics}</p>
      {d.state === 'ACTIVE_VERIFIED' && d.kind === 'ACTIVATE' && (
        <ReasonedButton variant="flat" disabled={!canRollback || rollbackPending} reason={!canRollback ? 'Needs the cpm.config.rollback permission' : null}
          onClick={() => onRollback(d.deploymentId)}>
          {rollbackPending ? 'Rolling back…' : 'Roll back to the previous bundle'}
        </ReasonedButton>
      )}
      {!canRollback && d.state === 'ACTIVE_VERIFIED' && <p className="cpm-copy">Rollback needs cpm.config.rollback.</p>}
    </li>
  );
};
