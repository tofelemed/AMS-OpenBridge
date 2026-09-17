/**
 * v2.5 Task 2E.5 (spec §2.10; NR-034, NR-035): the response chart. Output pane: accepted PV with
 * rejected samples as gaps, baseline and target as the kernel's constants, the fit, the holdout
 * prediction, the prediction band NAMED with its meaning, and the response-time markers on their
 * own progress axis. Input pane: the reconstructed applied input as a held step on its own unit.
 * Health exclusions are stated. (2026-09-17 audit F19: the key quantities moved to the result card and
 * the aside's key results; this panel is the picture.)
 */
import React from 'react';
import { PanelHead, TonePill } from '../shared';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart, type CpmSeries } from '../evidence/CpmChart';
import type { GateArtifacts } from '../evidence/useGateArtifacts';
import { RequireKinds } from '../evidence/views/viewSupport';
import { afterT0Ms, bandMeaningText, epochMs, prov } from './responseSupport';

function timeSeries(d: DecodedArtifact, id: string, label: string, pen: CpmSeries['pen'], opts: Partial<CpmSeries> & { masked?: boolean; column?: string } = {}): CpmSeries {
  const raw = d.columns[opts.column ?? 'y'];
  const y: Array<number | null> = Array.from(raw, (v, i) => (opts.masked && d.mask && !d.mask[i]) || !Number.isFinite(v) ? null : v);
  const unit = opts.column ? d.units[opts.column] ?? d.meta.y.unit ?? '' : d.units.y ?? d.meta.y.unit ?? '';
  return { id, label, unit, x: epochMs(d), y, pen, ...opts };
}

export const ResponseChartBody: React.FC<{
  byKind: Record<string, DecodedArtifact[]>; timeZone: string; t0Ms: number; healthExclusions: string[];
}> = ({ byKind, timeZone, t0Ms, healthExclusions }) => {
  const one = (k: string) => byKind[k]?.[0];
  const samples = one('accepted_samples');
  const output: CpmSeries[] = [];
  if (samples) output.push(timeSeries(samples, 'pv', 'PV (accepted)', 'good', { masked: true }));
  const baseline = one('baseline');
  if (baseline) output.push(timeSeries(baseline, 'baseline', 'baseline y0 (pre-event median)', 'grey', { dashed: true }));
  const target = one('target');
  if (target) output.push(timeSeries(target, 'target', 'reference r1 (target)', 'amber', { dashed: true }));
  const fit = one('y_fit');
  if (fit) output.push(timeSeries(fit, 'y_fit', 'model fit (training)', 'accent', { masked: true }));
  const predict = one('y_predict');
  if (predict) output.push(timeSeries(predict, 'y_predict', 'holdout prediction (free run)', 'pink', { masked: true }));
  const band = one('prediction_interval');
  if (band) {
    const meaning = bandMeaningText(prov(band, 'band_meaning'));
    output.push(timeSeries(band, 'pi_upper', 'upper', 'pink', { bandMeaning: meaning }));
    if (band.columns.lower) output.push(timeSeries(band, 'pi_lower', 'lower', 'pink', { bandMeaning: meaning, column: 'lower' }));
  }
  const rt = one('response_times');
  if (rt) output.push({ id: 'response_times', label: 'response time (progress level)', unit: rt.units.y ?? '%', x: afterT0Ms(rt, t0Ms), y: Array.from(rt.columns.y), pen: 'amber', markers: true });
  const input = one('input_reconstruction');
  const inputSeries: CpmSeries[] = input ? [timeSeries(input, 'u_applied', 'applied input (reconstructed, held)', 'accent', { held: true, masked: true })] : [];

  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G12" title="Response" right={<TonePill tone="muted">{samples?.meta.roleOrPath ?? '—'}</TonePill>} />
      {output.length > 0 && <CpmChart title="Output" series={output} xKind="time" timeZone={timeZone} height={320} />}
      {inputSeries.length > 0 && <CpmChart title="Input" series={inputSeries} xKind="time" timeZone={timeZone} height={180} />}
      {healthExclusions.length > 0 && (
        <p className="cpm-copy" data-list="health-exclusions">Health exclusions: {healthExclusions.join(' · ')}</p>
      )}
      <p className="cpm-copy">Rejected samples are gaps, never bridged. The band is a prediction interval of the output; parameter confidence is a separate table.</p>
    </section>
  );
};

export const ResponseChart: React.FC<{ arts: GateArtifacts; timeZone: string; t0Ms: number; healthExclusions: string[] }> = ({ arts, timeZone, t0Ms, healthExclusions }) => (
  <RequireKinds arts={arts} kinds={['accepted_samples']} skeleton="evidence">
    <ResponseChartBody byKind={arts.byKind} timeZone={timeZone} t0Ms={t0Ms} healthExclusions={healthExclusions} />
  </RequireKinds>
);
