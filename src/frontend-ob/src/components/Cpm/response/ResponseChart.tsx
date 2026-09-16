/**
 * v2.5 Task 2E.5 (spec §2.10; NR-034, NR-035): the response chart. Output pane: accepted PV with
 * rejected samples as gaps, baseline and target as the kernel's constants, the fit, the holdout
 * prediction, the prediction band NAMED with its meaning, and the response-time markers on their
 * own progress axis. Input pane: the reconstructed applied input as a held step on its own unit.
 * Health exclusions are stated. Key quantities are text with unit and uncertainty, null with reason.
 */
import React from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ResponseQuantity } from '../../../api/cpm/response';
import type { EvidenceManifest } from '../../../api/cpm/evidence';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart, type CpmSeries } from '../evidence/CpmChart';
import { useGateArtifacts } from '../evidence/useGateArtifacts';
import { RequireKinds } from '../evidence/views/viewSupport';
import { afterT0Ms, bandMeaningText, epochMs, metricOf, prov, quantityText } from './responseSupport';

const KEY_QUANTITIES: Array<[string, string]> = [
  ['process_gain', 'Process gain'], ['integrating_gain', 'Integrating gain'], ['dead_time', 'Dead time'], ['time_constant', 'Time constant'],
  ['time_constant_2', 'Second time constant'], ['damping_ratio', 'Damping ratio'], ['t10', 't10'], ['t50', 't50'], ['t63', 't63'], ['t90', 't90'],
  ['settle_response', 'Settling (response band)'], ['settle_target', 'Settling (target band)'], ['overshoot_response', 'Overshoot (response)'], ['steady_error', 'Steady-state error'],
];

function timeSeries(d: DecodedArtifact, id: string, label: string, pen: CpmSeries['pen'], opts: Partial<CpmSeries> & { masked?: boolean; column?: string } = {}): CpmSeries {
  const raw = d.columns[opts.column ?? 'y'];
  const y: Array<number | null> = Array.from(raw, (v, i) => (opts.masked && d.mask && !d.mask[i]) || !Number.isFinite(v) ? null : v);
  const unit = opts.column ? d.units[opts.column] ?? d.meta.y.unit ?? '' : d.units.y ?? d.meta.y.unit ?? '';
  return { id, label, unit, x: epochMs(d), y, pen, ...opts };
}

export const ResponseChartBody: React.FC<{
  byKind: Record<string, DecodedArtifact[]>; timeZone: string; t0Ms: number; metrics: ResponseQuantity[] | undefined; healthExclusions: string[];
}> = ({ byKind, timeZone, t0Ms, metrics, healthExclusions }) => {
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
      <div className="cpm-response-quantities" data-table="quantities">
        {KEY_QUANTITIES.map(([id, label]) => {
          const q = metricOf(metrics, id);
          if (!q) return null;
          return <KvRow key={id} label={label}>{quantityText(q)}{q.method ? <span className="cpm-muted"> · {q.method}</span> : null}</KvRow>;
        })}
      </div>
      {output.length > 0 && <CpmChart title="Output" series={output} xKind="time" timeZone={timeZone} height={320} />}
      {inputSeries.length > 0 && <CpmChart title="Input" series={inputSeries} xKind="time" timeZone={timeZone} height={180} />}
      {healthExclusions.length > 0 && (
        <p className="cpm-copy" data-list="health-exclusions">Health exclusions: {healthExclusions.join(' · ')}</p>
      )}
      <p className="cpm-copy">Rejected samples are gaps, never bridged. The band is a prediction interval of the output; parameter confidence is a separate table.</p>
    </section>
  );
};

export const ResponseChart: React.FC<{ manifest: EvidenceManifest; timeZone: string; t0Ms: number; metrics: ResponseQuantity[] | undefined; healthExclusions: string[] }> = ({ manifest, timeZone, t0Ms, metrics, healthExclusions }) => {
  const arts = useGateArtifacts(manifest, 'G12');
  return (
    <RequireKinds arts={arts} kinds={['accepted_samples']}>
      <ResponseChartBody byKind={arts.byKind} timeZone={timeZone} t0Ms={t0Ms} metrics={metrics} healthExclusions={healthExclusions} />
    </RequireKinds>
  );
};
