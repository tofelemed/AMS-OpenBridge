/**
 * CHG-168 (owner review): the editor's Classification tab. Ranking: criticality, gate profile and (owner answer 3a) the
 * Monitored switch: the request always carried enableMonitoring, but the editor only sent back what was stored, so a loop's
 * monitoring could be turned on only by a bulk import of the same tag; the readiness advice "Re-activate with
 * enableMonitoring=true" is now done here. Then the loop model and the acquisition (ClassificationStep). The ranges moved to
 * the Signals tab, beside the paths they scale.
 */
import React, { useId } from 'react';
import type { CpmRegistryContract } from '../../../../api/cpmApi';
import type { WizardState } from './wizardForm';
import { ClassificationStep } from './ClassificationStep';
import { Field, Grid, Part } from './editorParts';

export const ClassificationTab: React.FC<{
  form: WizardState;
  contract: CpmRegistryContract['model'] | undefined;
  set: (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onForm: (change: (f: WizardState) => WizardState) => void;
}> = ({ form, contract, set, onForm }) => {
  const id = useId();
  return (
    <>
      <Part title="Ranking">
        <Grid>
          <Field id={`${id}-crit`} label="Criticality">
            <select id={`${id}-crit`} className="cpm-select" value={form.criticality} onChange={set('criticality')}>
              {['low', 'medium', 'high', 'critical'].map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field id={`${id}-prof`} label="Gate profile">
            <input id={`${id}-prof`} className="cpm-input" value={form.thresholdProfileId} onChange={set('thresholdProfileId')} placeholder="default" />
          </Field>
          <div className="cpm-field cpm-reg-field">
            <span className="ui-field__label">Monitoring</span>
            <label className="cpm-check cpm-reg-check">
              <input type="checkbox" checked={form.enableMonitoring} onChange={e => onForm(f => ({ ...f, enableMonitoring: e.target.checked }))} />
              <span>Monitored</span>
            </label>
          </div>
        </Grid>
      </Part>
      <ClassificationStep loopType={form.loopType} contract={contract} form={form.model} onChange={m => onForm(f => ({ ...f, model: m }))} />
    </>
  );
};

export default ClassificationTab;
