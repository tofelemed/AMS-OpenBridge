/**
 * The loop context bar (SME review 2026-10-05, point 3): one compact row that
 * stays at the top of the content while a long CPM page scrolls, naming the
 * loop, its service, its plant location and the period THIS page is showing.
 *
 * The loop, service and location come from the registry list every CPM page
 * already loads (`useCpmLoops`, one cached query — no new request). The period
 * is passed by the page, because "window" means a different thing on each page
 * (an evaluated fused window, a historical range, a window profile, a response
 * event); the bar states it, it does not choose it.
 *
 * Read-only by design: each page keeps its own loop picker. Renders nothing
 * when no loop is selected.
 */
import React, { useLayoutEffect, useRef } from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmLoops } from '../../../hooks/useCpm';

export interface LoopPeriod {
  /** What the period is, e.g. "24h fused window", "Historical range", "Latest results". */
  label: string;
  start?: string | number | null;
  end?: string | number | null;
}

/** Plant location as readable text: `hdpe › section 400 › u4002 catalyst tankfarm`. */
export function fmtLocation(loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>): string {
  return [loop.site, loop.area, loop.unit]
    .filter((s): s is string => !!s)
    .map(s => s.replace(/_/g, ' '))
    .join(' › ');
}

const validZone = (tz: string | undefined): string | undefined => {
  if (!tz) return undefined;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch { return undefined; }
};

const toMs = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** "5 Oct 16:15" in the zone (browser zone when none); the zone is named by the caller. */
function fmtShortParts(ms: number, tz: string | undefined): string {
  // Assembled from parts: the locale's own joiner ("4 Oct, 12:15") varies by engine.
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz,
  }).formatToParts(ms);
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find(x => x.type === t)?.value ?? '';
  return `${p('day')} ${p('month')} ${p('hour')}:${p('minute')}`;
}

const zoneName = (ms: number, tz: string | undefined): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(ms).find(p => p.type === 'timeZoneName')?.value ?? '';

/** One instant, compact, zone named: "10 Aug 01:00 GST". The CPM summary surfaces share it. */
export function fmtInstant(v: string | number | null | undefined, timeZone?: string): string {
  const ms = toMs(v);
  if (ms == null) return '—';
  const tz = validZone(timeZone);
  return `${fmtShortParts(ms, tz)} ${zoneName(ms, tz)}`.trim();
}

/**
 * `24h fused window · 4 Oct 16:15 → 5 Oct 16:15 UTC`. The zone is always named
 * (the P2-13 rule), once, after the end. `timeZone` defaults to the browser's,
 * the zone every other CPM timestamp is shown in.
 */
export function fmtPeriod(period: LoopPeriod, timeZone?: string): string {
  const tz = validZone(timeZone);
  const start = toMs(period.start);
  const end = toMs(period.end);
  if (start == null && end == null) return period.label;
  const at = (ms: number) => fmtShortParts(ms, tz);
  const range = start != null && end != null ? `${at(start)} → ${at(end)}`
    : end != null ? `ending ${at(end)}` : `from ${at(start!)}`;
  return `${period.label} · ${range} ${zoneName(end ?? start!, tz)}`.trim();
}

/**
 * Publishes the bar's height on the page (`--cpm-context-h` on .cpm-screen) so
 * the panels that stick inside the same scroller (the docked evidence
 * inspector, the workbench explain column, the response event list) stop
 * BELOW the bar instead of sliding under it. Measured, because the bar wraps
 * to two lines on narrow screens and long periods.
 */
function useStickyOffset() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const apply = () => host.style.setProperty('--cpm-context-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    apply();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); host.style.removeProperty('--cpm-context-h'); };
  });
  return ref;
}

export const LoopContextBar: React.FC<{
  loopId: string | null | undefined;
  /** The period the page is showing; omitted while it is still loading. */
  period?: LoopPeriod | null;
  /** The zone the page shows its times in (the Evidence Workbench uses the site zone). */
  timeZone?: string;
}> = ({ loopId, period, timeZone }) => {
  const loops = useCpmLoops();
  const ref = useStickyOffset();
  if (!loopId) return null;
  const loop = loops.data?.loops.find(l => l.loopId.toLowerCase() === loopId.toLowerCase());
  return (
    <div ref={ref} className="cpm-loop-context" role="region" aria-label="Current loop and period" data-testid="loop-context">
      <span className="cpm-loop-context__item">
        <span className="cpm-loop-context__label">Loop</span>
        <strong>{loop?.loopId ?? loopId}</strong>
        {loop ? (
          <span>{loop.displayName}</span>
        ) : (
          <span className="cpm-loop-context__muted">{loops.isLoading ? 'loading…' : 'not in the loop registry'}</span>
        )}
        {loop && (
          <span className="cpm-loop-context__muted">
            {loop.loopType}{loop.criticality ? ` · criticality ${loop.criticality}` : ''}
          </span>
        )}
      </span>
      {loop && (
        <span className="cpm-loop-context__item">
          <span className="cpm-loop-context__label">Location</span>
          <span>{fmtLocation(loop) || '—'}</span>
        </span>
      )}
      <span className="cpm-loop-context__item">
        <span className="cpm-loop-context__label">Period</span>
        <span>{period ? fmtPeriod(period, timeZone) : '—'}</span>
      </span>
    </div>
  );
};
