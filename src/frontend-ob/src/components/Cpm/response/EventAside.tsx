/**
 * 2026-09-17 audit F19: the selected event's right column. Identity (short ids, copyable), the subgates
 * A–H as steps (state + reason; the raw outputs behind a disclosure), the key results, and the whole
 * 52-row catalogue folded away with its not-applicable rows greyed - never presented as 0.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { CopyableId } from '../evidence/CopyableId';
import { formatInZone } from '../evidence/timezone';
import { workbenchHref } from '../evidence/selection';
import { keyResults, subgateSteps } from './responseCopy';
import { quantityText, stateTone } from './responseSupport';

const outputText = (v: unknown): string => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : typeof v === 'object' ? JSON.stringify(v) : String(v);

export interface EventAsideProps {
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  timeZone: string;
  methodRunId: string | undefined;
  loopId: string;
  resultRevision: number | undefined;
  /** From the list row; the result JSON keeps the type inside subgate B. */
  eventType?: string;
}

export const EventAside: React.FC<EventAsideProps> = ({ result, metrics, timeZone, methodRunId, loopId, resultRevision, eventType }) => {
  const steps = subgateSteps(result.subgates);
  const key = keyResults(metrics);
  const all = metrics ?? [];
  const applicable = all.filter(q => q.value != null).length;
  return (
    <section className="cpm-surface cpm-response-aside">
      <PanelHead eyebrow="Event" title={`${eventType ?? String(result.event_type ?? result.subgates?.B?.outputs?.event_type ?? 'event')} · ${result.path_id}`} right={<TonePill tone={stateTone(result.evaluation_state)}>{result.evaluation_state}</TonePill>} />
      <KvRow label="Window">{formatInZone(result.window_start_ms, timeZone)} → {result.window_end_ms ? formatInZone(result.window_end_ms, timeZone) : 'open'}</KvRow>
      <KvRow label="Eligibility · finding">{result.eligibility} · {String(result.finding ?? '—').replace(/_/g, ' ').toLowerCase()}</KvRow>
      <KvRow label="Method">{String(result.method_id ?? 'G12.SYSTEM_RESPONSE')} {String(result.method_version ?? '')}</KvRow>
      <div className="cpm-response-aside__ids">
        <span className="cpm-fact"><span className="cpm-fact__label">run</span><CopyableId label="method run id" value={methodRunId} /></span>
        <span className="cpm-fact"><span className="cpm-fact__label">bundle</span><CopyableId label="bundle hash" value={String(result.bundle_hash ?? '')} /></span>
        <span className="cpm-fact"><span className="cpm-fact__label">purpose</span><span className="cpm-mono">{result.purpose} · rev {resultRevision ?? '—'}</span></span>
      </div>
      {methodRunId && <Link className="cpm-link" to={workbenchHref(loopId, methodRunId, 'G12')}>Open in Evidence Workbench ›</Link>}

      <PanelHead eyebrow="Subgates" title="Steps A–H" />
      <ol className="cpm-steps" aria-label="Subgates">
        {steps.map(s => (
          <li key={s.key} className={`cpm-step cpm-tone-${s.tone}`} data-subgate={s.key}>
            <span className="cpm-step__head">
              <span className="cpm-step__name">{s.key} {s.name}</span>
              <TonePill tone={s.tone}>{s.state}</TonePill>
            </span>
            {s.reason && <span className="cpm-event-row__sub">{s.reason}</span>}
            {s.outputs.length > 0 && (
              <details className="cpm-step__outputs">
                <summary>{s.outputs.length} output{s.outputs.length === 1 ? '' : 's'}</summary>
                {s.outputs.map(([k, v]) => <KvRow key={k} label={k}>{outputText(v)}</KvRow>)}
              </details>
            )}
          </li>
        ))}
      </ol>

      <PanelHead eyebrow="Quantities" title="Key results" />
      {key.length === 0 && <p className="cpm-copy">No quantities were reported for this event.</p>}
      <div className="cpm-response-quantities" data-table="key-results">
        {key.map(k => (
          <KvRow key={k.id} label={k.label}>
            <span className={k.applicable ? undefined : 'cpm-muted'}>{k.text}</span>
            {k.applicable && k.method ? <span className="cpm-muted"> · {k.method}</span> : null}
          </KvRow>
        ))}
      </div>
      {all.length > 0 && (
        <details className="cpm-response-aside__all">
          <summary>All {all.length} quantities of the catalogue · {applicable} reported, {all.length - applicable} not applicable</summary>
          <table className="cpm-table" data-table="quantities-all">
            <thead><tr><th>quantity</th><th>value</th><th>method</th></tr></thead>
            <tbody>
              {all.map(q => (
                <tr key={q.quantityId} data-applicable={q.value != null} className={q.value == null ? 'cpm-row--muted' : undefined}>
                  <td className="cpm-mono">{q.quantityId}</td><td>{quantityText(q)}</td><td className="cpm-mono">{q.method || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
};
