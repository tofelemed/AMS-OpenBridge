/**
 * CHG-169 (owner review, the approved sample): a bundle's Deployments tab. Effective from, Activate and Roll back once, at the
 * head (Roll back was offered twice on one screen: in the lifecycle column and on the activation's card); the deployments of
 * this version as a list, newest first (kind, time, the ACK summary, the state in words), the selected one in the panel beside
 * it (a drawer below 1280 px) with its ACK matrix. Activate sends { scheduledFor } as before; Roll back now asks first (owner
 * answer 2a) and then sends the rollback of the verified activation, as before. Polling while a deployment is in flight stays
 * in the deployments read.
 * CHG-220 (Gate Configuration check): gap 2 - a deployment with a later effective time says when it takes effect while it
 * waits; minor - an Effective from that is not a date and time is said here, before anything is sent.
 * Task 8 (journey): "Takes effect at · <zone>" is a date and time input read in the plant zone; the panel says "5 of 5 ready" (once) and the row "takes effect at
 * 24 Nov 06:00 GST"; the panel title is a short phrase; Roll back names the version that runs. Additive optional prop: `previous` (the
 * bundle a rollback brings back, for the one line of what changes). Final review M-a: the step's word, Deploy, for the button and the row;
 * a row's state in the panel title's words ("Running", never "Active (verified)").
 */
import React, { useState } from 'react';
import { Inspector } from '../../../ui/Inspector';
import { QueryError } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { stamp, zoneTag } from '../events/eventTime';
import type { Bundle, Deployment } from '../../../api/cpm/config';
import { siteZone, zoneInputToIso } from '../../../cpa/siteTime';
import { versionLabel } from './levelWords';
import { deploymentStateWord, stampZoned } from './configWords';
import { WordPill } from './configBits';
import { deploymentTitle, errorText, settingChanges, type LifecycleAction } from './lifecycle';
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
  /** The deployment a rollback undoes: this version's current one, when the server offers a rollback of it (CHG-220). */
  verifiedActivation: Deployment | undefined;
  onDeploy: (args: { scheduledFor?: string | null }) => void;
  onRollback: (deploymentId: string) => void;
  /** The version a rollback brings back, when already read: the dialog says what changes. */
  previous?: Bundle | null;
}

const WAITING = new Set(['SCHEDULED', 'PREPARING', 'PREPARED', 'APPLYING', 'PROBING']);
/** "takes effect at 24 Nov 06:00 GST" while a deployment waits for a later effective time, else null. */
export const takesEffect = (d: Pick<Deployment, 'state' | 'scheduledFor'>, now = Date.now()): string | null =>
  d.scheduledFor && WAITING.has(d.state) && Date.parse(d.scheduledFor) > now ? `takes effect at ${stampZoned(d.scheduledFor)}` : null;
/** The date and time forms the server reads (ISO 8601: a date, optionally a time, optionally a zone). */
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
/** The instant a datetime-local value means in the plant zone (null = now, or not a time). */
export const scheduleInstant = (value: string, zone: string = siteZone()): string | null => (value.trim() ? zoneInputToIso(value.trim(), zone) : null);
/** Why an Effective from cannot be sent, or null (empty = now). It is sent as typed. */
export const scheduleProblem = (text: string): string | null => {
  const t = text.trim();
  return t === '' || (ISO.test(t) && !Number.isNaN(Date.parse(t))) ? null : 'Not a date and time, e.g. 2026-11-24T06:00';
};

export const DeploymentsTab: React.FC<DeploymentsTabProps> = ({ bundle, deployments, deploymentsLoading, deploymentsError, retryDeployments, activate, rollback, reasons, busy, errors, verifiedActivation, onDeploy, onRollback, previous }) => {
  const [schedule, setSchedule] = useState('');
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const selected = deployments.find(d => d.deploymentId === chosen) ?? deployments[0];
  const select = (id: string) => { setChosen(id); setDrawer(true); };
  const deployFailed = errorText(errors.deploy);
  const rollbackFailed = errorText(errors.rollback);
  const badSchedule = scheduleProblem(schedule);
  const target = verifiedActivation?.rollbackTarget ?? null;
  const rollbackLabel = target ? `Roll back to ${versionLabel({ scopeKind: bundle.scopeKind, version: target.version })}` : rollback.label;
  const goesBack = previous && target ? settingChanges(bundle.resolved?.properties, previous.resolved?.properties) : [];

  return (
    <>
      <section className="cpm-surface cpm-config-head" aria-label="Deploy and roll back">
        <label className="cpm-field cpm-field--compact"><span className="cpm-field__label">Takes effect at · {zoneTag()}</span>
          <input className="cpm-input" type="datetime-local" value={schedule} onChange={e => setSchedule(e.target.value)} disabled={!activate.enabled}
            aria-invalid={badSchedule != null} aria-describedby={badSchedule ? 'cpm-config-schedule-error' : undefined} />
          {badSchedule && <span id="cpm-config-schedule-error" className="cpm-field__error">{badSchedule}</span>}</label>
        <ReasonedButton variant={activate.enabled ? 'raised' : 'normal'} disabled={!activate.enabled || busy.deploy || badSchedule != null} reason={reasons.activate}
          onClick={() => onDeploy({ scheduledFor: scheduleInstant(schedule) })}>
          {busy.deploy ? 'Scheduling…' : 'Deploy'}
        </ReasonedButton>
        <ReasonedButton variant={rollback.enabled ? 'raised' : 'normal'} disabled={!rollback.enabled || busy.rollback || !verifiedActivation} reason={reasons.rollback}
          onClick={() => setAsking(true)}>
          {busy.rollback ? 'Rolling back…' : rollbackLabel}
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
                      <button type="button" className="cpm-config-rowbtn" onClick={e => { e.stopPropagation(); select(d.deploymentId); }}>{d.kind === 'ROLLBACK' ? 'Rollback' : 'Deploy'}</button>
                      <div className="cpm-event-row__sub">{stamp(d.createdAt)}{takesEffect(d) ? ` · ${takesEffect(d)}` : ''}</div>
                    </td>
                    <td><WordPill word={{ ...deploymentStateWord(d), label: deploymentTitle(d) }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        {selected && (
          <Inspector title={deploymentTitle(selected)} open={drawer} onClose={() => setDrawer(false)}>
            <DeploymentDetail deployment={selected} />
          </Inspector>
        )}
      </div>
      {verifiedActivation && (
        <RollbackDialog open={asking} bundle={bundle} activation={verifiedActivation} changes={goesBack} onCancel={() => setAsking(false)}
          onConfirm={() => { setAsking(false); onRollback(verifiedActivation.deploymentId); }} />
      )}
    </>
  );
};

export default DeploymentsTab;
