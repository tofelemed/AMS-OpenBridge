/**
 * 2026-09-18 Gate Configuration redesign: the loop's three levels - LOOP (this loop only), PROFILE (every
 * loop of its class pack without a LOOP bundle), SITE (every loop without a more specific bundle) - each
 * with its versions newest first and their lifecycle state, the active one marked, and a New draft /
 * New version per level (permission cpm.config.draft). Choosing a version opens the editor. The rows are
 * summary reads (no bundle content).
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
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
}

export const BundlesView: React.FC<BundlesViewProps> = ({ levels, activeBundleId, canDraft, creating, createError, onOpen, onCreate }) => {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Bundles" title="The three levels of this loop" right={<span className="cpm-copy">the most specific active level wins</span>} />
      <ol className="cpm-config-levels" aria-label="Levels">
        {(['LOOP', 'PROFILE', 'SITE'] as const).map(kind => {
          const level = levels[kind];
          const versions = [...level.bundles].sort((a, b) => b.version - a.version);
          const newest = versions[0];
          const note = notes[kind] ?? '';
          return (
            <li key={kind} className="cpm-config-level" data-level={kind}>
              <div className="cpm-config-level__head">
                <span className="cpm-config-level__kind">{kind}</span>
                <span className="cpm-mono cpm-config-level__ref">{level.ref}</span>
                <span className="cpm-event-row__sub">{LEVEL_COPY[kind]}</span>
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
              {canDraft ? (
                <div className="cpm-config-inline">
                  <input className="cpm-input" value={note} onChange={e => setNotes(n => ({ ...n, [kind]: e.target.value }))} placeholder="draft note" aria-label={`${kind} draft note`} />
                  <ObcButton variant={versions.length ? 'flat' : 'raised'} disabled={creating}
                    onClick={() => onCreate({ scopeKind: kind, scopeRef: kind === 'SITE' ? null : level.ref, parentBundleId: newest?.bundleId ?? null, note: note || undefined })}>
                    {creating ? 'Creating…' : versions.length ? 'New version' : 'New draft'}
                  </ObcButton>
                </div>
              ) : <p className="cpm-copy">Drafting a bundle needs cpm.config.draft.</p>}
            </li>
          );
        })}
      </ol>
      {createError != null && <p className="cpm-field__error" role="alert">{createError instanceof Error ? createError.message : String(createError)}</p>}
    </section>
  );
};
