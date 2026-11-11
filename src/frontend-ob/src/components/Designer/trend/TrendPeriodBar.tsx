'use client';

/**
 * CHG-175 (owner's design, the Historical CHG-159 pattern): the Trend band's period controls. The range drop-down named
 * by its options (15m · 1h · 8h · 24h · 7d · Custom), one stepper "‹ 6 Nov 10:45 → 22:45 ›" (half a period per step, as
 * the time bar stepped; › never passes now), Pause (Resume while paused) and Now. Custom, or a click on the dates, opens
 * From · To · Apply inside the band with the two error lines. Every time in the site zone.
 *
 * Returned as siblings, so the band lays the From / To row and its error under the whole band row (the links stay in it).
 */
import React, { useEffect, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toSiteInput } from '../../../cpa/siteTime';
import { TREND_RANGES, periodText } from './trendWindow';
import type { TrendPeriod } from './useTrendPeriod';

export const TrendPeriodBar: React.FC<{ period: TrendPeriod; zone: string }> = ({ period, zone }) => {
  const { window: w, mode, rangeKey } = period;
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fill = () => { setDraftFrom(toSiteInput(w.start)); setDraftTo(toSiteInput(w.end)); };
  const openCustom = () => { fill(); setError(null); setOpen(true); };
  const close = () => { setOpen(false); setError(null); };
  // A fixed period changed underneath (Back / Forward): the open row shows it, never the one before. A live tick does not
  // touch what is being typed.
  const fixedKey = mode === 'fixed' ? `${w.start}-${w.end}` : 'live';
  useEffect(() => {
    if (open && mode === 'fixed') fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the fixed period only
  }, [fixedKey]);

  const apply = () => {
    const err = period.applyCustom(draftFrom, draftTo);
    setError(err);
    if (!err) setOpen(false);
  };

  return (
    <>
      <div className="cpm-range-bar trend-period">
        <select className="cpm-select" aria-label="Range" value={open ? 'custom' : rangeKey}
          onChange={e => {
            if (e.target.value === 'custom') { openCustom(); return; }
            close();
            period.chooseRange(e.target.value);
          }}>
          {TREND_RANGES.map(r => <option key={r.key} value={r.key}>{r.key}</option>)}
          <option value="custom">Custom</option>
        </select>
        <div className="cpm-hist-stepper">
          <ObcButton variant="flat" title="Half a period earlier" onClick={() => { close(); period.step(-1); }}>‹</ObcButton>
          <button type="button" className="cpm-hist-stepper__text" aria-expanded={open} title="Choose the dates"
            onClick={() => (open ? close() : openCustom())}>
            {periodText(w.start, w.end, zone)}
          </button>
          <ObcButton variant="flat" title="Half a period later" disabled={period.forwardDisabled}
            onClick={() => { close(); period.step(1); }}>›</ObcButton>
        </div>
        {/* Pause belongs to a live range: disabled once stepped away from now (as the time bar had it), absent on Custom. */}
        {rangeKey !== 'custom' && (
          <ObcButton variant="flat" disabled={mode === 'fixed'} onClick={period.togglePause}>
            {mode === 'paused' ? 'Resume' : 'Pause'}
          </ObcButton>
        )}
        <ObcButton variant="normal" onClick={() => { close(); period.goNow(); }}>Now</ObcButton>
      </div>
      {open && (
        <div className="cpm-hist-custom trend-page__custom">
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">From</span>
            <input className="cpm-input" type="datetime-local" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} />
          </label>
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">To</span>
            <input className="cpm-input" type="datetime-local" value={draftTo} onChange={e => setDraftTo(e.target.value)} />
          </label>
          <ObcButton variant="raised" onClick={apply}>Apply</ObcButton>
        </div>
      )}
      {error && <span className="cpm-field__error trend-page__custom" role="alert">{error}</span>}
    </>
  );
};

export default TrendPeriodBar;
