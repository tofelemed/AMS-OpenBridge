/**
 * Formatting helpers the CPM pages share, and the sticky offset of the loop band. The loop context
 * bar that gave this file its name is gone: LoopBand took its place on every page about one loop.
 *
 * - `LoopPeriod`, `fmtPeriod`: a period as a page names it. "Window" means a different thing on each
 *   page (an evaluated fused window, a historical range, a window profile, a response event), so the
 *   page passes the period in and these only format it.
 * - `fmtInstant`: one instant, compact, with the zone named.
 * - `fmtLocation`: a loop's plant location as readable text.
 * - `useStickyOffset`: publishes the band's height so other sticky panels stop below it.
 */
import { activeZone } from '../../../cpa/activeZone';
import { useLayoutEffect, useRef } from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { locationPath } from '../vocabulary';

export interface LoopPeriod {
  /** What the period is, e.g. "24h fused window", "Historical range", "Latest results". */
  label: string;
  start?: string | number | null;
  end?: string | number | null;
}

/** Plant location as readable text: `HDPE › Section 400 › U4002 catalyst tankfarm` (CHG-051 vocabulary). */
export function fmtLocation(loop: Pick<CpmLoop, 'site' | 'area' | 'unit'>): string {
  return locationPath(loop);
}

const validZone = (requested: string | undefined): string | undefined => {
  const tz = requested ?? activeZone();
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
 * (the P2-13 rule), once, after the end. `timeZone` defaults to the site zone the
 * shell resolved, the zone the header names.
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
 * Publishes the loop band's height on the page (`--cpm-context-h` on .cpm-screen)
 * so the panels that stick inside the same scroller (the docked evidence
 * inspector, the workbench explain column, the response event list) stop
 * BELOW the band instead of sliding under it. Measured, because the band wraps
 * onto more lines on narrow screens and on tabs with many controls.
 */
export function useStickyOffset() {
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
