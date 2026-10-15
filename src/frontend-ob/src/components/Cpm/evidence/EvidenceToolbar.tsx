/**
 * v2.5 workbench (audit F6): the toolbar every CPM page has - the plant scope filter and the loop
 * search - then the window kind (fused verdicts / short features / long diagnostics, the Window
 * Inspector's optgroups) and the evaluated window newest-first with its state and age. Older
 * windows page in on request; a date can be jumped to. Native selects, as on every other page.
 */
import React, { useId, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { LoopCombobox } from '../LoopCombobox';
import { PlantScopeFilter, type CpmScope } from '../plantScope';
import type { WindowOption, WindowTier } from './useEvidenceWindows';

export interface WindowKindOption { kind: string; tier: WindowTier; label: string }

export interface EvidenceToolbarProps {
  scope: CpmScope;
  loops: CpmLoop[];
  loopId: string | undefined;
  kind: string;
  kinds: WindowKindOption[];
  windows: WindowOption[];
  windowsLoading: boolean;
  windowsError: unknown;
  onRetryWindows: () => void;
  currentMethodRunId: string | undefined;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  onLoop: (loopId: string) => void;
  onClearLoop: () => void;
  onKind: (kind: string) => void;
  onWindow: (w: WindowOption) => void;
  onJump: (beforeIso: string) => void;
}

const TIER_LABEL: Record<WindowTier, string> = { fused: 'Fused verdicts', short: 'Short features (G0–G4)', long: 'Long diagnostics (G5–G11)' };

export const EvidenceToolbar: React.FC<EvidenceToolbarProps> = (p) => {
  const ids = useId();
  const [jump, setJump] = useState('');
  const inScope = p.loops.filter(l => p.scope.matches(l)).length;
  const current = p.windows.find(w => Object.values(w.methodRunIds).includes(p.currentMethodRunId ?? ''));
  const placeholder = !p.loopId ? 'Pick a loop first'
    : p.windowsLoading ? 'Loading the evaluated windows…'
    : p.windowsError ? 'The windows could not be listed - retry'
    : p.windows.length === 0 ? `No ${p.kind} windows for this loop yet`
    : null;
  return (
    <section className="cpm-surface cpm-evidence-toolbar">
      <PlantScopeFilter scope={p.scope} summary={`${inScope} of ${p.loops.length} loop(s) in scope`} />
      <div className="cpm-toolbar">
        <LoopCombobox scope={p.scope} loops={p.loops} value={p.loopId ?? ''} onChange={p.onLoop} onClear={p.onClearLoop} />
        <label className="cpm-field cpm-field--compact">
          <span className="cpm-field__label" id={`${ids}-kind`}>Window</span>
          <select className="cpm-select" aria-labelledby={`${ids}-kind`} value={p.kind} onChange={e => p.onKind(e.target.value)}>
            {(['fused', 'short', 'long'] as WindowTier[]).map(tier => {
              const items = p.kinds.filter(k => k.tier === tier);
              return items.length ? (
                <optgroup key={tier} label={TIER_LABEL[tier]}>
                  {items.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <label className="cpm-field cpm-evidence-toolbar__window">
          <span className="cpm-field__label" id={`${ids}-window`}>Evaluated window</span>
          <select className="cpm-select" aria-labelledby={`${ids}-window`} value={current?.windowEnd ?? ''} disabled={!!placeholder}
            onChange={e => { const w = p.windows.find(x => x.windowEnd === e.target.value); if (w) p.onWindow(w); }}>
            {placeholder ? <option value="">{placeholder}</option> : null}
            {!placeholder && !current && <option value="">Choose a window…</option>}
            {p.windows.map(w => <option key={w.windowEnd} value={w.windowEnd} disabled={!w.hasRunIds}>{w.label}</option>)}
          </select>
        </label>
        {p.windowsError ? <ObcButton variant="flat" onClick={p.onRetryWindows}>Retry</ObcButton> : null}
        {p.loopId && p.hasMore && (
          <ObcButton variant="flat" disabled={p.loadingMore} onClick={p.onLoadMore}>{p.loadingMore ? 'Loading older…' : 'Load older windows'}</ObcButton>
        )}
        {p.loopId && (
          <div className="cpm-evidence-toolbar__jump">
            <label className="cpm-field cpm-field--compact">
              <span className="cpm-field__label" id={`${ids}-jump`}>Jump to date</span>
              <input className="cpm-input" type="datetime-local" aria-labelledby={`${ids}-jump`} value={jump} onChange={e => setJump(e.target.value)} />
            </label>
            {/* CHG-098 (SME review 2 #29): a disabled Go says why on hover */}
            <span title={!jump ? 'Pick a date and time first' : undefined}>
              <ObcButton variant="flat" disabled={!jump} onClick={() => { if (jump) p.onJump(new Date(jump).toISOString()); }}>Go</ObcButton>
            </span>
          </div>
        )}
      </div>
    </section>
  );
};
