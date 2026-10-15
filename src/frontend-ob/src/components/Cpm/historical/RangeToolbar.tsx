'use client';

/**
 * Historical explorer toolbar — four labelled rows, narrowing left to right and
 * top to bottom: SCOPE (where) → LOOP (which) → RANGE (when) → VIEW (what to draw).
 *
 * It was one flex-wrap bucket holding ten controls, and the loop picker of the
 * day was three stacked elements where its neighbours were one — so sharing a
 * row with the scope selects left a hole beside them and pushed Export onto its
 * own line: four ragged visual lines from one declared row. Each question now
 * owns a row with its own baseline, and the scope selects sit at the top where
 * the narrowing starts.
 *
 * Colour here is functional, not decoration: the signal chips carry the SAME
 * --ams-pen-* token as the line each one draws, so the toggle and the pen are
 * self-evidently the same thing. Everything else stays neutral, because on a
 * diagnostic screen colour that means nothing competes with colour that does.
 */
import React from 'react';
import type { HistoryExportKind } from './useHistoryExports';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { PlantScopeFilter, type CpmScope } from '../plantScope';
import LoopCombobox from '../LoopCombobox';
import { RANGE_PRESETS } from './timeRange';
import TimeRangeBar from '../trend/TimeRangeBar';

const SIGNAL_KEYS = ['pv', 'sp', 'op', 'vp'] as const;
export type SignalKey = typeof SIGNAL_KEYS[number];
export { SIGNAL_KEYS };

/** Role → what the pen means, for the chip's accessible name. */
const SIGNAL_MEANING: Record<SignalKey, string> = {
  pv: 'Process variable', sp: 'Setpoint', op: 'Controller output', vp: 'Valve position',
};


export interface RangeToolbarProps {
  scope: CpmScope;
  loops: CpmLoop[];
  loopId: string;
  loop: CpmLoop | undefined;
  loopsInScope: number;
  onLoopChange: (id: string) => void;
  onLoopClear: () => void;

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
  /** CHG-097 (SME review 2 #17): one labelled download per content; `busy` names the one being prepared. */
  onExport: (kind: HistoryExportKind) => void;
  exportBusy?: HistoryExportKind | null;
  /** The selected window's end (for the evidence package label); null = no evaluated window selected. */
  packageWindow?: string | null;
  /** v2.5 (2E.2, R14): explicit Normalise toggle - one "fraction of own span" axis instead of EU + pp axes. */
  normalize: boolean;
  onToggleNormalize: () => void;
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
  scope, loops, loopId, loop, loopsInScope, onLoopChange, onLoopClear,
  from, to, preset, onPreset, onStep, onNow, onApplyCustom,
  signals, onToggleSignal, overlays, overlayKey, onOverlay,
  seriesPath, trendHref, onOpenTrend, exportDisabled, onExport, exportBusy, packageWindow, normalize, onToggleNormalize,
}) => {
  const busyText = (k: HistoryExportKind, label: string) => (exportBusy === k ? 'Preparing…' : label);
  // CHG-098 (SME review 2 #29): every disabled export says why — on hover (a wrapping span: ObcButton takes no title)
  // and in one visible line under the buttons.
  const busyWhy = exportBusy ? 'Another download is being prepared — wait for it to finish' : undefined;
  const samplesWhy = !loopId ? 'Pick a loop first' : busyWhy;
  const windowsWhy = exportDisabled ? 'No evaluated windows in this range — widen the range to export them' : busyWhy;
  const packageWhy = !packageWindow ? 'Select an evaluated window on the verdict lane first' : busyWhy;
  const exportNote = !loopId ? 'Pick a loop to export its data.'
    : exportDisabled ? 'No evaluated windows in this range: widen the range to export windows or a package.'
      : !packageWindow ? 'Click a verdict band to export that window’s evidence package.'
        : null;

  return (
    <div className="cpm-hist-toolbar">
      <Row label="Scope">
        <PlantScopeFilter
          scope={scope}
          summary={loops.length ? `${loopsInScope} of ${loops.length} loops` : null}
        />
      </Row>

      <Row label="Loop" align="start">
        <LoopCombobox scope={scope} loops={loops} value={loopId}
          onChange={onLoopChange} onClear={onLoopClear} />
        <div className="cpm-hist-row__end">
          {/* CHG-097 (SME review 2 #17): the old "Export CSV" held evaluated windows, not signals — each download now
              says what it contains. Exporting windows with zero windows produced a file with only its header row. */}
          <span title={samplesWhy ?? "PV, SP, OP, VP and mode from the historian over the range, at the loop's sample period, with units and both clocks"}>
            <ObcButton variant="normal" disabled={!loopId || !!exportBusy} onClick={() => onExport('samples')}>
              {busyText('samples', 'Signal samples (CSV)')}
            </ObcButton>
          </span>
          <span title={windowsWhy ?? 'The evaluated (fused) windows and their diagnoses over the range'}>
            <ObcButton variant="normal" disabled={exportDisabled || !!exportBusy} onClick={() => onExport('windows-csv')}>
              Evaluated windows (CSV)
            </ObcButton>
          </span>
          <span title={windowsWhy ?? 'The same windows with every gate, as JSON'}>
            <ObcButton variant="flat" disabled={exportDisabled || !!exportBusy} onClick={() => onExport('windows-json')}>
              Windows (JSON)
            </ObcButton>
          </span>
          <span title={packageWhy ?? `The window ending ${packageWindow}: verdict, every gate, its metrics, the evidence manifests and the signal samples over that window`}>
            <ObcButton variant="normal" disabled={!packageWindow || !!exportBusy} onClick={() => onExport('package')}>
              {busyText('package', 'Evidence package (selected window)')}
            </ObcButton>
          </span>
          {exportNote && <span className="cpm-hist-note" role="note">{exportNote}</span>}
        </div>
      </Row>

      <Row label="Range">
        {/* CHG-048: the shared period control (also on the Loop Explorer trend). */}
        <TimeRangeBar from={from} to={to} presets={RANGE_PRESETS} preset={preset}
          onPreset={onPreset} onStep={onStep} onNow={onNow} onApplyCustom={onApplyCustom} />
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
          {/* v2.5 (2E.2, R14): PV/SP live on the EU axis and OP/VP on a percentage-point axis; Normalise
              is an explicit choice that names its conversion, never a silent shared axis. */}
          <button
            type="button"
            className={`cpm-pen-chip${normalize ? ' cpm-pen-chip--on' : ''}`}
            data-pen="normalize"
            aria-pressed={normalize}
            onClick={onToggleNormalize}
            title="Show every signal as a fraction of its own observed span (the tooltip keeps the original values and units)"
          >
            <span className="cpm-pen-chip__label">{normalize ? 'Normalised (÷ own span)' : 'Normalise'}</span>
          </button>
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
