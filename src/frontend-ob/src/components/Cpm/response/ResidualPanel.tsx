/**
 * v2.5 Task 2E.5 (spec §2.7): residuals over time (PV EU) and their autocorrelation by lag in
 * samples - the kernel's arrays. Whiteness / bias verdicts come from subgate E, stated as text.
 * CHG-165 (owner review): the Fit quality tab. CHG-195 (owner rule 15 Nov 2026): the residuals, then their autocorrelation,
 * one per row at full width. CHG-197 (owner rule: no technical text): rows, values and curves in words, the residuals in the loop's
 * PV unit; the CSV keeps its column names.
 * CHG-200 (C5, C6, C9): no step code; the validation rows one per line as every other label / value list; no "dimensionless" axis
 * name; Export CSV in each chart's head, as on the Response trends and Models.
 */
import React from 'react';
import { Toggletip } from '../../../ui/Toggletip';
import { KvRow, PanelHead } from '../shared';
import type { ResponseSubgate } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { EmptyState } from '../shared';
import { displayUnit, epochMs, typographicUnit } from './responseSupport';
import { outputValue, validationLabel } from './responseLabels';
import { codeLabel } from '../vocabulary';

export const ResidualPanel: React.FC<{ residuals: DecodedArtifact | undefined; acf: DecodedArtifact | undefined; timeZone: string; validation: ResponseSubgate | undefined; loading?: boolean;
  pvUnit?: string | null;
  /** CHG-105: the event's charts are not stored (the Response panel above says why); never claim "no model was fitted". */
  notStored?: boolean }> = ({ residuals, acf, timeZone, validation, loading, notStored, pvUnit }) => {
  if (!residuals && !acf && loading) return <ArtifactSkeleton kinds={['residuals', 'residual_acf']} />;
  if (!residuals && !acf && notStored) return <EmptyState title="Residuals not stored" />;
  if (!residuals && !acf) {
    return <EmptyState title="No residuals for this event" copy="No model was fitted to this event (it was rejected or censored before a fit, or estimation did not run), so there is nothing to draw. Steps & data says where it stopped." />;
  }
  const outputs = validation?.outputs ?? {};
  const text = (k: string) => outputValue(k, outputs[k]);
  return (
    <section className="cpm-surface">
      <PanelHead title="Residuals and validation"
        help={<Toggletip variant="how-to" label="How to read these errors"><p>Free-run and one-step prediction errors are reported separately: a flexible predictor with the wrong plant can pass one-step and fail free-run.</p></Toggletip>} />
      {validation && (
        <div className="cpm-response-quantities cpm-response-quantities--rows">
          <KvRow label="State">{codeLabel(validation.state)}</KvRow>
          {['verdict', 'free_run_rmse', 'prediction_rmse', 'fit_improvement', 'residual_bias', 'whiteness', 'input_residual_correlation'].filter(k => k in outputs).map(k => <KvRow key={k} label={validationLabel(k)}>{text(k)}</KvRow>)}
        </div>
      )}
      <div className="cpm-response-trend-rows">
      {residuals && (
        <CpmChart title="Residuals" xKind="time" timeZone={timeZone} height={200} exportInHead
          series={[{ id: 'residual', label: 'Residual (PV − model)', csvLabel: 'residual (y − ŷ)', unit: displayUnit(residuals.units.y ?? residuals.meta.y.unit ?? '', residuals.meta.roleOrPath, pvUnit), x: epochMs(residuals), y: Array.from(residuals.columns.y), pen: 'overlay' }]} />
      )}
      {acf && (
        <CpmChart title="Residual autocorrelation" xKind="value" xLabel="Lag" csvXLabel="lag" xUnit={acf.units.x ?? acf.meta.x.unit ?? 'samples'} height={200} exportInHead
          series={[{ id: 'acf', label: 'Autocorrelation', csvLabel: 'residual ACF', unit: typographicUnit(acf.units.y), x: acf.columns.x, y: Array.from(acf.columns.y), pen: 'neutral', markers: true }]} />
      )}
      </div>
    </section>
  );
};
