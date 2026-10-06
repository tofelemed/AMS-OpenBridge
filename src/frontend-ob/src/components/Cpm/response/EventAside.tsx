/**
 * 2026-09-17 audit F19: the selected event's right column. Identity (short ids, copyable), the subgates
 * A–H as steps (state + reason; the raw outputs behind a disclosure), the key results.
 * 2026-09-20 (cpa-ui-fix-plan Phase 7): the column is contained — every long value wraps inside it,
 * the window is two readable rows, the Workbench exit is a real button, and the 52-row catalogue
 * opens as a wide card in the centre column (see QuantityCatalogue) instead of overflowing this one.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, PanelHead, TonePill, fmtDuration } from '../shared';
import type { ResponseEventDetail, ResponseQuantity } from '../../../api/cpm/response';
import { CopyableId } from '../evidence/CopyableId';
import { formatInZone } from '../evidence/timezone';
import { workbenchHref } from '../evidence/selection';
import { keyResults, subgateSteps } from './responseCopy';
import { stateTone } from './responseSupport';
import { codeLabel, phrase } from '../vocabulary';

const outputText = (v: unknown): string => v == null ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : typeof v === 'object' ? JSON.stringify(v) : String(v);
/** A missing / zero epoch is unknown, never 1970. */
const when = (ms: unknown, tz: string): string => typeof ms === 'number' && ms > 0 ? formatInZone(ms, tz) : 'unknown';

export interface EventAsideProps {
  result: ResponseEventDetail['result'];
  metrics: ResponseQuantity[] | undefined;
  timeZone: string;
  methodRunId: string | undefined;
  loopId: string;
  resultRevision: number | undefined;
  /** From the list row; the result JSON keeps the type inside subgate B. */
  eventType?: string;
  /** The catalogue card in the centre column (Phase 7). */
  catalogueOpen: boolean;
  onToggleCatalogue: () => void;
}

export const EventAside: React.FC<EventAsideProps> = ({ result, metrics, timeZone, methodRunId, loopId, resultRevision, eventType, catalogueOpen, onToggleCatalogue }) => {
  const navigate = useNavigate();
  const steps = subgateSteps(result.subgates);
  const key = keyResults(metrics);
  const all = metrics ?? [];
  const applicable = all.filter(q => q.value != null).length;
  const start = typeof result.window_start_ms === 'number' && result.window_start_ms > 0 ? result.window_start_ms : null;
  const end = typeof result.window_end_ms === 'number' && result.window_end_ms > 0 ? result.window_end_ms : null;
  return (
    <section className="cpm-surface cpm-response-aside">
      <PanelHead eyebrow="Event" title={`${eventType ?? String(result.event_type ?? result.subgates?.B?.outputs?.event_type ?? 'event')} · ${result.path_id}`} right={<TonePill tone={stateTone(result.evaluation_state)}>{result.evaluation_state}</TonePill>} />
      <KvRow label="Window from">{when(start, timeZone)}</KvRow>
      <KvRow label="Window to">{end ? when(end, timeZone) : start ? 'open' : 'unknown'}</KvRow>
      <KvRow label="Duration">{start && end ? fmtDuration(end - start) : '—'}</KvRow>
      <KvRow label="Eligibility · finding">{result.eligibility} · {result.finding ? phrase(String(result.finding)) : '—'}</KvRow>
      <KvRow label="Method">{String(result.method_id ?? 'G12.SYSTEM_RESPONSE')} {String(result.method_version ?? '')}</KvRow>
      <div className="cpm-response-aside__ids">
        <span className="cpm-fact"><span className="cpm-fact__label">run</span><CopyableId label="method run id" value={methodRunId} /></span>
        <span className="cpm-fact"><span className="cpm-fact__label">bundle</span><CopyableId label="bundle hash" value={String(result.bundle_hash ?? '')} /></span>
        <span className="cpm-fact"><span className="cpm-fact__label">purpose</span><span className="cpm-mono">{result.purpose} · rev {resultRevision ?? '—'}</span></span>
      </div>
      <div className="cpm-inspector__actions">
        <ObcButton variant="raised" disabled={!methodRunId}
          title={methodRunId ? `Open the G12 run ${methodRunId} in the Evidence Workbench` : 'This event carries no method run id; there is no immutable run to open'}
          onClick={() => { if (methodRunId) navigate(workbenchHref(loopId, methodRunId, 'G12')); }}>
          Open in Evidence Workbench ›
        </ObcButton>
      </div>

      <PanelHead eyebrow="Subgates" title="Steps A–H" />
      <ol className="cpm-steps" aria-label="Subgates">
        {steps.map(s => (
          <li key={s.key} className={`cpm-step cpm-tone-${s.tone}`} data-subgate={s.key}>
            <span className="cpm-step__head">
              <span className="cpm-step__name">{s.key} {s.name}</span>
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
        <ObcButton variant="flat" aria-pressed={catalogueOpen}
          title={catalogueOpen ? 'Hide the full catalogue' : 'Every quantity of the catalogue, in the wide column'}
          onClick={onToggleCatalogue}>
          {catalogueOpen ? 'Hide all quantities' : `All ${all.length} quantities › (${applicable} reported)`}
        </ObcButton>
      )}
    </section>
  );
};
