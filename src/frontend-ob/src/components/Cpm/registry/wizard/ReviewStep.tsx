/**
 * CHG-098 (SME review 2 #28): the wizard's review step. It lists the actual signal path per role (not just the
 * role names); for an edit it leads with the changed settings only, before -> after, each with its expected effect,
 * and keeps the full settings list behind a disclosure. The fixed pipeline facts are under a help toggle.
 */
import React from 'react';
import { PanelHead, TonePill } from '../../shared';
import { SIGNAL_ROLES } from '../../plantLocation';
import { applicabilitySummary } from '../../optionalInputs';
import { diffSettings, locationText, modelSummary, rangeText } from './changeSummary';
import { PipelineHelp } from './PipelineHelp';
import type { WizardState } from './wizardForm';
import './wizard.css';

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="cpm-review-row">
    <span className="cpm-review-row__label">{label}</span>
    <span className="cpm-review-row__value">{children}</span>
  </div>
);

const AllSettings: React.FC<{ form: WizardState }> = ({ form }) => (
  <div className="cpm-review-list">
    <Row label="Service">{form.displayName}</Row>
    <Row label="Location">{locationText(form)}</Row>
    <Row label="Type / criticality">{form.loopType} · {form.criticality}</Row>
    <Row label="Loop model">{modelSummary(form.model, form.loopType)}</Row>
    <Row label="Gate profile">{form.thresholdProfileId.trim() || 'default'}</Row>
    {SIGNAL_ROLES.map(role => (
      <Row key={role} label={`${role.toUpperCase()} path`}>
        {form[role].trim()
          ? <span className="cpm-mono" title={form[role].trim()}>{form[role].trim()}</span>
          : <span className="cpm-copy">not mapped</span>}
      </Row>
    ))}
    <Row label="PV range">{rangeText(form.pvMin, form.pvMax, form.pvUnit)}{!form.pvMin.trim() && !form.pvMax.trim() ? ' (PV band stays ±0.5 EU)' : ''}</Row>
    <Row label="OP range">{rangeText(form.opMin, form.opMax)}</Row>
    <Row label="Optional inputs">{applicabilitySummary(form.vpApplicability, form.peerApplicability)}</Row>
    <Row label="Monitoring">{form.enableMonitoring ? 'Enabled on save' : 'Registered only'}</Row>
  </div>
);

export const ReviewStep: React.FC<{
  form: WizardState;
  /** The stored loop as the form first showed it; present only for an edit. */
  original?: WizardState;
  error?: string | null;
}> = ({ form, original, error }) => {
  const changes = original ? diffSettings(original, form) : [];
  return (
    <>
      <PanelHead eyebrow={original ? 'Edit control loop' : 'New control loop'} title={form.loopId || '—'}
        right={<TonePill tone="warn">{original && changes.length === 0 ? 'NO CHANGES' : 'READY TO SAVE'}</TonePill>} />
      {original ? (
        <>
          <div className="cpm-field__label cpm-review-section">Changes ({changes.length})</div>
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
          <details className="cpm-chart__more cpm-review-section">
            <summary>All settings after saving</summary>
            <AllSettings form={form} />
          </details>
        </>
      ) : <AllSettings form={form} />}
      {error && <p className="cpm-field__error" style={{ marginTop: 8 }}>{error}</p>}
      <PipelineHelp />
    </>
  );
};

export default ReviewStep;
