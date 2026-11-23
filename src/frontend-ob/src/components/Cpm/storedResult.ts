/**
 * CHG-226 (owner, 23 Nov): the words for a result kept on screen until a new one arrives - "Last stored result · 23 Nov · 10:15",
 * the time in the one short CPA format (fmtWhen, the site zone). Plain words only: the reason it is kept is not the reader's
 * concern. A row says it once, beside the time it already shows; where that time is the same minute, the label takes its place.
 */
import type { CpmStoredResult } from '../../api/cpm/storedResult';
import { fmtWhen } from './blocks/whenText';

export const LAST_STORED = 'Last stored result';

/** "Last stored result · 23 Nov · 10:15", or null when the item is not a stored result (the fields absent count as not). */
export function lastStoredText(item: CpmStoredResult | null | undefined): string | null {
  if (item?.lastStored !== true) return null;
  const at = fmtWhen(item.resultAt);
  return at === '—' ? LAST_STORED : `${LAST_STORED} · ${at}`;
}

/** True when the label names the same minute as `shown`, the time the row already prints: the row then says it once. */
export function storedAtShownTime(item: CpmStoredResult | null | undefined, shown: string | null | undefined): boolean {
  if (lastStoredText(item) == null || !item?.resultAt || !shown) return false;
  const at = fmtWhen(item.resultAt);
  return at !== '—' && at === fmtWhen(shown);
}
