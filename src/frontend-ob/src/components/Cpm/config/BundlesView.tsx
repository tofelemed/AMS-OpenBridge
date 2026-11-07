/**
 * 2026-09-18 Gate Configuration redesign: the loop's three levels - LOOP (this loop only), PROFILE (every
 * loop of its class pack without a LOOP bundle), SITE (every loop without a more specific bundle) - each
 * with its versions newest first and their lifecycle state, the active one marked, and a New draft /
 * New version per level (permission cpm.config.draft). Choosing a version opens the editor. The rows are
 * summary reads (no bundle content).
 * Task 25: a callout, the Draft - Review - Publish strip and one Prepare bundle draft dialog replace the per-level draft boxes;
 * what each level covers is behind the ?.
 */
import React, { useState } from 'react';
import { PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
import { Toggletip } from '../../../ui/Toggletip';
import { ReasonedButton } from '../ReasonedButton';
import { DraftBundleDialog } from './DraftBundleDialog';
import type { BundleSummary, ScopeKind } from '../../../api/cpm/config';
import { bundleStateTone, shortHash } from './configSupport';

export interface LevelData { ref: string; bundles: BundleSummary[]; loading: boolean; error: unknown; retry?: () => void }
export type Levels = Record<'LOOP' | 'PROFILE' | 'SITE', LevelData>;

const LEVEL_COPY: Record<keyof Levels, string> = {
  LOOP: 'Overrides the profile for this loop only.',
  PROFILE: 'Every loop of this class pack that has no LOOP bundle.',
  SITE: 'Every loop of the site without a PROFILE or LOOP bundle.',
};

export interface BundlesViewProps {
  levels: Levels;
  activeBundleId: string | undefined;
  canDraft: boolean;
  creating: boolean;
  createError: unknown;
  onOpen: (bundleId: string) => void;
  onCreate: (args: { scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; note?: string }) => void;
  /** Called when the draft dialog opens: the parent clears the last draft's failure, so it does not come back on reopen. */
  onDraftOpen?: () => void;
}

export const BundlesView: React.FC<BundlesViewProps> = ({ levels, activeBundleId, canDraft, creating, createError, onOpen, onCreate, onDraftOpen }) => {
  const [drafting, setDrafting] = useState(false);
  return (
    <section className="cpm-surface">
      <PanelHead title="Bundles"
        help={(
          <Toggletip variant="how-to" label="The three levels">
            <p>The most specific active level wins.</p>
            {(['LOOP', 'PROFILE', 'SITE'] as const).map(k => <p key={k}><strong>{k}</strong> {LEVEL_COPY[k]}</p>)}
          </Toggletip>
        )}
        right={(
          <ReasonedButton variant="raised" disabled={!canDraft || creating} reason={!canDraft ? 'Drafting a bundle needs cpm.config.draft.' : null} onClick={() => { onDraftOpen?.(); setDrafting(true); }}>
            Prepare bundle draft
          </ReasonedButton>
        )} />
      <p className="cpm-copy cpm-config-callout">Nothing changes for a loop until a bundle is published.</p>
      <ol className="cpm-config-steps" aria-label="Bundle steps">
        {['Draft', 'Review', 'Publish'].map(step => <li key={step} className="cpm-config-step">{step}</li>)}
      </ol>
      <ol className="cpm-config-levels" aria-label="Levels">
        {(['LOOP', 'PROFILE', 'SITE'] as const).map(kind => {
          const level = levels[kind];
          const versions = [...level.bundles].sort((a, b) => b.version - a.version);
          return (
            <li key={kind} className="cpm-config-level" data-level={kind}>
              <div className="cpm-config-level__head">
                <span className="cpm-config-level__kind">{kind}</span>
                <span className="cpm-mono cpm-config-level__ref">{level.ref}</span>
              </div>
              {level.error != null && <QueryError title="Versions unavailable" error={level.error} retry={level.retry} />}
              {level.loading && level.bundles.length === 0 && <p className="cpm-copy" aria-busy="true">Loading versions…</p>}
              {!level.loading && level.error == null && versions.length === 0 && <p className="cpm-copy">no bundle at this level - the layer below applies</p>}
              {versions.length > 0 && (
                <div className="cpm-config-level__versions">
                  {versions.map(v => (
                    <button key={v.bundleId} type="button" className={`cpm-config-bundle${v.bundleId === activeBundleId ? ' cpm-config-bundle--selected' : ''}`}
                      aria-current={v.bundleId === activeBundleId ? 'true' : undefined} onClick={() => onOpen(v.bundleId)}>
                      <span className="cpm-mono">v{v.version} · {shortHash(v.contentHash, 8)}</span>
                      <TonePill tone={bundleStateTone(v.state)}>{v.state}</TonePill>
                      <span className="cpm-event-row__sub">{v.changeClass} · {fmtDateTime(v.updatedAt)} · {v.createdBy}{v.validationErrors ? ` · ${v.validationErrors} validation error${v.validationErrors === 1 ? '' : 's'}` : ''}{v.note ? ` · ${v.note}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {createError != null && !drafting && <p className="cpm-field__error" role="alert">{createError instanceof Error ? createError.message : String(createError)}</p>}
      {drafting && <DraftBundleDialog levels={levels} creating={creating} error={createError} onClose={() => setDrafting(false)} onCreate={onCreate} />}
    </section>
  );
};
