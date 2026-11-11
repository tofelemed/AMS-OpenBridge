/**
 * CHG-165 (owner review): Steps & data, how the kernel decided. The subgates A–H as cards (state, reason, the raw outputs on
 * demand), the event's identity said once (window, eligibility and finding, method, run, bundle, purpose), and the quantity
 * catalogue with the reported ones first; not-applicable rows stay listed, muted, with their reason, never as 0. It replaces
 * the right column (EventAside) and the catalogue card (QuantityCatalogue). The Workbench exit is in the band.
 */
import React, { useState } from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { CopyableId } from '../evidence/CopyableId';
import { readable } from '../evidence/format';
import { fmtPeriod } from '../context/LoopContextBar';
import { codeLabel, phrase } from '../vocabulary';
import { KEY_RESULT_IDS, subgateSteps } from './responseCopy';
import { displayUnit, quantityText } from './responseSupport';

const outputText = (v: unknown): string => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : readable(v)) : typeof v === 'object' ? JSON.stringify(v) : String(v);
const positive = (ms: unknown): number | null => (typeof ms === 'number' && ms > 0 ? ms : null);
const LABEL = new Map(KEY_RESULT_IDS);
const quantityLabel = (id: string) => LABEL.get(id) ?? codeLabel(id);

export interface StepsDataTabProps {
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  timeZone: string;
  methodRunId: string | undefined;
  resultRevision: number | undefined;
  /** The loop's registered PV unit, for the kernel's PV_EU placeholder. */
  pvUnit?: string | null;
}

export const StepsDataTab: React.FC<StepsDataTabProps> = ({ result, metrics, timeZone, methodRunId, resultRevision, pvUnit }) => {
  const [show, setShow] = useState<'reported' | 'all'>('reported');
  const steps = subgateSteps(result.subgates);
  const all = metrics ?? [];
  const reported = all.filter(q => q.value != null);
  const rows = show === 'reported' ? reported : [...reported, ...all.filter(q => q.value == null)];
  const paths = new Set(all.map(q => q.pathId || '—'));
  const start = positive(result.window_start_ms);
  const end = positive(result.window_end_ms);
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
              <details className="cpm-step__outputs">
                <summary>{s.outputs.length} output{s.outputs.length === 1 ? '' : 's'}</summary>
                {s.outputs.map(([k, v]) => <KvRow key={k} label={k}><span className="cpm-mono cpm-wrap">{outputText(v)}</span></KvRow>)}
              </details>
            )}
          </li>
        ))}
      </ol>
      <div className="cpm-response-pair cpm-response-pair--wide-right">
        <section className="cpm-surface cpm-response-sub cpm-response-aside" aria-label="Event">
          <PanelHead title="Event" />
          <KvRow label="Window">{start || end ? fmtPeriod({ label: '', start, end }, timeZone).slice(1).trim() : 'unknown'}</KvRow>
          <KvRow label="Eligibility · finding">{codeLabel(result.eligibility)} · {result.finding ? phrase(String(result.finding)) : '—'}</KvRow>
          <KvRow label="Method">{String(result.method_id ?? 'G12.SYSTEM_RESPONSE')} {String(result.method_version ?? '')}</KvRow>
          <KvRow label="Run"><CopyableId label="method run id" value={methodRunId} /></KvRow>
          <KvRow label="Bundle"><CopyableId label="bundle hash" value={String(result.bundle_hash ?? '')} /></KvRow>
          <KvRow label="Purpose">{result.purpose} · rev {resultRevision ?? '—'}</KvRow>
        </section>
        <section className="cpm-surface cpm-response-sub" aria-label="All quantities">
          <PanelHead title="All quantities" right={(
            <select className="cpm-select" aria-label="Quantities shown" value={show} onChange={e => setShow(e.target.value as 'reported' | 'all')}>
              <option value="reported">Reported ({reported.length})</option>
              <option value="all">All ({all.length})</option>
            </select>
          )} />
          {rows.length === 0 ? <p className="cpm-copy">No quantities were reported for this event.</p> : (
            <div className="cpm-table-wrap">
              <table className="cpm-table" data-table="quantities-all">
                <thead><tr><th>Quantity</th><th>Value</th><th>Method</th>{paths.size > 1 && <th>Path</th>}<th>Support</th></tr></thead>
                <tbody>
                  {rows.map(q => (
                    <tr key={q.quantityId} data-applicable={q.value != null} className={q.value == null ? 'cpm-row--muted' : undefined}>
                      <td title={q.quantityId}>{quantityLabel(q.quantityId)}</td>
                      <td className="cpm-nowrap">{displayUnit(quantityText(q), q.pathId, pvUnit)}</td>
                      <td className="cpm-mono cpm-wrap">{q.method || '—'}</td>
                      {paths.size > 1 && <td className="cpm-mono">{q.pathId || '—'}</td>}
                      <td className="cpm-mono cpm-nowrap">{q.supportFromMs != null && q.supportToMs != null ? `${Math.round((q.supportToMs - q.supportFromMs) / 1000)} s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default StepsDataTab;
