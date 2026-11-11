/**
 * CHG-175: the Trend page's period, read from the address. A live range (`?range=`, 15m when none), a fixed period
 * (`?from=&to=`, ISO), or a live range paused here (Pause freezes the end, as the time bar did; it is not written).
 *
 * The address follows the screen, so Back, Forward and a copied link reopen what is drawn: a range choice and Now write
 * `range`; a step and Custom write `from`/`to` (the span then names the range). A `?range=` link opened while the page is
 * open applies at once. A new period resets the zoom; Pause and Resume keep it. The window moves on a 2 s tick while
 * live, as the chart's own live tick did.
 */
import { useEffect, useMemo, useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import { fromSiteInput } from '../../../cpa/siteTime';
import { endsAtNow, fixedPeriodOf, rangeForSpan, rangeOf, stepPeriod, type Period } from './trendWindow';

const TICK_MS = 2000;

export type PeriodMode = 'live' | 'paused' | 'fixed';

export interface TrendPeriod {
  /** The window the chart draws; `live` while it follows now. */
  window: { start: number; end: number; live: boolean };
  mode: PeriodMode;
  /** What the range drop-down shows: a range's key, or `custom` for a fixed period no range spans. */
  rangeKey: string;
  /** › has nowhere to go: the window already ends now. */
  forwardDisabled: boolean;
  /** Changes whenever the period is new (a range, a step, Custom, Now); the chart resets its zoom on it. */
  zoomResetKey: string;
  chooseRange: (key: string) => void;
  step: (dir: -1 | 1) => void;
  togglePause: () => void;
  goNow: () => void;
  /** Applies typed site-zone times; returns the error sentence, or null when applied. */
  applyCustom: (from: string, to: string) => string | null;
  /** The period on screen at this instant (a live one ends now). */
  current: () => Period;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function useTrendPeriod(params: URLSearchParams, setParams: SetURLSearchParams): TrendPeriod {
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const rangeParam = params.get('range');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the two values it reads
  const fixed = useMemo(() => fixedPeriodOf(params), [fromParam, toParam]);
  const range = rangeOf(rangeParam);

  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [nowPresses, setNowPresses] = useState(0);

  // A new period in the address (a choice here, Back / Forward, a link opened on the page) ends a pause.
  useEffect(() => { setPausedAt(null); setNow(Date.now()); }, [rangeParam, fromParam, toParam]);

  const mode: PeriodMode = fixed ? 'fixed' : pausedAt != null ? 'paused' : 'live';
  useEffect(() => {
    if (mode !== 'live') return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [mode]);

  const end = fixed ? fixed.end : pausedAt ?? now;
  const start = fixed ? fixed.start : end - range.ms;
  const live = mode === 'live';
  const window = useMemo(() => ({ start, end, live }), [start, end, live]);

  /** Writes the address only when it changes, so a repeated Now adds no history entry. */
  const write = (mutate: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(params);
    mutate(q);
    if (q.toString() !== params.toString()) setParams(q);
  };
  const writeFixed = (p: Period) => write(q => { q.set('from', iso(p.start)); q.set('to', iso(p.end)); q.delete('range'); });
  const writeRange = (key: string) => write(q => { q.set('range', key); q.delete('from'); q.delete('to'); });
  const spanRange = fixed ? rangeForSpan(fixed.end - fixed.start) : null;

  return {
    window,
    mode,
    rangeKey: fixed ? (spanRange?.key ?? 'custom') : range.key,
    forwardDisabled: endsAtNow(end, Date.now()),
    zoomResetKey: `${range.key}|${fromParam ?? ''}|${toParam ?? ''}|${nowPresses}`,
    chooseRange: key => writeRange(rangeOf(key).key),
    step: dir => writeFixed(stepPeriod({ start, end }, dir, Date.now())),
    togglePause: () => {
      if (mode === 'live') setPausedAt(Date.now());
      else if (mode === 'paused') { setPausedAt(null); setNow(Date.now()); }
    },
    goNow: () => {
      // Back to live on the span shown when a range spans it, else the range the address last named.
      writeRange((spanRange ?? range).key);
      setPausedAt(null);
      setNow(Date.now());
      setNowPresses(n => n + 1);
    },
    applyCustom: (fromText, toText) => {
      const a = fromSiteInput(fromText);
      const b = fromSiteInput(toText);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 'Enter both dates.';
      if (b <= a) return '"To" must be after "From".';
      writeFixed({ start: a, end: b });
      return null;
    },
    current: () => (live ? { start: Date.now() - range.ms, end: Date.now() } : { start, end }),
  };
}
