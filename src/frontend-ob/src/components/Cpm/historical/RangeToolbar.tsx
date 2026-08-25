'use client';

/**
 * Historical explorer toolbar — four labelled rows, narrowing left to right and
 * top to bottom: SCOPE (where) → LOOP (which) → RANGE (when) → VIEW (what to draw).
 *
 * It was one flex-wrap bucket holding ten controls. LoopPicker is three stacked
 * elements where its neighbours are one, so sharing a row with the scope selects
 * left a hole beside them and pushed Export onto its own line — four ragged
 * visual lines from one declared row. Each question now owns a row with its own
 * baseline, and the scope selects sit at the top where the narrowing starts.
 *
 * Colour here is functional, not decoration: the signal chips carry the SAME
 * --ams-pen-* token as the line each one draws, so the toggle and the pen are
 * self-evidently the same thing. Everything else stays neutral, because on a
 * diagnostic screen colour that means nothing competes with colour that does.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';
import type { CpmLoop } from '../../../api/cpmApi';
import { LoopPicker, PlantScopeFilter, type CpmScope } from '../plantScope';
import { RANGE_PRESETS, fmtRange, toLocalInput } from './timeRange';

const SIGNAL_KEYS = ['pv', 'sp', 'op', 'vp'] as const;
export type SignalKey = typeof SIGNAL_KEYS[number];
export { SIGNAL_KEYS };

/** Role → what the pen means, for the chip's accessible name. */
const SIGNAL_MEANING: Record<SignalKey, string> = {
  pv: 'Process variable', sp: 'Setpoint', op: 'Controller output', vp: 'Valve position',
};

const PRESET_KEYS = [...RANGE_PRESETS.map(p => p.key), 'custom'];

export interface RangeToolbarProps {
  scope: CpmScope;
  loops: CpmLoop[];
  loopId: string;
  loop: CpmLoop | undefined;
  loopsInScope: number;
  onLoopChange: (id: string) => void;

  from: Date;
  to: Date;
  preset: string;
  onPreset: (key: string) => void;
  onStep: (direction: -1 | 1) => void;
  onNow: () => void;
  onApplyCustom: (from: string, to: string) => string | null;

  signals: string[];
  onToggleSignal: (key: string) => void;

  overlays: { key: string; label: string; resolution: string }[];
  overlayKey: string;
  onOverlay: (key: string) => void;

  seriesPath: string | undefined;
  trendHref: string | null;
  onOpenTrend: (href: string) => void;

  exportDisabled: boolean;
  onExport: (fmt: 'json' | 'csv') => void;
}

/** One labelled row of the toolbar. */
const Row: React.FC<{ label: string; children: React.ReactNode; align?: 'start' | 'end' }> = ({
  label, children, align = 'end',
}) => (
  <div className={`cpm-hist-row cpm-hist-row--${align}`}>
    <span className="cpm-hist-row__label">{label}</span>
    <div className="cpm-hist-row__body">{children}</div>
  </div>
);

