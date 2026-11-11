/**
 * CHG-168 (owner review): the editor's Identity tab, in two titled parts. Loop: the tag (the first field; fixed in an edit, and
 * it says why), service and loop type, with every tag rule as before (duplicate, forbidden characters, historian collision).
 * Plant location: site, area and unit from the asset model (PlantLocationPicker, with Enter manually and its help behind ?).
 */
import React, { useId } from 'react';
import { PlantLocationPicker, historianNode, type PlantLocation } from '../../plantLocation';
import type { WizardState } from './wizardForm';
import { Field, Grid, Part } from './editorParts';

export interface TagIssues { duplicate: boolean; loopIdIssue: string | null; nodeClash: string | null }

export const IdentityTab: React.FC<{
  form: WizardState;
  isEdit: boolean;
  issues: TagIssues;
  loopTypes: string[];
  set: (k: keyof WizardState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onLocation: (loc: PlantLocation) => void;
  onManualMode: (manual: boolean) => void;
}> = ({ form, isEdit, issues, loopTypes, set, onLocation, onManualMode }) => {
  const id = useId();
  const { duplicate, loopIdIssue, nodeClash } = issues;
  return (
    <>
      <Part title="Loop">
        <Grid>
          <Field id={`${id}-tag`} label="Loop tag *" note={<>
            {isEdit && <span className="cpm-event-row__sub">The identity; it cannot change</span>}
            {duplicate && <span className="cpm-field__error">This tag already exists</span>}
            {loopIdIssue && <span className="cpm-field__error">{loopIdIssue}</span>}
            {nodeClash && (
              <span className="cpm-field__error">
                Collides with “{nodeClash}” in the historian — both become device{' '}
                <span className="cpm-mono">{historianNode(form.loopId)}</span>, so their trends
                would merge. Use an id that differs by more than punctuation.
              </span>
            )}
          </>}>
            <input id={`${id}-tag`} className={`cpm-input${duplicate || loopIdIssue || nodeClash ? ' cpm-input--error' : ''}`}
              value={form.loopId} onChange={set('loopId')} placeholder="45FIC-109" disabled={isEdit} />
          </Field>
          <Field id={`${id}-svc`} label="Service / description *">
            <input id={`${id}-svc`} className="cpm-input" value={form.displayName} onChange={set('displayName')} placeholder="Natural gas feed flow" />
          </Field>
          <Field id={`${id}-type`} label="Loop type *">
            <select id={`${id}-type`} className="cpm-select" value={form.loopType} onChange={set('loopType')}>
              {loopTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </Grid>
      </Part>
      <PlantLocationPicker value={{ site: form.site, area: form.area, unit: form.unit }} onChange={onLocation} onManualModeChange={onManualMode} />
    </>
  );
};

export default IdentityTab;
