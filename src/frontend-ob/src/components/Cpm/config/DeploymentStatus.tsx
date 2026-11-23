/**
 * v2.5 Task 3D.1 (spec §5.6-5.7; NR-051): a deployment as the control plane records it - the state in plain words, the ACK
 * matrix per required worker (PREPARE / APPLY, the reason of a NACK), the actual active bundle per job, the probe. A partial
 * matrix never reads as active: the word comes from the server's state, nothing else.
 * CHG-169 (owner review, the approved sample): the body of the selected deployment's panel on the Deployments tab (it was one
 * card per deployment with its own Roll back; Roll back is now offered once, at the tab's head). The heading is the state text;
 * rows Effective · by, Epoch, Probe; the matrix, the active bundle per job only when one is not this bundle; the mixed-release
 * alert, the semantics and the observers. CHG-184 (owner review item 0): no jar, no hash and no rolled back deployment id; a
 * worker on another build reads "different software releases", a job on another bundle "another bundle".
 * CHG-193 (final review M8): whether the deployment is a rollback is a row again (Yes / No), without the rolled back id.
 * Task 8 (journey): the body reads in plain words - when it takes effect, "n of m ready", the refusals' reasons; no worker names,
 * PREPARE / APPLY, ACK, epoch, semantics or observers (none of these is shown anywhere in Gate Configuration any more).
 */
import React from 'react';
import { KvRow } from '../shared';
import type { Deployment } from '../../../api/cpm/config';
import { settingName, stampZoned } from './configWords';
import { ackSummary } from './lifecycle';

/** The builds (jars) the workers answered from; more than one is a mixed fleet. */
export const jarsOf = (d: Deployment): string[] =>
  [...new Set(d.ackMatrix.flatMap(m => [m.prepare?.jarSha256, m.apply?.jarSha256]).filter((x): x is string => !!x))];

/** A refusal in words; the raw reason is kept for the element's title. */
export const refusalWords = (reason: string): string => {
  const unknown = /^UNKNOWN_PROPERTY\s+(\S+)/.exec(reason);
  if (unknown) return `Setting not known: ${settingName(unknown[1])}`;
  return /HASH|CATALOGUE/i.test(reason) ? 'Different settings list' : 'Refused';
};

export const DeploymentDetail: React.FC<{ deployment: Deployment }> = ({ deployment: d }) => {
  const mixed = jarsOf(d).length > 1;
  const probe = d.probeResults as { pinnedResults?: number; checkedAt?: string } | null;
  const summary = ackSummary(d);
  const refusals = d.ackMatrix.flatMap(m => [m.prepare, m.apply]).filter(a => a?.status === 'NACK' && a.reason).map(a => a!.reason!);
  return (
    <div className="cpm-config-depdetail" data-testid="deployment-status" data-state={d.state}>
      <KvRow label="Takes effect">{d.scheduledFor ? `at ${stampZoned(d.scheduledFor)}` : 'immediately'} · by {d.createdBy}</KvRow>
      <KvRow label="Ready"><span className={summary.complete ? undefined : 'cpm-config-deployment__partial'}>{summary.text}</span></KvRow>
      <KvRow label="Rollback">{d.kind === 'ROLLBACK' || d.rollbackOf ? 'Yes' : 'No'}</KvRow>
      {probe && <KvRow label="Results on it">{probe.pinnedResults ?? 0}{probe.checkedAt ? ` · checked ${stampZoned(probe.checkedAt)}` : ''}</KvRow>}
      {mixed && <p className="cpm-field__error" role="alert">Different software versions are running.</p>}
      {refusals.map((r, i) => <p key={i} className="cpm-field__error" role="alert" title={r}>{refusalWords(r)}</p>)}
    </div>
  );
};

export default DeploymentDetail;
