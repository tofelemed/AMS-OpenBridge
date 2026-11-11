/**
 * 2026-09-17 audit F22: the fast conditions on Loop Events. A limit dwell (G10) or a freeze (G11) is detected within a minute
 * by the Condition Engine and lands here long before the next fused window judges it: open ones first, closed ones with
 * their reason. CHG-167 (owner review): the rows are searched, filtered by state and paged here, on the client, because
 * `GET /conditions` returns every row (up to its limit) with no search or paging of its own.
 */
import type { CpmCondition } from '../../../api/cpm/conditions';
import { fmtDateTime, fmtDuration } from '../shared';
import { gateName } from '../gateStatus';
import { serviceName } from '../loopName';
import { ageText } from '../verdictAge';
import { codeLabel, phrase } from '../vocabulary';
import { stamp } from './eventTime';
import type { StateView } from './shelfState';

const KIND_LABEL: Record<string, string> = { FREEZE: 'Freeze', LIMIT_LOW: 'Limit low', LIMIT_HIGH: 'Limit high' };
/** An OPEN condition the engine has not updated for this long is stale: its job restarted or the loop's samples stopped. */
export const STALE_AFTER_MS = 10 * 60_000;

export interface ConditionRow {
  key: string;
  loopId: string;
  displayName: string;
  /** What the loop is, without its tag ("Temperature controller (FCS0102)"). */
  description: string;
  gateLabel: string;
  /** "G10 · Valve / saturation". */
  gateTitle: string;
  label: string;
  open: boolean;
  /** Open on record but not updated for STALE_AFTER_MS - said, never shown as live. */
  stale: boolean;
  state: string;
  since: string;
  lastUpdate: string;
  startedAt: string;
  /** "7 Nov 10:24", in the site zone the column heading names. */
  started: string;
  last: string;
  duration: string;
  reason: string;
}

export function conditionRows(conditions: CpmCondition[], now: number): ConditionRow[] {
  return conditions.map(c => ({
    key: `${c.loopId}|${c.gate}|${c.kind}|${c.startMs}`,
    loopId: c.loopId,
    displayName: c.displayName ?? c.loopId,
    description: serviceName(c),
    gateLabel: c.gate,
    gateTitle: `${c.gate} · ${gateName(c.gate)}`,
    label: KIND_LABEL[c.kind] ?? codeLabel(c.kind),
    open: c.state !== 'CLOSED',
    stale: c.state !== 'CLOSED' && now - c.lastMs > STALE_AFTER_MS,
    state: c.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
    since: ageText(Math.max(0, now - c.startMs)),
    lastUpdate: ageText(Math.max(0, now - c.lastMs)),
    startedAt: fmtDateTime(new Date(c.startMs).toISOString()),
    started: stamp(c.startMs),
    last: stamp(c.lastMs),
    duration: fmtDuration(c.durationS * 1000),
    reason: c.closeReason ? phrase(c.closeReason) : '',
  }));
}

/** The state as tone + glyph + word: a stale open condition is never shown as live. */
export function conditionBadge(r: Pick<ConditionRow, 'open' | 'stale'>): Required<StateView> {
  if (!r.open) return { label: 'Closed', tone: 'muted', glyph: '○' };
  return r.stale ? { label: 'Open · stale', tone: 'muted', glyph: '◌' } : { label: 'Open', tone: 'warn', glyph: '●' };
}

export type ConditionFilter = 'all' | 'open' | 'closed';

/** The rows a search (loop or description, the full registry name included) and a state choice leave, in the API's order. */
export function filterConditions(rows: ConditionRow[], query: string, state: ConditionFilter): ConditionRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter(r => (state === 'all' || (state === 'open') === r.open)
    && (!q || `${r.loopId} ${r.displayName}`.toLowerCase().includes(q)));
}
