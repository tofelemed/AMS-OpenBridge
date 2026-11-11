/**
 * v2.5 Task 2E.5 (spec §2.9; NR-014): the loop frequency response L(jω) = C·G only when the kernel
 * produced one (validated model + known controller form + a crossing in band). Magnitude on a log
 * axis, phase in degrees on its own axis, crossings as the kernel listed them, margins from the
 * quantities with their null reasons. Captioned as a model-domain estimate.
 * CHG-165 (owner review): the Frequency tab. Magnitude and phase side by side; the margins are listed either way (a margin
 * not claimed says why, never 0); without a Bode, one line says why instead of a full panel. When the margins stand but the
 * Bode is missing, the arrays were not kept, and the tab's own note says so.
 */
import React from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ResponseQuantity } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { metricOf, prov, provList, quantityText } from './responseSupport';
import { phrase } from '../vocabulary';

// audit F19: catalogue ids - the *_hz / peak_complementary ids never existed, so those rows never rendered
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const MARGINS: Array<[string, string]> = [['gain_margin', 'Gain margin'], ['phase_margin', 'Phase margin'], ['gain_crossover', 'Gain crossover'], ['phase_crossover', 'Phase crossover'], ['peak_sensitivity', 'Peak |S|'], ['peak_complementary_sensitivity', 'Peak |T|'], ['closed_loop_bandwidth', 'Closed-loop bandwidth']];

export const BodePanel: React.FC<{ bode: DecodedArtifact | undefined; metrics: ResponseQuantity[] | undefined; controller: { state: string; outputs: Record<string, unknown> } | undefined; loading?: boolean }> = ({ bode, metrics, controller, loading }) => {
  const gm = metricOf(metrics, 'gain_margin');
  if (!bode && loading) return <ArtifactSkeleton kinds={['bode']} size="result" />;
  const notClaimed = !bode && gm?.value == null;
  const reason = gm?.reasonIfNull || (controller?.outputs?.reason as string | undefined) || 'NO_FREQUENCY_RESULT';
  const omega = bode?.columns.x;
  const margins = MARGINS.map(([id, label]) => [label, metricOf(metrics, id)] as const).filter(([, q]) => q);
  return (
    <>
      {notClaimed && (
        <div className="cpm-gate-state cpm-gate-state--note cpm-response-note" role="note">
          <h3>Frequency response not drawn</h3>
          <span className="cpm-gate-state__valid">{sentence(phrase(reason))}. It needs a validated model with a known controller form and a crossing in band; margins are not claimed.</span>
        </div>
      )}
      {bode && omega && (
        <section className="cpm-surface cpm-response-sub">
          <PanelHead eyebrow="Subgate F" title="Frequency response" right={<TonePill tone="warn">model-domain estimate</TonePill>} />
          <div className="cpm-response-pair">
            <CpmChart title="|L(jω)|" xKind="value" xLabel="ω" xUnit={bode.units.x ?? 'rad/s'} logY height={240}
              series={[{ id: 'mag', label: '|L| = |C·G|', unit: bode.units.y ?? 'dimensionless', x: omega, y: Array.from(bode.columns.y), pen: 'overlay' }]} />
            {bode.columns.phase_deg && (
              <CpmChart title="∠L(jω)" xKind="value" xLabel="ω" xUnit={bode.units.x ?? 'rad/s'} height={240}
                series={[{ id: 'phase', label: 'phase', unit: bode.units.phase_deg ?? 'degree', x: omega, y: Array.from(bode.columns.phase_deg), pen: 'vp' }]} />
            )}
          </div>
          <p className="cpm-copy">{phrase(prov(bode, 'note') ?? 'MODEL_DOMAIN_ESTIMATE_NOT_A_SAFETY_GUARANTEE')}: margins hold inside the model's validated domain and are not a safety guarantee.</p>
        </section>
      )}
      {(margins.length > 0 || bode) && (
        <section className="cpm-surface cpm-response-sub" aria-label="Margins">
          <PanelHead title="Margins" />
          <div className="cpm-response-quantities cpm-response-quantities--three">
            {/* the reason is in the note once; each margin it covers just says so */}
            {margins.map(([label, q]) => <KvRow key={label} label={label}>{notClaimed && q?.value == null ? 'not claimed' : quantityText(q)}</KvRow>)}
            {bode && <KvRow label="Gain crossings (rad/s)">{provList(bode, 'gain_crossings').join(', ') || 'none'}</KvRow>}
            {bode && <KvRow label="Phase crossings (rad/s)">{provList(bode, 'phase_crossings').join(', ') || 'none'}</KvRow>}
          </div>
        </section>
      )}
    </>
  );
};
