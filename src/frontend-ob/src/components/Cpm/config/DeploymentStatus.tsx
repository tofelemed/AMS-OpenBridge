/**
 * v2.5 Task 3D.1 (spec §5.6-5.7; NR-051): a deployment as the control plane records it - the state in plain words, the ACK
 * matrix per required worker (PREPARE / APPLY, the reason of a NACK), the actual active bundle per job, the probe. A partial
 * matrix never reads as active: the word comes from the server's state, nothing else.
 * CHG-169 (owner review, the approved sample): the body of the selected deployment's panel on the Deployments tab (it was one
 * card per deployment with its own Roll back; Roll back is now offered once, at the tab's head). The heading is the state text;
 * rows Effective · by, Epoch, Probe; the matrix, the active bundle per job only when one is not this bundle; the mixed-release
 * alert, the semantics and the observers. CHG-184 (owner review item 0): no jar, no hash and no rolled back deployment id; a
 * worker on another build reads "different software releases", a job on another bundle "another bundle".
 */
import React from 'react';
import { KvRow, TonePill } from '../shared';
import type { Deployment, WorkerAck } from '../../../api/cpm/config';
import { stampZoned } from './configWords';
import { ackSummary } from './lifecycle';

const ackCell = (a: WorkerAck | null, expectedHash: string): React.ReactNode => {
  if (!a) return <TonePill tone="muted">pending</TonePill>;
  const ok = a.status === 'ACK' && a.bundleHash === expectedHash;
  return (
    <span className="cpm-config-ack">
      <TonePill tone={ok ? 'good' : 'bad'} glyph={ok ? '✓' : '✕'}>{a.status}{a.status === 'ACK' && a.bundleHash !== expectedHash ? ' (other bundle)' : ''}</TonePill>
      {a.reason && <span className="cpm-config-ack__reason">{a.reason}</span>}
    </span>
  );
};

/** The builds (jars) the workers answered from; more than one is a mixed fleet. */
export const jarsOf = (d: Deployment): string[] =>
  [...new Set(d.ackMatrix.flatMap(m => [m.prepare?.jarSha256, m.apply?.jarSha256]).filter((x): x is string => !!x))];

export const DeploymentDetail: React.FC<{ deployment: Deployment }> = ({ deployment: d }) => {
  const jars = jarsOf(d);
  const probe = d.probeResults as { pinnedResults?: number; checkedAt?: string } | null;
  const summary = ackSummary(d);
  const appliedHere = (m: Deployment['ackMatrix'][number]) => m.apply?.status === 'ACK' && m.apply.bundleHash === d.contentHash;
  const showActive = d.ackMatrix.some(m => !appliedHere(m));
  return (
    <div className="cpm-config-depdetail" data-testid="deployment-status" data-state={d.state}>
      <KvRow label="Effective">{d.scheduledFor ? stampZoned(d.scheduledFor) : 'immediately'} · by {d.createdBy}</KvRow>
      <KvRow label="Epoch">{d.epoch ?? '—'}</KvRow>
      {probe && <KvRow label="Probe">{probe.pinnedResults ?? 0} result(s) pinned to this bundle{probe.checkedAt ? ` · checked ${stampZoned(probe.checkedAt)}` : ''}</KvRow>}
      {jars.length > 1 && <p className="cpm-field__error" role="alert">Workers answered from {jars.length} different software releases - the control plane never verifies a mixed fleet.</p>}
      <div className="cpm-config-deployment__matrix">
        <p className="cpm-config-deployment__sum">
          <strong className={summary.complete ? undefined : 'cpm-config-deployment__partial'}>{summary.text}</strong>
          <span className="cpm-event-row__sub"> · {d.ackMatrix.length} required worker{d.ackMatrix.length === 1 ? '' : 's'}</span>
        </p>
        <div className="cpm-matrix-scroll">
          <table className="cpm-table" data-table="ack-matrix">
            <thead>
              <tr>
                <th>Required worker</th><th>PREPARE</th><th>APPLY</th>
                {showActive && <th>Active bundle on this job</th>}
              </tr>
            </thead>
            <tbody>
              {d.ackMatrix.map(m => (
                <tr key={m.jobName}>
                  <td>{m.jobName.replace(/^AMS - CPLM /, '')}</td>
                  <td>{ackCell(m.prepare, d.contentHash)}</td>
                  <td>{ackCell(m.apply, d.contentHash)}</td>
                  {showActive && <td>{appliedHere(m) ? 'this bundle' : m.apply?.status === 'ACK' ? 'another bundle' : m.apply?.status === 'NACK' ? 'refused' : 'not yet applied'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cpm-event-row__sub">{d.semantics}</p>
        {d.observers && d.observers.length > 0 && <p className="cpm-event-row__sub">Observers: {d.observers.join(', ')} (read no catalogue property; not required to answer)</p>}
      </div>
    </div>
  );
};

export default DeploymentDetail;
