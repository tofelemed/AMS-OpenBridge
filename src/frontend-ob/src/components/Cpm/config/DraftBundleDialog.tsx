/**
 * Task 25: Prepare bundle draft. Pick the level (LOOP, PROFILE or SITE) and an optional note, with the level's own reference:
 * a SITE draft has none. The request is built by `draftRequest`, so the dialog writes exactly what the old buttons wrote.
 * CHG-169 (owner review, answer 2b): a draft starts from the level's ACTIVE version when it has one, else from its newest by
 * number (before, always the newest: a FIC10302 LOOP draft started from v7, rolled back, instead of v6, active). The server
 * copies the layers of the `parentBundleId` it is given, so the choice is the request's. Each level says the version it
 * starts from ("Starts from"); the callout moved here from the Bundles list; a disabled Create draft says why.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { Toggletip } from '../../../ui/Toggletip';
import { ReasonedButton } from '../ReasonedButton';
import { TonePill } from '../shared';
import { codeLabel } from '../vocabulary';
import type { BundleSummary, ScopeKind } from '../../../api/cpm/config';
import type { LevelData, Levels } from './BundlesView';
import { bundleStateWord } from './configWords';

export type DraftRequest = { scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; note?: string };
const KINDS = ['LOOP', 'PROFILE', 'SITE'] as const;

export const LEVEL_COPY: Record<keyof Levels, string> = {
  LOOP: 'Overrides the profile for this loop only.',
  PROFILE: 'Every loop of this class pack that has no LOOP bundle.',
  SITE: 'Every loop of the site without a PROFILE or LOOP bundle.',
};

/** The version a draft of this level starts from: its active one, else its newest by number; null for a first version. */
export function startsFrom(level: LevelData): BundleSummary | null {
  const newestFirst = [...level.bundles].sort((a, b) => b.version - a.version);
  return newestFirst.find(v => v.state === 'ACTIVE_VERIFIED') ?? newestFirst[0] ?? null;
}

export function draftRequest(kind: keyof Levels, levels: Levels, note: string): DraftRequest {
  const level = levels[kind];
  return { scopeKind: kind, scopeRef: kind === 'SITE' ? null : level.ref, parentBundleId: startsFrom(level)?.bundleId ?? null, note: note.trim() || undefined };
}

/** Why Create draft is disabled for this level, or null. */
function blockedBy(kind: keyof Levels, level: LevelData): string | null {
  if (level.loading && level.bundles.length === 0) return `Loading the ${kind} versions…`;
  if (level.error != null) return `The ${kind} versions could not be read, so a draft cannot start from the right one.`;
  if (kind !== 'SITE' && level.ref === '…') return `The ${kind} reference is not known yet.`;   // the loop's profile is not read yet
  return null;
}

const refLabel = (kind: keyof Levels, ref: string) => (kind === 'PROFILE' && ref !== '…' ? codeLabel(ref) : ref);

const StartCell: React.FC<{ level: LevelData }> = ({ level }) => {
  if (level.loading && level.bundles.length === 0) return <>…</>;
  if (level.error != null) return <>—</>;
  const start = startsFrom(level);
  if (!start) return <>First version at this level</>;
  const w = bundleStateWord(start.state);
  return <span className="cpm-config-inline"><span>v{start.version}</span><TonePill tone={w.tone} glyph={w.glyph}>{w.label}</TonePill></span>;
};

export const DraftBundleDialog: React.FC<{
  levels: Levels;
  creating: boolean;
  /** A failed draft: shown here, with the note still typed, until the draft succeeds. */
  error?: unknown;
  onClose: () => void;
  onCreate: (req: DraftRequest) => void;
}> = ({ levels, creating, error, onClose, onCreate }) => {
  const [kind, setKind] = useState<keyof Levels>('LOOP');
  const [note, setNote] = useState('');
  const reason = blockedBy(kind, levels[kind]);
  return (
    <Dialog open title="Prepare bundle draft" size="wide" onClose={onClose}
      footer={(
        <>
          <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
          <ReasonedButton variant="raised" disabled={creating || reason != null} reason={creating ? null : reason} onClick={() => onCreate(draftRequest(kind, levels, note))}>
            {creating ? 'Creating…' : 'Create draft'}
          </ReasonedButton>
        </>
      )}>
      <p className="cpm-copy">Nothing changes for a loop until a bundle is activated.</p>
      <section className="cpm-config-part" aria-label="Level">
        <div className="cpm-title-row">
          <h3 className="cpm-howto__title">Level</h3>
          <Toggletip variant="how-to" label="The three levels">
            {KINDS.map(k => <p key={k}><strong>{k}</strong> {LEVEL_COPY[k]}</p>)}
          </Toggletip>
        </div>
        <table className="cpm-table cpm-config-draft__levels">
          <thead><tr><th>Level</th><th><span className="cpm-visually-hidden">Reference</span></th><th>Starts from</th></tr></thead>
          <tbody>
            {KINDS.map(k => (
              <tr key={k}>
                <td>
                  <label className="cpm-config-draft__level">
                    <input type="radio" name="draft-level" value={k} checked={kind === k} onChange={() => setKind(k)} />
                    <strong>{k}</strong>
                  </label>
                </td>
                <td>{refLabel(k, levels[k].ref)}</td>
                <td><StartCell level={levels[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="cpm-config-part" aria-label="Note">
        <h3 className="cpm-howto__title">Note</h3>
        <input className="cpm-input cpm-config-draft__note" value={note} onChange={e => setNote(e.target.value)} placeholder="Draft note" aria-label="Draft note" />
      </section>
      {error != null && <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p>}
    </Dialog>
  );
};

export default DraftBundleDialog;
