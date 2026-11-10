'use client';

/**
 * SME review #11 (CHG-048): the period control shared by Historical and the Loop Explorer trend —
 * presets as one segmented group (+ Custom), ‹ / › to step one span, a Now / Live button, and the
 * custom From / To pair (applied on Apply, because a half-typed pair is not a range worth fetching).
 * Extracted from Historical's toolbar so both pages pick a period the same way.
 *
 * The drafts follow the APPLIED range when it changes underneath them (a preset, Back / Forward, a
 * deep link): inputs still showing the previous range would describe a window that is not plotted.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { fmtRange, toLocalInput, type RangePreset } from '../historical/timeRange';

export interface TimeRangeBarProps {
  from: Date;
  to: Date;
  presets: RangePreset[];
  /** The active preset key, or 'custom'. */
  preset: string;
  onPreset: (key: string) => void;
  onStep: (direction: -1 | 1) => void;
  /** Historical: "Now" (same span, ending now). Explorer: "Live" (back to the rolling window). */
  nowLabel?: string;
  nowTitle?: string;
  onNow: () => void;
  /** Returns an error sentence, or null when the pair was applied. */
  onApplyCustom: (from: string, to: string) => string | null;
  /** Shown beside the stepper text, e.g. "live" / "fixed period". */
  stateNote?: string;
  /** Controls right after Now / Live (CHG-158: Historical ↗ and Trend ↗ on the Explorer). */
  after?: React.ReactNode;
  /** Extra controls at the end of the row (e.g. "Open in Historical ›"). */
  children?: React.ReactNode;
}

export const TimeRangeBar: React.FC<TimeRangeBarProps> = ({
  from, to, presets, preset, onPreset, onStep, nowLabel = 'Now', nowTitle, onNow, onApplyCustom, stateNote, after, children,
}) => {
  const [draftFrom, setDraftFrom] = React.useState(() => toLocalInput(from));
  const [draftTo, setDraftTo] = React.useState(() => toLocalInput(to));
  const [rangeError, setRangeError] = React.useState<string | null>(null);
  const [customOpen, setCustomOpen] = React.useState(false);

  React.useEffect(() => {
    setDraftFrom(toLocalInput(from));
    setDraftTo(toLocalInput(to));
    setRangeError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  return (
    <div className="cpm-range-bar">
      {/* CHG-129: one dropdown. From and To open from Custom or from the dates, so an applied range stays one line. */}
      <select className="cpm-select" aria-label="Range" value={customOpen ? 'custom' : preset}
        onChange={e => {
          if (e.target.value === 'custom') { setCustomOpen(true); return; }
          setCustomOpen(false);
          onPreset(e.target.value);
        }}>
        {presets.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        <option value="custom">Custom</option>
      </select>

      <div className="cpm-hist-stepper">
        <ObcButton variant="flat" title="One period earlier" onClick={() => onStep(-1)}>‹</ObcButton>
        <button type="button" className="cpm-hist-stepper__text" aria-expanded={customOpen} title="Choose the dates"
          onClick={() => setCustomOpen(v => !v)}>
          {fmtRange(from, to)}
          {stateNote && <span className="cpm-range-bar__note"> · {stateNote}</span>}
        </button>
        <ObcButton variant="flat" title="One period later" onClick={() => onStep(1)}>›</ObcButton>
      </div>
      <ObcButton variant="normal" title={nowTitle} onClick={() => { setCustomOpen(false); onNow(); }}>{nowLabel}</ObcButton>
      {after}
      {children && <span className="cpm-range-bar__end">{children}</span>}

      {customOpen && (
        <div className="cpm-hist-custom">
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">From</span>
            <input className="cpm-input" type="datetime-local" value={draftFrom}
              onChange={e => setDraftFrom(e.target.value)} />
          </label>
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">To</span>
            <input className="cpm-input" type="datetime-local" value={draftTo}
              onChange={e => setDraftTo(e.target.value)} />
          </label>
          <ObcButton variant="raised"
            onClick={() => {
              const err = onApplyCustom(draftFrom, draftTo);
              setRangeError(err);
              if (!err) setCustomOpen(false);
            }}>
            Apply
          </ObcButton>
        </div>
      )}
      {rangeError && <span className="cpm-field__error" role="alert">{rangeError}</span>}
    </div>
  );
};

export default TimeRangeBar;
