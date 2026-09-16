/**
 * v2.5 Task 2E.5 (spec §2.9; NR-014): the loop frequency response L(jω) = C·G only when the kernel
 * produced one (validated model + known controller form + a crossing in band). Magnitude on a log
 * axis, phase in degrees on its own axis, crossings as the kernel listed them, margins from the
 * quantities with their null reasons. Captioned as a model-domain estimate.
 */
import React from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ResponseQuantity } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { GateResultStatePanel } from '../evidence/GateResultState';
import { metricOf, prov, provList, quantityText } from './responseSupport';

const MARGINS: Array<[string, string]> = [['gain_margin', 'Gain margin'], ['phase_margin', 'Phase margin'], ['gain_crossover_hz', 'Gain crossover'], ['phase_crossover_hz', 'Phase crossover'], ['peak_sensitivity', 'Peak |S|'], ['peak_complementary', 'Peak |T|'], ['bandwidth_hz', 'Bandwidth']];

export const BodePanel: React.FC<{ bode: DecodedArtifact | undefined; metrics: ResponseQuantity[] | undefined; controller: { state: string; outputs: Record<string, unknown> } | undefined }> = ({ bode, metrics, controller }) => {
  const gm = metricOf(metrics, 'gain_margin');
  if (!bode) {
    const reason = gm?.reasonIfNull || (controller?.outputs?.reason as string | undefined) || 'NO_FREQUENCY_RESULT';
    return (
      <GateResultStatePanel state={{
        kind: 'NOT_EVALUATED', title: 'Frequency response not available',
        detail: `${reason.replace(/_/g, ' ').toLowerCase()} — the kernel writes a Bode artifact only from a validated model with a known controller form and a crossing in band.`,
        stillValid: 'The event, its metrics and the candidate models above are unaffected; margins are simply not claimed.',
        action: 'NONE', tone: 'muted',
      }} />
    );
  }
  const omega = bode.columns.x;
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Subgate F" title="Frequency response" right={<TonePill tone="warn">model-domain estimate</TonePill>} />
      <div className="cpm-response-quantities">
        {MARGINS.map(([id, label]) => { const q = metricOf(metrics, id); return q ? <KvRow key={id} label={label}>{quantityText(q)}</KvRow> : null; })}
        <KvRow label="gain crossings (rad/s)">{provList(bode, 'gain_crossings').join(', ') || 'none'}</KvRow>
        <KvRow label="phase crossings (rad/s)">{provList(bode, 'phase_crossings').join(', ') || 'none'}</KvRow>
      </div>
      <CpmChart title="|L(jω)|" xKind="value" xLabel="ω" xUnit={bode.units.x ?? 'rad/s'} logY height={220}
        series={[{ id: 'mag', label: '|L| = |C·G|', unit: bode.units.y ?? 'dimensionless', x: omega, y: Array.from(bode.columns.y), pen: 'accent' }]} />
      {bode.columns.phase_deg && (
        <CpmChart title="∠L(jω)" xKind="value" xLabel="ω" xUnit={bode.units.x ?? 'rad/s'} height={200}
          series={[{ id: 'phase', label: 'phase', unit: bode.units.phase_deg ?? 'degree', x: omega, y: Array.from(bode.columns.phase_deg), pen: 'pink' }]} />
      )}
      <p className="cpm-copy">{(prov(bode, 'note') ?? 'MODEL_DOMAIN_ESTIMATE_NOT_A_SAFETY_GUARANTEE').replace(/_/g, ' ').toLowerCase()}: margins hold inside the model's validated domain and are not a safety guarantee.</p>
    </section>
  );
};
