/**
 * Task 25: Prepare bundle draft. Pick the level (LOOP, PROFILE or SITE) and an optional note, with the level's own reference:
 * a SITE draft has none. The request is built by `draftRequest`, so the dialog writes exactly what the old buttons wrote.
 * CHG-169 (owner review, answer 2b): a draft starts from the level's ACTIVE version when it has one, else from its newest by
 * number (before, always the newest: a FIC10302 LOOP draft started from v7, rolled back, instead of v6, active). The server
 * copies the layers of the `parentBundleId` it is given, so the choice is the request's. Each level says the version it
 * starts from ("Starts from"); the callout moved here from the Bundles list; a disabled Create draft says why.
 * CHG-192 (owner review item 16): "Nothing changes for a loop until a bundle is activated." moved behind the Level ?.
 * CHG-220 (Gate Configuration check, gap 3): a level's FIRST version starts from the plant-wide bundle the loop runs under
 * now - LOOP: the active PROFILE, else the active SITE bundle; PROFILE: the active SITE bundle - as the per-loop re-stack does
 * (LoopSettingsService). Before, it started from the factory layers and activating it dropped the plant-wide changes. The
 * server keeps the parent's layers and adds the draft's own empty layer. Only with no active bundle above: the factory layers.
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

const ABOVE: Record<keyof Levels, (keyof Levels)[]> = { LOOP: ['PROFILE', 'SITE'], PROFILE: ['SITE'], SITE: [] };
const newestFirst = (level: LevelData) => [...level.bundles].sort((a, b) => b.version - a.version);
const activeOf = (level: LevelData) => newestFirst(level).find(v => v.state === 'ACTIVE_VERIFIED') ?? null;

export type Start = { kind: keyof Levels; bundle: BundleSummary };

/**
 * The version a draft of this level starts from: its active one, else its newest by number; for a first version, the active
 * bundle of the nearest level above; null when there is none (the factory layers).
 */
export function startsFrom(kind: keyof Levels, levels: Levels): Start | null {
  const own = levels[kind];
  const mine = activeOf(own) ?? newestFirst(own)[0];
  if (mine) return { kind, bundle: mine };
  for (const up of ABOVE[kind]) {
    const active = activeOf(levels[up]);
    if (active) return { kind: up, bundle: active };
  }
  return null;
}

export function draftRequest(kind: keyof Levels, levels: Levels, note: string): DraftRequest {
  const level = levels[kind];
  return { scopeKind: kind, scopeRef: kind === 'SITE' ? null : level.ref, parentBundleId: startsFrom(kind, levels)?.bundle.bundleId ?? null, note: note.trim() || undefined };
}

/** Why one level cannot be read yet, or null. */
function unread(kind: keyof Levels, level: LevelData): string | null {
  if (level.loading && level.bundles.length === 0) return `Loading the ${kind} versions…`;
  if (level.error != null) return `The ${kind} versions could not be read, so a draft cannot start from the right one.`;
  if (kind !== 'SITE' && level.ref === '…') return `The ${kind} reference is not known yet.`;   // the loop's profile is not read yet
  return null;
}

/** Why Create draft is disabled for this level, or null. A first version also waits for the levels above it. */
function blockedBy(kind: keyof Levels, levels: Levels): string | null {
  const own = unread(kind, levels[kind]);
  if (own != null || levels[kind].bundles.length > 0) return own;
  for (const up of ABOVE[kind]) {
    const reason = unread(up, levels[up]);
    if (reason != null) return reason;
    if (activeOf(levels[up])) return null;
  }
  return null;
}

const refLabel = (kind: keyof Levels, ref: string) => (kind === 'PROFILE' && ref !== '…' ? codeLabel(ref) : ref);

const StartCell: React.FC<{ kind: keyof Levels; levels: Levels }> = ({ kind, levels }) => {
  const level = levels[kind];
  if (level.loading && level.bundles.length === 0) return <>…</>;
  if (level.error != null) return <>—</>;
  const start = startsFrom(kind, levels);
  if (!start && blockedBy(kind, levels) != null) return <>…</>;   // a first version: the levels above are not read yet
  if (!start) return <>First version at this level</>;
  const w = bundleStateWord(start.bundle.state);
  return (
    <span className="cpm-config-inline">
      <span>{start.kind === kind ? '' : `${start.kind} `}v{start.bundle.version}</span>
      <TonePill tone={w.tone} glyph={w.glyph}>{w.label}</TonePill>
    </span>
  );
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
  const reason = blockedBy(kind, levels);
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
      <section className="cpm-config-part" aria-label="Level">
        <div className="cpm-title-row">
          <h3 className="cpm-howto__title">Level</h3>
          <Toggletip variant="how-to" label="The three levels">
            {KINDS.map(k => <p key={k}><strong>{k}</strong> {LEVEL_COPY[k]}</p>)}
            <p>Nothing changes for a loop until a bundle is activated.</p>
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
                <td><StartCell kind={k} levels={levels} /></td>
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
