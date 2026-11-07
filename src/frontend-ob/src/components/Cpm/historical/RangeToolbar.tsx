'use client';

/**
 * Historical: what to draw, above the chart, and the one Export menu. CHG-129: the plant scope lives in the header; the loop,
 * the range and Export live in the band, so the chart starts directly under this row.
 *
 * Colour here is functional, not decoration: the signal chips carry the SAME
 * --ams-pen-* token as the line each one draws, so the toggle and the pen are
 * self-evidently the same thing. Everything else stays neutral, because on a
 * diagnostic screen colour that means nothing competes with colour that does.
 */
import React from 'react';
import type { HistoryExportKind } from './useHistoryExports';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import type { CpmLoop } from '../../../api/cpmApi';
import { Popover } from '../../../ui/Popover';
import { inputContextOf } from '../optionalInputs';

const SIGNAL_KEYS = ['pv', 'sp', 'op', 'vp'] as const;
export type SignalKey = typeof SIGNAL_KEYS[number];
export { SIGNAL_KEYS };

/** Role → what the pen means, for the chip's accessible name. */
const SIGNAL_MEANING: Record<SignalKey, string> = {
  pv: 'Process variable', sp: 'Setpoint', op: 'Controller output', vp: 'Valve position',
};


export interface RangeToolbarProps {
  loop: CpmLoop | undefined;
  signals: string[];
  onToggleSignal: (key: string) => void;

  overlays: { key: string; label: string; resolution: string }[];
  overlayKey: string;
  onOverlay: (key: string) => void;

  trendHref: string | null;
  onOpenTrend: (href: string) => void;

  /** v2.5 (2E.2, R14): explicit Normalise toggle - one "fraction of own span" axis instead of EU + pp axes. */
  normalize: boolean;
  onToggleNormalize: () => void;
}

export interface ExportMenuProps {
  loopId: string;
  exportDisabled: boolean;
  /** CHG-097 (SME review 2 #17): one labelled download per content; `busy` names the one being prepared. */
  onExport: (kind: HistoryExportKind) => void;
  exportBusy?: HistoryExportKind | null;
  /** The selected window's end (for the evidence package label); null = no evaluated window selected. */
  packageWindow?: string | null;
  /** Why the selected window has no evidence package (a summary only); absent when none is selected or it has one. */
  packageUnavailable?: string | null;
}

/** CHG-129: the four downloads behind one button. Each keeps its reason when it cannot run. */
export const ExportMenu: React.FC<ExportMenuProps> = ({ loopId, exportDisabled, onExport, exportBusy, packageWindow, packageUnavailable }) => {
  const busyText = (k: HistoryExportKind, label: string) => (exportBusy === k ? 'Preparing…' : label);
  // CHG-098 (SME review 2 #29): every disabled export says why — on hover (a wrapping span: ObcButton takes no title)
  // and in one visible line under the buttons.
  const busyWhy = exportBusy ? 'Another download is being prepared — wait for it to finish' : undefined;
  const samplesWhy = !loopId ? 'Pick a loop first' : busyWhy;
  const windowsWhy = exportDisabled ? 'No evaluated windows in this range — widen the range to export them' : busyWhy;
  const packageWhy = !packageWindow ? (packageUnavailable ?? 'Choose an evaluated window first') : busyWhy;
  const exportNote = !loopId ? 'Pick a loop to export its data.'
    : exportDisabled ? 'No evaluated windows in this range: widen the range to export windows or a package.'
      : !packageWindow ? (packageUnavailable ?? 'Choose an evaluated window to export its evidence package.')
        : null;

  return (
    <Popover
      label="Export"
      align="end"
      trigger={t => (
        <button type="button" className="ui-control" {...t}>
          {exportBusy ? 'Preparing…' : 'Export'} <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>
        </button>
      )}
    >
      {close => (
        <div className="cpm-hist-export">
          {/* CHG-097 (SME review 2 #17): the old "Export CSV" held evaluated windows, not signals — each download now
              says what it contains. Exporting windows with zero windows produced a file with only its header row. */}
          <span title={samplesWhy ?? "PV, SP, OP, VP and mode from the historian over the range, at the loop's sample period, with units and both clocks"}>
            <ObcButton variant="normal" disabled={!loopId || !!exportBusy} onClick={() => { close(); onExport('samples'); }}>
              {busyText('samples', 'Signal samples (CSV)')}
            </ObcButton>
          </span>
          <span title={windowsWhy ?? 'The evaluated (fused) windows and their diagnoses over the range'}>
            <ObcButton variant="normal" disabled={exportDisabled || !!exportBusy} onClick={() => { close(); onExport('windows-csv'); }}>
              Evaluated windows (CSV)
            </ObcButton>
          </span>
          <span title={windowsWhy ?? 'The same windows with every gate, as JSON'}>
            <ObcButton variant="normal" disabled={exportDisabled || !!exportBusy} onClick={() => { close(); onExport('windows-json'); }}>
              Windows (JSON)
            </ObcButton>
          </span>
          <span title={packageWhy ?? `The window ending ${packageWindow}: verdict, every gate, its metrics, the evidence manifests and the signal samples over that window`}>
            <ObcButton variant="normal" disabled={!packageWindow || !!exportBusy} onClick={() => { close(); onExport('package'); }}>
              {busyText('package', 'Evidence package (selected window)')}
            </ObcButton>
          </span>
          {exportNote && <span className="cpm-hist-note" role="note">{exportNote}</span>}
        </div>
      )}
    </Popover>
  );
};

/** CHG-139: why VP may be absent on this loop. A tag not mapped is a gap to close; a loop with no valve position is a fact. */
export function vpChipNote(loop: CpmLoop | undefined): { text: string; meaning: string } | null {
  const ctx = inputContextOf(loop);
  if (!ctx) return null;
  if (ctx.vp === 'NOT_APPLICABLE') return { text: 'not applicable', meaning: 'not applicable on this loop' };
  if (ctx.vp === 'NOT_INSTALLED') return { text: 'not installed', meaning: 'not installed on this loop' };
  return ctx.vpMapped ? null : { text: 'unmapped', meaning: 'not mapped in the registry' };
}

export const RangeToolbar: React.FC<RangeToolbarProps> = ({
  loop, signals, onToggleSignal, overlays, overlayKey, onOverlay, trendHref, onOpenTrend, normalize, onToggleNormalize,
}) => (
  <div className="cpm-hist-toolbar">
    <div className="cpm-hist-view">
      <div className="cpm-pen-chips" role="group" aria-label="Signals">
        {/* Chart truth is the HISTORIAN, not the registry — so VP is offered
            even when the registry has no VP mapping, but the mismatch is named
            on the chip rather than hidden. */}
        {SIGNAL_KEYS.map(k => {
          const on = signals.includes(k);
          const note = k === 'vp' ? vpChipNote(loop) : null;
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
                {SIGNAL_MEANING[k]}{note ? `, ${note.meaning}` : ''}
              </span>
              {note && <span className="cpm-pen-chip__note">{note.text}</span>}
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
          <ObcButton variant="flat" onClick={() => onOpenTrend(trendHref)}>
            Open in Trend ↗
          </ObcButton>
        )}
      </div>
    </div>
  </div>
);

export default RangeToolbar;
