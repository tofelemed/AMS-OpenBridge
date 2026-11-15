/**
 * v2.5 Task 2E.5 (spec §2.9; NR-014): the loop frequency response L(jω) = C·G only when the kernel
 * produced one (validated model + known controller form + a crossing in band). Magnitude on a log
 * axis, phase in degrees on its own axis, crossings as the kernel listed them, margins from the
 * quantities with their null reasons. Captioned as a model-domain estimate.
 * CHG-165 (owner review): the Frequency tab. Magnitude and phase (CHG-195: one per row); the margins are listed either way (a margin
 * not claimed says why, never 0); without a Bode, one line says why instead of a full panel. When the margins stand but the
 * Bode is missing, the arrays were not kept, and the tab's own note says so. CHG-195 (owner review item 19): the margins in the
 * standard table (Margin · Value).
 * CHG-200 (final test #6; C5, C6): in words: "Loop gain" and "Loop phase" (titles and legends; the CSV keeps its columns), no step
 * code, no "dimensionless", the safety sentence said once; the frequency on a log axis; Export CSV in each chart's head.
 */
import React from 'react';
import { PanelHead, TonePill } from '../shared';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { ResponseQuantity } from '../../../api/cpm/response';
import type { DecodedArtifact } from '../evidence/artifactCodec';
import { CpmChart } from '../evidence/CpmChart';
import { ArtifactSkeleton } from '../evidence/views/viewSupport';
import { metricOf, provList, quantityText, typographicUnit } from './responseSupport';
import { phrase } from '../vocabulary';

// audit F19: catalogue ids - the *_hz / peak_complementary ids never existed, so those rows never rendered
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const MARGINS: Array<[string, string]> = [['gain_margin', 'Gain margin'], ['phase_margin', 'Phase margin'], ['gain_crossover', 'Gain crossover'], ['phase_crossover', 'Phase crossover'], ['peak_sensitivity', 'Peak |S|'], ['peak_complementary_sensitivity', 'Peak |T|'], ['closed_loop_bandwidth', 'Closed-loop bandwidth']];

/** CHG-195 (owner review item 19): the margins in the standard table, Margin · Value. */
interface MarginRow { label: string; value: string }
const MARGIN_COLUMNS: Array<Column<MarginRow>> = [
  { key: 'margin', header: 'Margin', cell: r => r.label },
  { key: 'value', header: 'Value', cell: r => r.value },
];

export const BodePanel: React.FC<{ bode: DecodedArtifact | undefined; metrics: ResponseQuantity[] | undefined; controller: { state: string; outputs: Record<string, unknown> } | undefined; loading?: boolean }> = ({ bode, metrics, controller, loading }) => {
  const gm = metricOf(metrics, 'gain_margin');
  if (!bode && loading) return <ArtifactSkeleton kinds={['bode']} size="result" />;
  const notClaimed = !bode && gm?.value == null;
  const reason = gm?.reasonIfNull || (controller?.outputs?.reason as string | undefined) || 'NO_FREQUENCY_RESULT';
  const omega = bode?.columns.x;
  const margins = MARGINS.map(([id, label]) => [label, metricOf(metrics, id)] as const).filter(([, q]) => q);
  // the reason is in the note once; each margin it covers just says so
  const rows: MarginRow[] = [
    ...margins.map(([label, q]) => ({ label, value: notClaimed && q?.value == null ? 'not claimed' : quantityText(q) })),
    ...(bode ? [
      { label: 'Gain crossings (rad/s)', value: provList(bode, 'gain_crossings').join(', ') || 'none' },
      { label: 'Phase crossings (rad/s)', value: provList(bode, 'phase_crossings').join(', ') || 'none' },
    ] : []),
  ];
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
          <PanelHead title="Frequency response" right={<TonePill tone="warn">Model estimate</TonePill>} />
          <div className="cpm-response-trend-rows">
            <CpmChart title="Loop gain" xKind="value" xLabel="Frequency" csvXLabel="ω" xUnit={bode.units.x ?? 'rad/s'} logX logY height={240} exportInHead
              series={[{ id: 'mag', label: 'Loop gain', csvLabel: '|L| = |C·G|', unit: typographicUnit(bode.units.y), x: omega, y: Array.from(bode.columns.y), pen: 'overlay' }]} />
            {bode.columns.phase_deg && (
              <CpmChart title="Loop phase" xKind="value" xLabel="Frequency" csvXLabel="ω" xUnit={bode.units.x ?? 'rad/s'} logX height={240} exportInHead
                series={[{ id: 'phase', label: 'Loop phase', csvLabel: 'phase', unit: bode.units.phase_deg ?? 'degree', x: omega, y: Array.from(bode.columns.phase_deg), pen: 'vp' }]} />
            )}
          </div>
          <p className="cpm-copy">The margins hold inside the model's validated domain; they are not a safety guarantee.</p>
        </section>
      )}
      {rows.length > 0 && (
        <section className="cpm-surface cpm-response-sub" aria-label="Margins">
          <PanelHead title="Margins" />
          <DataTable caption="Stability margins of this event" columns={MARGIN_COLUMNS} rows={rows} rowKey={r => r.label} />
        </section>
      )}
    </>
  );
};
