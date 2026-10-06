/**
 * CHG-048 (SME #11): the Explorer trend's period as read from the URL — for the pieces outside the
 * trend that must name it or hand it on (the context bar, "Open Historical"). Live = no from/to.
 */
import { fmtRange } from '../historical/timeRange';
import { TREND_SPAN_MS as LIVE_TREND_MS } from '../shared';

const pinned = (params: URLSearchParams): { from: Date; to: Date } | null => {
  const f = params.get('from'); const t = params.get('to');
  if (!f || !t) return null;
  const from = new Date(f); const to = new Date(t);
  return Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from ? null : { from, to };
};

/** "last 8 h" while live, else the pinned range ("1 Oct 00:00 → 2 Oct 00:00"). */
export function trendPeriodText(params: URLSearchParams): string {
  const p = pinned(params);
  return p ? fmtRange(p.from, p.to) : 'last 8 h';
}

/** The absolute period to hand another page: the pinned one, else the live 8 h made absolute now. */
export function trendPeriodOf(params: URLSearchParams, nowMs = Date.now()): { from: string; to: string } {
  const p = pinned(params);
  return p
    ? { from: p.from.toISOString(), to: p.to.toISOString() }
    : { from: new Date(nowMs - LIVE_TREND_MS).toISOString(), to: new Date(nowMs).toISOString() };
}
