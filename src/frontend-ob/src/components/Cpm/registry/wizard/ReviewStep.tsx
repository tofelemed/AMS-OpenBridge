/**
 * CHG-098 (SME review 2 #28): the wizard's review step. It lists the actual signal path per role (not just the role names);
 * for an edit it leads with the changed settings only, before -> after, each with its expected effect.
 * CHG-168 (owner review): Changes (an edit only; "Nothing has changed. Saving re-submits the loop as it is." stays) and All
 * settings open in two columns (the disclosure, the eyebrow, the tag and the READY TO SAVE pill went); a path reads under the
 * plant path ("…/fic10401.pv"), whole on hover; the pipeline windows are behind the All settings ?.
 */
import React from 'react';
import { SIGNAL_ROLES } from '../../plantLocation';
import { applicabilitySummary } from '../../optionalInputs';
import { shortPath } from '../loopPanelFacts';
import { diffSettings, locationText, modelSummary, rangeText } from './changeSummary';
import { PipelineHelp } from './PipelineHelp';
import type { WizardState } from './wizardForm';
import { Part } from './editorParts';
import './wizard.css';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="cpm-review-row">
    <span className="cpm-review-row__label">{label}</span>
    <span className="cpm-review-row__value">{children}</span>
  </div>
);

const AllSettings: React.FC<{ form: WizardState; isNew: boolean }> = ({ form, isNew }) => {
  const loc = { site: form.site, area: form.area, unit: form.unit };
  return (
    <div className="cpm-review-list cpm-review-list--two">
      {isNew && <Row label="Loop tag">{form.loopId || '—'}</Row>}
      <Row label="Service">{form.displayName}</Row>
      <Row label="Location">{locationText(form)}</Row>
      <Row label="Type · criticality">{form.loopType} · {form.criticality}</Row>
      <Row label="Loop model">{modelSummary(form.model, form.loopType)}</Row>
      <Row label="Gate profile">{form.thresholdProfileId.trim() || 'default'}</Row>
      {SIGNAL_ROLES.map(role => (
        <Row key={role} label={`${role.toUpperCase()} path`}>
          {form[role].trim()
            ? <span className="cpm-mono" title={form[role].trim()}>{shortPath(form[role].trim(), loc)}</span>
            : <span className="cpm-copy">not mapped</span>}
        </Row>
      ))}
      <Row label="PV range">{rangeText(form.pvMin, form.pvMax, form.pvUnit)}{!form.pvMin.trim() && !form.pvMax.trim() ? ' (PV band stays ±0.5 EU)' : ''}</Row>
      <Row label="OP range">{rangeText(form.opMin, form.opMax)}</Row>
      <Row label="Optional inputs">{applicabilitySummary(form.vpApplicability, form.peerApplicability)}</Row>
      <Row label="Monitoring">{form.enableMonitoring ? 'Enabled on save' : 'Registered only'}</Row>
    </div>
  );
};

export const ReviewStep: React.FC<{
  form: WizardState;
  /** The stored loop as the form first showed it; present only for an edit. */
  original?: WizardState;
  error?: string | null;
}> = ({ form, original, error }) => {
  const changes = original ? diffSettings(original, form) : [];
  return (
    <>
      {original && (
        <Part title="Changes">
          {changes.length === 0
            ? <p className="cpm-copy">Nothing has changed. Saving re-submits the loop as it is.</p>
            : (
              <div className="cpm-review-list" data-testid="cpm-review-changes">
                {changes.map(c => (
                  <div key={c.key} className="cpm-review-row">
                    <span className="cpm-review-row__label">{c.label}</span>
                    <span className="cpm-review-row__value">
                      <span className="cpm-review-change__from">{c.before}</span>
                      <span className="cpm-review-change__arrow" aria-label="changes to">→</span>
                      <strong>{c.after}</strong>
                    </span>
                    <span className="cpm-review-change__effect">{c.effect}</span>
                  </div>
                ))}
              </div>
            )}
        </Part>
      )}
      <Part title="All settings" help={<PipelineHelp />}>
        <AllSettings form={form} isNew={!original} />
      </Part>
      {error && <p className="cpm-field__error">{error}</p>}
    </>
  );
};

export default ReviewStep;