export const RangeToolbar: React.FC<RangeToolbarProps> = ({
  scope, loops, loopId, loop, loopsInScope, onLoopChange,
  from, to, preset, onPreset, onStep, onNow, onApplyCustom,
  signals, onToggleSignal, overlays, overlayKey, onOverlay,
  seriesPath, trendHref, onOpenTrend, exportDisabled, onExport,
}) => {
  const [draftFrom, setDraftFrom] = React.useState(() => toLocalInput(from));
  const [draftTo, setDraftTo] = React.useState(() => toLocalInput(to));
  const [rangeError, setRangeError] = React.useState<string | null>(null);

  // Drafts follow the APPLIED range when it changes underneath them — a preset,
  // Back/Forward or an episode deep link all move the chart via the URL, and
  // inputs still showing the previous range describe a different window than
  // what is plotted. Keyed on the instants, not the Date identities.
  React.useEffect(() => {
    setDraftFrom(toLocalInput(from));
    setDraftTo(toLocalInput(to));
    setRangeError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  const custom = preset === 'custom';

  return (
    <div className="cpm-hist-toolbar">
      <Row label="Scope">
        <PlantScopeFilter
          scope={scope}
          summary={loops.length ? `${loopsInScope} of ${loops.length} loops` : null}
        />
      </Row>

      <Row label="Loop" align="start">
        <LoopPicker scope={scope} loops={loops} value={loopId} onChange={onLoopChange} />
        <div className="cpm-hist-row__end">
          {/* Exporting the diagnosis windows with zero windows produced a file
              containing only its header row. */}
          <ObcButton variant="normal" disabled={exportDisabled} onClick={() => onExport('json')}>
            Export JSON
          </ObcButton>
          <ObcButton variant="normal" disabled={exportDisabled} onClick={() => onExport('csv')}>
            Export CSV
          </ObcButton>
        </div>
      </Row>

      <Row label="Range">
        {/* A segmented group, not five loose buttons — same component and same
            empty-first-emit guard as the Performance window toggle. */}
        <ObcToggleButtonGroup
          value={preset}
          aria-label="Range preset"
          onValue={(e: CustomEvent<{ value: string }>) => {
            if (PRESET_KEYS.includes(e.detail.value)) onPreset(e.detail.value);
          }}
        >
          {RANGE_PRESETS.map(p => (
            <ObcToggleButtonOption key={p.key} value={p.key}>{p.label}</ObcToggleButtonOption>
          ))}
          <ObcToggleButtonOption value="custom">Custom</ObcToggleButtonOption>
        </ObcToggleButtonGroup>

        <div className="cpm-hist-stepper">
          <ObcButton variant="flat" onClick={() => onStep(-1)}>‹</ObcButton>
          <span className="cpm-hist-stepper__text">{fmtRange(from, to)}</span>
          <ObcButton variant="flat" onClick={() => onStep(1)}>›</ObcButton>
        </div>
        <ObcButton variant="normal" onClick={onNow}>Now</ObcButton>

        {custom && (
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
            {/* Presets apply on click; only the custom pair defers, because a
                half-typed date pair is not a range worth fetching. */}
            <ObcButton variant="raised"
              onClick={() => setRangeError(onApplyCustom(draftFrom, draftTo))}>
              Apply
            </ObcButton>
          </div>
        )}
        {rangeError && <span className="cpm-field__error" role="alert">{rangeError}</span>}
      </Row>

      <Row label="View">
        <div className="cpm-pen-chips" role="group" aria-label="Signals">
          {/* Chart truth is the HISTORIAN, not the registry — so VP is offered
              even when the registry has no VP mapping, but the mismatch is named
              on the chip rather than hidden. */}
          {SIGNAL_KEYS.map(k => {
            const on = signals.includes(k);
            const unmapped = k === 'vp' && loop != null && !loop.tags['VP'];
            return (
              <button
                key={k}
                type="button"
                className={`cpm-pen-chip${on ? ' cpm-pen-chip--on' : ''}`}
                data-pen={k}
                aria-pressed={on}
                onClick={() => onToggleSignal(k)}
              >
                <span className="cpm-pen-chip__swatch" aria-hidden />
                <span className="cpm-pen-chip__label">{k.toUpperCase()}</span>
                <span className="cpm-sr-only">
                  {SIGNAL_MEANING[k]}{unmapped ? ', not mapped in the registry' : ''}
                </span>
                {unmapped && <span className="cpm-pen-chip__note">unmapped</span>}
              </button>
            );
          })}
        </div>

        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label">KPI overlay</span>
          <select className="cpm-select" value={overlayKey}
            onChange={e => onOverlay(e.target.value)}>
            {overlays.map(k => (
              <option key={k.key} value={k.key}>{k.label} · {k.resolution}</option>
            ))}
          </select>
        </label>

        <div className="cpm-hist-row__end">
          {trendHref && (
            <ObcButton variant="normal" onClick={() => onOpenTrend(trendHref)}>
              Open in Trend ›
            </ObcButton>
          )}
        </div>
      </Row>

      <p className="cpm-hist-note cpm-hist-toolbar__foot">
        historian series at {seriesPath ?? '—'} · PV keeps its min–max envelope
      </p>
    </div>
  );
};

export default RangeToolbar;
