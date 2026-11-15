/**
 * CHG-165 (owner review): the words of the System Response tabs. An event is named once in the band (time · type · path ·
 * state); an event row names the model it produced from the loop's models already loaded (no request per row). CHG-195: the
 * foot line went. Nothing here derives a number.
 */
import type { ResponseEventSummary, SystemModel } from '../../../api/cpm/response';
import { fmtInstantBare } from '../context/LoopContextBar';
import { codeLabel, humanise as words } from '../vocabulary';
import { readable } from '../evidence/format';
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

/** CHG-195 (owner review item 19): the plain names of a step's output keys; any other key is humanised below. */
const OUTPUT_LABEL: Record<string, string> = {
  path_id: 'Path', sample_grid_s: 'Sample interval (s)', u_applied_available: 'Applied OP available',
};
const UNIT_SUFFIX: Array<[RegExp, string]> = [[/_ms$/, 'ms'], [/_s$/, 's'], [/_pct$/, '%']];

/** "path_id" → "Path"; another key in sentence case without underscores, a unit suffix in brackets ("fit_ms" → "Fit (ms)"). */
export function outputLabel(key: string): string {
  if (OUTPUT_LABEL[key]) return OUTPUT_LABEL[key];
  for (const [suffix, unit] of UNIT_SUFFIX) if (suffix.test(key)) return `${words(key.replace(suffix, ''))} (${unit})`;
  return words(key);
}

/** A step output in words: a path with its arrow, a code in sentence case, Yes / No; free text and numbers as they are. */
export function outputValue(key: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : readable(v);
  if (typeof v === 'object') return JSON.stringify(v);
  const t = String(v);
  if (key === 'path_id' || /^[A-Z]+(_[A-Z]+)*_TO_[A-Z_]+$/.test(t)) return pathLabel(t);
  return /^[A-Z][A-Z0-9_]*$/.test(t) ? codeLabel(t) : t;
}
