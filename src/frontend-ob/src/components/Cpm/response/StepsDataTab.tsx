/**
 * CHG-165 (owner review): Steps & data, how the kernel decided. The subgates A–H as cards (state, reason, the outputs on demand)
 * and the quantity catalogue with the reported ones first; not-applicable rows stay listed, muted, with their reason, never as
 * 0. It replaces the right column (EventAside) and the catalogue card (QuantityCatalogue). The Workbench exit is in the band.
 * CHG-195 (owner review item 19): a card's "n outputs" opens a dialog (the step name, the loop and step under it) with the
 * outputs as label / value rows in plain words; the Event panel is gone (the band names the event); All quantities takes the
 * full width as the standard table, without the method column (owner Q8).
 * CHG-200 (final test #7; C6, C7, C9): every quantity named in words (the trends' "63 % time"), numbers without an exponent and
 * units in typographic form; the support column in the table's own figures.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill } from '../shared';
import { Dialog } from '../../../ui/Dialog';
import { DataTable, type Column } from '../../../ui/DataTable';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { codeLabel } from '../vocabulary';
import { quantityLabel, subgateSteps, type SubgateStep } from './responseCopy';
import { outputLabel, outputValue, pathLabel } from './responseLabels';
import { displayUnit, quantityText } from './responseSupport';

const support = (q: ResponseQuantity) => (q.supportFromMs != null && q.supportToMs != null ? `${Math.round((q.supportToMs - q.supportFromMs) / 1000)} s` : '—');

export interface StepsDataTabProps {
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  timeZone: string;
  /** The loop's registered PV unit, for the kernel's PV_EU placeholder. */
  pvUnit?: string | null;
}

const OutputsDialog: React.FC<{ step: SubgateStep; loopId: string; onClose: () => void }> = ({ step, loopId, onClose }) => createPortal(
  <Dialog open title={step.name} subtitle={`${loopId} · Step ${step.key}`} onClose={onClose}
    footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
    {step.outputs.map(([k, v]) => <KvRow key={k} label={outputLabel(k)}>{outputValue(k, v)}</KvRow>)}
  </Dialog>,
  document.body,
);

export const StepsDataTab: React.FC<StepsDataTabProps> = ({ result, metrics, pvUnit }) => {
  const [show, setShow] = useState<'reported' | 'all'>('reported');
  const [open, setOpen] = useState<SubgateStep | null>(null);
  const steps = subgateSteps(result.subgates);
  const all = metrics ?? [];
  const reported = all.filter(q => q.value != null);
  const rows = show === 'reported' ? reported : [...reported, ...all.filter(q => q.value == null)];
  const paths = new Set(all.map(q => q.pathId || '—'));
  const columns: Array<Column<ResponseQuantity>> = [
    { key: 'quantity', header: 'Quantity', cell: q => quantityLabel(q.quantityId) },
    { key: 'value', header: 'Value', cell: q => <span className="cpm-nowrap">{displayUnit(quantityText(q), q.pathId, pvUnit)}</span> },
    ...(paths.size > 1 ? [{ key: 'path', header: 'Path', cell: (q: ResponseQuantity) => pathLabel(q.pathId) }] : []),
    // CHG-200 (C9): the support in the table's figures, the unit beside the number (not the identifiers' monospace)
    { key: 'support', header: 'Support', cell: q => <span className="cpm-nowrap cpm-num">{support(q)}</span> },
  ];
  return (
    <>
      <ol className="cpm-response-step-cards" aria-label="Subgates">
        {steps.map(s => (
          <li key={s.key} className={`cpm-surface cpm-response-step-card cpm-tone-${s.tone}`} data-subgate={s.key}>
            <span className="cpm-step__head">
              <strong>{s.key} {s.name}</strong>
              <TonePill tone={s.tone}>{codeLabel(s.state)}</TonePill>
            </span>
            {s.reason && <span className="cpm-event-row__sub">{s.reason}</span>}
            {s.outputs.length > 0 && (
              <span className="cpm-response-step-card__outputs">
                <ObcButton variant="flat" aria-haspopup="dialog" onClick={() => setOpen(s)}>
                  {s.outputs.length} output{s.outputs.length === 1 ? '' : 's'}
                </ObcButton>
              </span>
            )}
          </li>
        ))}
      </ol>
      {open && <OutputsDialog step={open} loopId={result.loop_id} onClose={() => setOpen(null)} />}
      <section className="cpm-surface cpm-response-sub" aria-label="All quantities">
        <PanelHead title="All quantities" right={(
          <select className="cpm-select" aria-label="Quantities shown" value={show} onChange={e => setShow(e.target.value as 'reported' | 'all')}>
            <option value="reported">Reported ({reported.length})</option>
            <option value="all">All ({all.length})</option>
          </select>
        )} />
        {rows.length === 0 ? <p className="cpm-copy">No quantities were reported for this event.</p> : (
          <DataTable caption="Quantities of this event" columns={columns} rows={rows} rowKey={q => q.quantityId}
            rowClassName={q => (q.value == null ? 'cpm-row--muted' : undefined)} />
        )}
      </section>
    </>
  );
};

export default StepsDataTab;
