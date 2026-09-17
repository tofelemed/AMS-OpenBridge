/**
 * v2.5 Task 2E.5 (spec §2.7): residuals over time (PV EU) and their autocorrelation by lag in
 * samples - the kernel's arrays. Whiteness / bias verdicts come from subgate E, stated as text.
 */
import React from 'react';
import { KvRow, PanelHead } from '../shared';
import type { ResponseSubgate } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { EmptyState } from '../shared';
import { epochMs } from './responseSupport';

export const ResidualPanel: React.FC<{ residuals: DecodedArtifact | undefined; acf: DecodedArtifact | undefined; timeZone: string; validation: ResponseSubgate | undefined; loading?: boolean }> = ({ residuals, acf, timeZone, validation, loading }) => {
  if (!residuals && !acf && loading) return <ArtifactSkeleton kinds={['residuals', 'residual_acf']} />;
  if (!residuals && !acf) {
    return <EmptyState title="No residuals for this event" copy="The kernel produced no fit here (no estimation, or the event was rejected / censored before estimation), so there is nothing to draw." />;
  }
  const outputs = validation?.outputs ?? {};
  const text = (k: string) => { const v = outputs[k]; return v == null ? '—' : typeof v === 'number' ? v.toFixed(3) : String(v); };
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Subgate E" title="Residuals and validation" />
      {validation && (
        <div className="cpm-response-quantities">
          <KvRow label="state">{validation.state}</KvRow>
          {['verdict', 'free_run_rmse', 'prediction_rmse', 'fit_improvement', 'residual_bias', 'whiteness', 'input_residual_correlation'].filter(k => k in outputs).map(k => <KvRow key={k} label={k}>{text(k)}</KvRow>)}
        </div>
      )}
      {residuals && (
        <CpmChart title="Residuals" xKind="time" timeZone={timeZone} height={200}
          series={[{ id: 'residual', label: 'residual (y − ŷ)', unit: residuals.units.y ?? residuals.meta.y.unit ?? '', x: epochMs(residuals), y: Array.from(residuals.columns.y), pen: 'accent' }]} />
      )}
      {acf && (
        <CpmChart title="Residual autocorrelation" xKind="value" xLabel="lag" xUnit={acf.units.x ?? acf.meta.x.unit ?? 'samples'} height={200}
          series={[{ id: 'acf', label: 'residual ACF', unit: acf.units.y ?? 'dimensionless', x: acf.columns.x, y: Array.from(acf.columns.y), pen: 'grey', markers: true }]} />
      )}
      <p className="cpm-copy">Free-run and one-step prediction errors are reported separately: a flexible predictor with the wrong plant can pass one-step and fail free-run.</p>
    </section>
  );
};
