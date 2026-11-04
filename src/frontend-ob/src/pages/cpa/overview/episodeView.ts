/**
 * Episodes on Overview. `/events/page` takes plant scope but no time range, and `/events` takes a
 * start but no scope. Scope is the server's. The range is cut here from the newest-opened rows,
 * which is exact while the list reaches back far enough, and `partial` says when it may not have.
 */
import type { CpmEventFrame } from '../../../api/cpmApi';
import { stateView } from '../../../components/Cpm/events/shelfState';
import { episodeTone } from '../../../ui/statusTones';
import type { Bounds } from './overviewFormat';
import type { Condition } from './reviewRows';

export const RECENT_SIZE = 10;
/** The server's page limit (CpmEventPageController.MaxPageSize). */
export const RECENT_SCAN = 100;

/** Active in the range: opened before it ended, and not closed before it began. */
const activeIn = (e: CpmEventFrame, bounds: Bounds) =>
  Date.parse(e.opened_at) <= bounds.to && (e.closed_at == null || Date.parse(e.closed_at) >= bounds.from);

export function recentInRange(events: CpmEventFrame[], bounds: Bounds | null, total: number) {
  const rows = (bounds ? events.filter(e => activeIn(e, bounds)) : events).slice(0, RECENT_SIZE);
  return { rows, partial: rows.length < RECENT_SIZE && total > events.length };
}

const TONE = {
  warn: episodeTone('UNACKNOWLEDGED').tone,
  good: episodeTone('ACKNOWLEDGED').tone,
  muted: episodeTone('SHELVED').tone,
} as const;

/** The existing state words, on the CD8 episode tones. */
export function episodeBadge(e: CpmEventFrame, now: number): Condition {
  const view = stateView(e, now);
  return { label: view.label, tone: TONE[view.tone as keyof typeof TONE] ?? 'unknown' };
}
