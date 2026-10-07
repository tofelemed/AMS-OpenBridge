/**
 * SME review #7 (CHG-045): the words of the priority queue — the level badge and
 * the one-line reason a loop sits where it does. The server orders the queue
 * (cplm-api FleetPrioritySql): priority level from loop criticality × finding
 * severity (ISA-18.2 practice, three levels), then control impact, then
 * persistence, then evidence score. This file only states that order, so every
 * phrase is unit-tested.
 */
import type { CpmRankedLoop } from '../../../api/cpmApi';
import type { CpmTone } from '../shared';
import { ageText } from '../explorer/summary/summaryText';

export const PRIORITY_RULE =
  'Ordered by priority (loop criticality × finding severity), then time outside the good-error band, then how long the condition has persisted, then evidence score. Shelved loops are listed in Loop Events.';

export function priorityBadge(priority: CpmRankedLoop['priority']): { label: string; tone: CpmTone } {
  switch (priority) {
    case 'HIGH': return { label: 'High priority', tone: 'bad' };
    case 'MEDIUM': return { label: 'Medium priority', tone: 'warn' };
    case 'LOW': return { label: 'Low priority', tone: 'muted' };
    default: return { label: 'Not prioritised', tone: 'muted' };
  }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * The reason line, in ranking order: "Critical loop · High severity · 21% in band ·
 * persisting 3 days (12 windows) · evidence score 100". Missing facts are left out,
 * never shown as zero.
 */
export function priorityReasons(l: CpmRankedLoop, now = Date.now(), opts: { impact?: boolean } = {}): string[] {
  const out: string[] = [];
  if (l.criticality) out.push(l.criticality.toLowerCase() === 'critical' ? 'Critical loop' : `${cap(l.criticality)}-criticality loop`);
  if (l.severity) out.push(`${cap(l.severity)} severity`);
  // The queue row shows impact as its good-error bar beside this line; `impact: false` avoids saying it twice.
  if (opts.impact !== false && l.metrics.goodErrorPct != null) out.push(`${Math.round(l.metrics.goodErrorPct * 100)}% in band`);
  if (l.episodeOpenedAt) {
    const since = Date.parse(l.episodeOpenedAt);
    if (Number.isFinite(since)) {
      const age = ageText(now - since).replace(/ ago$/, '');
      const windows = l.episodeWindowCount != null && l.episodeWindowCount > 0
        ? ` (${l.episodeWindowCount} window${l.episodeWindowCount === 1 ? '' : 's'})` : '';
      out.push(`persisting ${age}${windows}`);
    }
  }
  if (l.confidence != null) out.push(`evidence score ${Math.round(l.confidence * 100)}`);
  return out;
}
