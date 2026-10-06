/**
 * SME review #11 (CHG-048): the Loop Explorer trend's period, held in the URL like Historical's.
 *
 *  - no `from` / `to` → LIVE: the rolling 8 h window, advancing on a timer (as before);
 *  - `from` + `to`     → a FIXED period, absolute so a shared link means the same window tomorrow.
 * Presets other than 8 h, ‹ / ›, and the custom pair write a fixed period; "Live" removes it.
 * The same names as Historical, so "Open in Historical" and the menu carry the period as is.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TREND_SPAN_MS, TREND_TICK_MS, useRollingWindow } from '../shared';
import {
  EXPLORER_PRESETS, LIVE_PRESET_KEY, activePreset, parseCustomRange, presetRange, stepRange,
} from '../historical/timeRange';

const valid = (iso: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function useTrendRange() {
  const [params, setParams] = useSearchParams();
  const rolling = useRollingWindow(TREND_SPAN_MS, TREND_TICK_MS);
  const pinnedFrom = valid(params.get('from'));
  const pinnedTo = valid(params.get('to'));
  const live = !(pinnedFrom && pinnedTo && pinnedTo > pinnedFrom);

  const { from, to } = useMemo(
    () => (live ? { from: rolling.start, to: rolling.end } : { from: pinnedFrom!, to: pinnedTo! }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the instants, not Date identities
    [live, rolling.start.getTime(), rolling.end.getTime(), pinnedFrom?.getTime(), pinnedTo?.getTime()],
  );

  const pin = (f: Date, t: Date) =>
    setParams(p => { p.set('from', f.toISOString()); p.set('to', t.toISOString()); return p; }, { replace: true });
  const goLive = () => setParams(p => { p.delete('from'); p.delete('to'); return p; }, { replace: true });

  return {
    from, to, live,
    preset: live ? LIVE_PRESET_KEY : activePreset(from, to, Date.now(), EXPLORER_PRESETS),
    presets: EXPLORER_PRESETS,
    applyPreset: (key: string) => {
      if (key === LIVE_PRESET_KEY) { goLive(); return; }
      const p = EXPLORER_PRESETS.find(x => x.key === key);
      if (p) { const r = presetRange(p.ms); pin(r.from, r.to); }
    },
    step: (dir: -1 | 1) => { const r = stepRange(from, to, dir); pin(r.from, r.to); },
    goLive,
    applyCustom: (f: string, t: string): string | null => {
      const r = parseCustomRange(f, t);
      if (typeof r === 'string') return r;
      pin(r.from, r.to);
      return null;
    },
  };
}
