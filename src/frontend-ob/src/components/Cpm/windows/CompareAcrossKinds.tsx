'use client';

/**
 * U7c — same loop, same metric, every short window size side by side. The only
 * multi-window view in the product was single-size; there was no way to see
 * how a calculation reads at 1m vs 5m vs 60m (audit.md §6 rec. 8). Values are
 * per-window statistics over the latest emitted windows of each kind — never
 * summed across kinds: all short kinds except 1m are SLIDING windows whose
 * samples overlap, so aggregation across kinds double-counts by construction.
 * CHG-190 (owner review item 13, Q7): it left the foot of the page for a wide dialog, opened by "Compare window sizes" in the
 * page's band. Its rows are read only while the dialog is open. A size is named once, as the profile list names it; "last 12"
 * is said once, on the Windows column. Picking a row opens that size on the page and closes the dialog.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow, CpmWindowSpec } from '../../../api/cpmApi';
import { useCpmKpisByResolution } from '../../../hooks/useCpm';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { TonePill } from '../shared';
import { profileLabel } from '../windowLabel';
import { fmtVal, isDeclined } from './WindowResults';

const METRIC_OPTIONS: { field: string; label: string; pct?: boolean }[] = [
  { field: 'mae', label: 'MAE' },
  { field: 'rmse', label: 'RMSE' },
  { field: 'iae', label: 'IAE' },
  { field: 'good_error_pct', label: 'Good-error time', pct: true },
  { field: 'effort_ratio', label: 'Effort ratio' },
  { field: 'auto_pct', label: 'In AUTO', pct: true },
  { field: 'completeness', label: 'Completeness', pct: true },
  { field: 'travel_per_day', label: 'OP travel / day' },
  { field: 'reversals_per_hour', label: 'Reversals / h' },
];

const KindRow: React.FC<{
  spec: CpmWindowSpec;
  rows: CpmKpiRow[];
  isLoading: boolean;
  field: string;
  pct: boolean;
  active: boolean;
  onPick: (kind: string) => void;
}> = ({ spec, rows, isLoading, field, pct, active, onPick }) => {
  const qualified = rows.filter(r => !isDeclined(r, 'short') && typeof r[field] === 'number');
  const declinedCount = rows.filter(r => isDeclined(r, 'short')).length;
  const values = qualified.map(r => r[field] as number);
  const latest = values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
  return (
    <tr aria-current={active ? 'true' : undefined}
      className={active ? 'cpm-event-row--selected' : undefined}
      style={{ cursor: 'pointer' }}
      onClick={() => onPick(spec.kind)}>
      <td>{profileLabel(spec)}</td>
      <td className="cpm-mono">
        {isLoading ? '…' : fmtVal(latest, pct)}
      </td>
      <td className="cpm-mono">{fmtVal(median, pct)}</td>
      <td className="cpm-mono">
        {sorted.length > 1 ? `${fmtVal(sorted[0], pct)} – ${fmtVal(sorted[sorted.length - 1], pct)}` : '—'}
      </td>
      <td>
        {values.length}
        {declinedCount > 0 && (
          <span title={`${declinedCount} of the latest windows were declined (insufficient data) and are excluded`}>
            {' '}<TonePill tone="muted">{declinedCount} declined</TonePill>
          </span>
        )}
      </td>
    </tr>
  );
};

/** The comparison table with its metric choice: the dialog's body. */
export const CompareAcrossKinds: React.FC<{
  loopId: string;
  shortSpecs: CpmWindowSpec[];
  activeKind: string;
  onPickKind: (kind: string) => void;
}> = ({ loopId, shortSpecs, activeKind, onPickKind }) => {
  const [field, setField] = useState('mae');
  const metric = METRIC_OPTIONS.find(m => m.field === field) ?? METRIC_OPTIONS[0];
  // CHG-024: one request for every short kind (was one per row, re-fired on every loop change).
  const kinds = useMemo(() => shortSpecs.map(s => s.kind), [shortSpecs]);
  const kpis = useCpmKpisByResolution(loopId, kinds, 12);
  return (
    <>
      <div className="cpm-compare-sizes__bar">
        <select className="cpm-select" aria-label="Metric" value={field} onChange={e => setField(e.target.value)}>
          {METRIC_OPTIONS.map(m => <option key={m.field} value={m.field}>{m.label}</option>)}
        </select>
        <Toggletip variant="how-to" label="Across window sizes">
          <p>Statistics are per window size over its latest 12 emitted windows; declined windows are excluded. Sizes other than 1m are sliding windows whose samples overlap: values are comparable side by side but must never be summed across rows. Click a row to inspect that size.</p>
        </Toggletip>
      </div>
      {/* CHG-193 (sweep D4): a table wider than the dialog scrolls with a visible edge shadow on the side that has more */}
      <div className="cpm-scroll-x">
        <table className="cpm-signal-table">
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">Latest {metric.label}</th>
              <th scope="col">Median</th>
              <th scope="col">Range</th>
              <th scope="col">Windows (last 12)</th>
            </tr>
          </thead>
          <tbody>
            {shortSpecs.map(spec => (
              <KindRow key={spec.kind} spec={spec}
                rows={kpis.data?.byResolution[spec.kind]?.samples ?? []} isLoading={kpis.isLoading}
                field={metric.field} pct={metric.pct ?? false}
                active={spec.kind === activeKind} onPick={onPickKind} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

/** "Compare window sizes" in the page's band, and the wide dialog it opens (Q7). */
export const CompareWindowSizes: React.FC<{
  loopId: string;
  shortSpecs: CpmWindowSpec[];
  activeKind: string;
  onPickKind: (kind: string) => void;
  /** Under the title: loop tag · name · the window size the page shows. */
  subtitle: string;
}> = ({ subtitle, onPickKind, ...rest }) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <ObcButton variant="normal" aria-haspopup="dialog" onClick={() => setOpen(true)}>Compare window sizes</ObcButton>
      {open && createPortal(
        <Dialog open onClose={close} title="Compare window sizes" subtitle={subtitle} size="wide"
          footer={<ObcButton variant="flat" onClick={close}>Close</ObcButton>}>
          <CompareAcrossKinds {...rest} onPickKind={kind => { onPickKind(kind); close(); }} />
        </Dialog>, document.body)}
    </>
  );
};

export default CompareWindowSizes;
