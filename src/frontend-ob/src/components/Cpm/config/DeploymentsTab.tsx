/**
 * CHG-169 (owner review, the approved sample): a bundle's Deployments tab. Effective from, Activate and Roll back once, at the
 * head (Roll back was offered twice on one screen: in the lifecycle column and on the activation's card); the deployments of
 * this version as a list, newest first (kind, time, the ACK summary, the state in words), the selected one in the panel beside
 * it (a drawer below 1280 px) with its ACK matrix. Activate sends { scheduledFor } as before; Roll back now asks first (owner
 * answer 2a) and then sends the rollback of the verified activation, as before. Polling while a deployment is in flight stays
 * in the deployments read.
 */
import React, { useState } from 'react';
import { Inspector } from '../../../ui/Inspector';
import { QueryError } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { stamp, zoneTag } from '../events/eventTime';
import type { Bundle, Deployment } from '../../../api/cpm/config';
import { deploymentStateText } from './configSupport';
import { deploymentStateWord } from './configWords';
import { WordPill } from './configBits';
import { ackSummary, errorText, type LifecycleAction } from './lifecycle';
import { DeploymentDetail } from './DeploymentStatus';
import { RollbackDialog } from './RollbackDialog';

export interface DeploymentsTabProps {
  bundle: Bundle;
  deployments: Deployment[];
  deploymentsLoading: boolean;
  deploymentsError: unknown;
  retryDeployments: () => void;
  activate: LifecycleAction;
  rollback: LifecycleAction;
  /** The reason under each button, or null when the frozen reason above already says it. */
  reasons: { activate: string | null; rollback: string | null };
  busy: { deploy: boolean; rollback: boolean };
  errors: { deploy: unknown; rollback: unknown };
  /** The verified activation a rollback undoes (the newest ACTIVE_VERIFIED activation of this version). */
  verifiedActivation: Deployment | undefined;
  onDeploy: (args: { scheduledFor?: string | null }) => void;
  onRollback: (deploymentId: string) => void;
}

export const DeploymentsTab: React.FC<DeploymentsTabProps> = ({ bundle, deployments, deploymentsLoading, deploymentsError, retryDeployments, activate, rollback, reasons, busy, errors, verifiedActivation, onDeploy, onRollback }) => {
  const [schedule, setSchedule] = useState('');
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const selected = deployments.find(d => d.deploymentId === chosen) ?? deployments[0];
  const select = (id: string) => { setChosen(id); setDrawer(true); };
  const deployFailed = errorText(errors.deploy);
  const rollbackFailed = errorText(errors.rollback);

  return (
    <>
      <section className="cpm-surface cpm-config-head" aria-label="Activate and roll back">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Effective from (optional, ISO)</span>
          <input className="cpm-input" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="now" disabled={!activate.enabled} /></label>
        <ReasonedButton variant={activate.enabled ? 'raised' : 'normal'} disabled={!activate.enabled || busy.deploy} reason={reasons.activate}
          onClick={() => onDeploy({ scheduledFor: schedule || null })}>
          {busy.deploy ? 'Scheduling…' : 'Activate'}
        </ReasonedButton>
        <ReasonedButton variant={rollback.enabled ? 'raised' : 'normal'} disabled={!rollback.enabled || busy.rollback || !verifiedActivation} reason={reasons.rollback}
          onClick={() => setAsking(true)}>
          {busy.rollback ? 'Rolling back…' : 'Roll back'}
        </ReasonedButton>
        {deployFailed && <span className="cpm-field__error" role="alert">{deployFailed}</span>}
        {rollbackFailed && <span className="cpm-field__error" role="alert">{rollbackFailed}</span>}
      </section>
      {deploymentsError != null && <QueryError error={deploymentsError} retry={retryDeployments} />}
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-config-list" aria-label="Deployments">
          <table className="cpm-table cpm-config-rows">
            <thead><tr><th>Deployment · {zoneTag()}</th><th>State</th></tr></thead>
            <tbody>
              {deploymentsLoading && deployments.length === 0 && <tr><td colSpan={2} className="cpm-copy cpm-config-rows__empty" aria-busy="true">Loading the deployments…</td></tr>}
              {!deploymentsLoading && deploymentsError == null && deployments.length === 0 && <tr><td colSpan={2} className="cpm-copy cpm-config-rows__empty">No deployment of this version yet.</td></tr>}
              {deployments.map(d => {
                const isSelected = d.deploymentId === selected?.deploymentId;
                return (
                  <tr key={d.deploymentId} className={`cpm-reg-row${isSelected ? ' cpm-reg-row--selected' : ''}`} aria-current={isSelected ? 'true' : undefined} onClick={() => select(d.deploymentId)}>
                    <td>
                      <button type="button" className="cpm-config-rowbtn" onClick={e => { e.stopPropagation(); select(d.deploymentId); }}>{d.kind === 'ROLLBACK' ? 'Rollback' : 'Activation'}</button>
                      <div className="cpm-event-row__sub">{stamp(d.createdAt)} · {ackSummary(d).text}</div>
                    </td>
                    <td><WordPill word={deploymentStateWord(d)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        {selected && (
          <Inspector title={deploymentStateText(selected)} open={drawer} onClose={() => setDrawer(false)}>
            <DeploymentDetail deployment={selected} />
          </Inspector>
        )}
      </div>
      {verifiedActivation && (
        <RollbackDialog open={asking} bundle={bundle} activation={verifiedActivation} onCancel={() => setAsking(false)}
          onConfirm={() => { setAsking(false); onRollback(verifiedActivation.deploymentId); }} />
      )}
    </>
  );
};

export default DeploymentsTab;
