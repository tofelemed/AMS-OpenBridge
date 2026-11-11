/**
 * CHG-165 (owner review): the words of the System Response tabs. An event is named once in the band (time · type · path ·
 * state); an event row names the model it produced from the loop's models already loaded (no request per row); the foot says
 * the selected event once. Nothing here derives a number.
 */
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { fmtInstantBare, fmtPeriod } from '../context/LoopContextBar';
import { codeLabel } from '../vocabulary';
import { eventRowView } from './responseCopy';
import { fmt } from './responseSupport';

/** "OP_TO_PV" → "OP → PV". */
export const pathLabel = (pathId: string | null | undefined): string => {
  const p = (pathId ?? '').trim().toUpperCase();
  return p ? p.split('_TO_').map(s => s.replace(/_/g, ' ')).join(' → ') : '—';
};

/** "INPUT_TEST" → "Input test". */
export const typeLabel = (eventType: string | null | undefined): string => codeLabel(eventType);

/** The band's option: "7 Oct 05:43 · Input test · OP → PV · Candidate". */
export const eventPick = (e: ResponseEventSummary, timeZone?: string): string =>
  `${fmtInstantBare(e.t0Ms, timeZone)} · ${typeLabel(e.eventType)} · ${pathLabel(e.pathId)} · ${codeLabel(eventRowView(e).state)}`;

/** The model an event produced; a reviewed model has later revisions, the newest is the one in force. */
export function modelOfEvent(models: SystemModel[] | undefined, eventId: string): SystemModel | undefined {
  let best: SystemModel | undefined;
  for (const m of models ?? []) if (m.createdFromEvent === eventId && (!best || m.revision > best.revision)) best = m;
  return best;
}

const BRIEF: Array<[string, string, boolean]> = [['process_gain', 'K', false], ['integrating_gain', 'Ki', false], ['dead_time', 'θ', true], ['time_constant', 'τ', true]];

/** "FOPDT · K 0.21 · θ 0.00 s · τ 0.50 s": the family and the parameters an engineer reads first. */
export function modelBrief(m: SystemModel): string {
  const parts = [m.family];
  for (const [id, symbol, timed] of BRIEF) {
    const p = m.parameters?.[id];
    if (p?.value != null) parts.push(`${symbol} ${fmt(p.value)}${timed && p.unit ? ` ${p.unit}` : ''}`);
  }
  return parts.join(' · ');
}

/** The foot: "Input test · 7 Oct 05:43 → 7 Oct 05:47 UTC · OP → PV · run 6a1e89ce". */
export const eventFoot = (e: Pick<ResponseEventSummary, 'eventType' | 'pathId' | 't0Ms' | 'tEndMs' | 'methodRunId'>, timeZone?: string): string =>
  `${fmtPeriod({ label: typeLabel(e.eventType), start: e.t0Ms, end: e.tEndMs }, timeZone)} · ${pathLabel(e.pathId)}${e.methodRunId ? ` · run ${e.methodRunId.slice(0, 8)}` : ''}`;
