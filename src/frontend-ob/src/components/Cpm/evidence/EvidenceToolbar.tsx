/**
 * The Evidence controls in the loop band (CHG-130). The evaluated window is one dropdown, newest first with its state and age;
 * the window kind (fused verdicts, short features, long diagnostics), older windows and a date to jump to sit under More, with
 * whatever else the page adds there. Native selects, as on every other page.
 */
import React, { useId, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { fromSiteInput } from '../../../cpa/siteTime';
import { Popover } from '../../../ui/Popover';
import type { WindowOption, WindowTier } from './useEvidenceWindows';

export interface WindowKindOption { kind: string; tier: WindowTier; label: string }

export interface EvidenceWindowProps {
  loopId: string | undefined;
  kind: string;
  windows: WindowOption[];
  windowsLoading: boolean;
  windowsError: unknown;
  currentMethodRunId: string | undefined;
  /** The open run's window, for a run the list does not hold (an evaluated window, or one older than the loaded page). */
  runWindow?: string | null;
  onWindow: (w: WindowOption) => void;
}

export interface EvidenceMoreProps {
  loopId: string | undefined;
  kind: string;
  /** Left out where the page chooses the kind itself. */
  kinds?: WindowKindOption[];
  windowsError: unknown;
  onRetryWindows: () => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  onKind?: (kind: string) => void;
  onJump?: (beforeIso: string) => void;
  /** More actions on this window: Newest, Reconstruct, evaluate a window. */
  children?: React.ReactNode;
}

const TIER_LABEL: Record<WindowTier, string> = { fused: 'Fused verdicts', short: 'Short features (G0–G4)', long: 'Long diagnostics (G5–G11)' };

export const EvidenceWindowSelect: React.FC<EvidenceWindowProps> = (p) => {
  const current = p.windows.find(w => Object.values(w.methodRunIds).includes(p.currentMethodRunId ?? ''));
  const placeholder = !p.loopId ? 'Pick a loop first'
    : p.windowsLoading ? 'Loading the evaluated windows…'
    : p.windowsError ? 'The windows could not be listed - retry'
    : p.windows.length === 0 ? `No ${p.kind} windows for this loop yet`
    : null;
  return (
    <select className="cpm-select cpm-evidence-toolbar__window" aria-label="Evaluated window" value={current?.windowEnd ?? ''}
      disabled={!!placeholder && !p.runWindow}
      onChange={e => { const w = p.windows.find(x => x.windowEnd === e.target.value); if (w) p.onWindow(w); }}>
      {!current && <option value="">{p.runWindow ?? placeholder ?? 'Choose a window…'}</option>}
      {p.windows.map(w => <option key={w.windowEnd} value={w.windowEnd} disabled={!w.hasRunIds}>{w.label}</option>)}
    </select>
  );
};

export const EvidenceMore: React.FC<EvidenceMoreProps> = (p) => {
  const ids = useId();
  const [jump, setJump] = useState('');
  return (
    <Popover
      label="More window options"
      align="end"
      trigger={t => (
        <button type="button" className="ui-control ui-control--ghost" {...t}>
          More <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>
        </button>
      )}
    >
      <div className="cpm-evidence-more">
        {p.kinds && (
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label" id={`${ids}-kind`}>Window</span>
            <select className="cpm-select" aria-labelledby={`${ids}-kind`} value={p.kind} onChange={e => p.onKind?.(e.target.value)}>
              {(['fused', 'short', 'long'] as WindowTier[]).map(tier => {
                const items = p.kinds?.filter(k => k.tier === tier) ?? [];
                return items.length ? (
                  <optgroup key={tier} label={TIER_LABEL[tier]}>
                    {items.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
        )}
        {p.windowsError ? <ObcButton variant="flat" onClick={p.onRetryWindows}>Retry</ObcButton> : null}
        {p.loopId && p.hasMore && (
          <ObcButton variant="flat" disabled={p.loadingMore} onClick={p.onLoadMore}>{p.loadingMore ? 'Loading older…' : 'Load older windows'}</ObcButton>
        )}
        {p.loopId && p.onJump && (
          <div className="cpm-evidence-toolbar__jump">
            <label className="cpm-field cpm-field--compact">
              <span className="cpm-field__label" id={`${ids}-jump`}>Jump to date</span>
              <input className="cpm-input" type="datetime-local" aria-labelledby={`${ids}-jump`} value={jump} onChange={e => setJump(e.target.value)} />
            </label>
            {/* CHG-098 (SME review 2 #29): a disabled Go says why on hover */}
            <span title={!jump ? 'Pick a date and time first' : undefined}>
              <ObcButton variant="flat" disabled={!jump} onClick={() => { if (jump) p.onJump?.(new Date(fromSiteInput(jump)).toISOString()); }}>Go</ObcButton>
            </span>
          </div>
        )}
        {p.children}
      </div>
    </Popover>
  );
};
