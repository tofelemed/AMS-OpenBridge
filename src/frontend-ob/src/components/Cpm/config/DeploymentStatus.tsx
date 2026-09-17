/**
 * v2.5 Task 3D.1 (spec §5.6-5.7; NR-051): a deployment as the control plane records it - the state
 * in plain words, the ACK matrix per required worker (PREPARE / APPLY, the jar and hash each one
 * answered with, the reason of a NACK), the actual active bundle per job, the probe, the rollback.
 * A partial matrix never reads as active: the word comes from the server's state, nothing else.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDateTime } from '../shared';
import type { Deployment, WorkerAck } from '../../../api/cpm/config';
import { deploymentStateText, deploymentStateTone, shortHash } from './configSupport';

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
  return (
    <section className="cpm-surface cpm-config-deployment" data-testid="deployment-status" data-state={d.state}>
      <PanelHead eyebrow={d.kind === 'ROLLBACK' ? 'Rollback deployment' : 'Deployment'} title={deploymentStateText(d)}
        right={<TonePill tone={deploymentStateTone(d.state)}>{d.state}</TonePill>} />
      <KvRow label="bundle hash">
        <span className="cpm-mono">{shortHash(d.contentHash, 16)}</span>
      </KvRow>
      <KvRow label="scheduled / effective">{d.scheduledFor ? fmtDateTime(d.scheduledFor) : 'immediately'}</KvRow>
      <KvRow label="epoch">{d.epoch ?? '—'}</KvRow>
      <KvRow label="created">{d.createdBy} · {fmtDateTime(d.createdAt)}</KvRow>
      {d.rollbackOf && <KvRow label="rolls back">{d.rollbackOf}</KvRow>}
      {jars.size > 1 && <p className="cpm-field__error" role="alert">Workers answered from {jars.size} different jars - the control plane never verifies a mixed fleet.</p>}
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
      {probe && <KvRow label="probe">{probe.pinnedResults ?? 0} result(s) pinned to this hash{probe.checkedAt ? ` · checked ${fmtDateTime(probe.checkedAt)}` : ''}</KvRow>}
      <p className="cpm-copy">{d.semantics}</p>
      {d.state === 'ACTIVE_VERIFIED' && d.kind === 'ACTIVATE' && (
        <ObcButton variant="flat" disabled={!canRollback || rollbackPending} onClick={() => onRollback(d.deploymentId)}>
          {rollbackPending ? 'Rolling back…' : 'Roll back to the previous bundle'}
        </ObcButton>
      )}
      {!canRollback && d.state === 'ACTIVE_VERIFIED' && <p className="cpm-copy">Rollback needs cpm.config.rollback.</p>}
    </section>
  );
};
