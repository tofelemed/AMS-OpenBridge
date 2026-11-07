/**
 * Task 25: Prepare bundle draft. Pick the level (LOOP, PROFILE or SITE) and an optional note. The draft starts from the newest
 * version of THAT level (the same rule the per-level buttons used), with the level's own reference: a SITE draft has none.
 * The request is built by `draftRequest`, so the dialog writes exactly what the old buttons wrote.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { ScopeKind } from '../../../api/cpm/config';
import type { Levels } from './BundlesView';

export type DraftRequest = { scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; note?: string };
const KINDS = ['LOOP', 'PROFILE', 'SITE'] as const;

export function draftRequest(kind: keyof Levels, levels: Levels, note: string): DraftRequest {
  const level = levels[kind];
  const newest = [...level.bundles].sort((a, b) => b.version - a.version)[0];
  return { scopeKind: kind, scopeRef: kind === 'SITE' ? null : level.ref, parentBundleId: newest?.bundleId ?? null, note: note.trim() || undefined };
}

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
  const level = levels[kind];
  const waiting = level.loading && level.bundles.length === 0;
  const unreadable = level.error != null;
  const noRef = kind !== 'SITE' && level.ref === '…';   // the loop's profile or site is not known yet
  return (
    <Dialog open title="Prepare bundle draft" onClose={onClose}
      footer={(
        <>
          <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={creating || waiting || unreadable || noRef} onClick={() => onCreate(draftRequest(kind, levels, note))}>
            {creating ? 'Creating…' : 'Create draft'}
          </ObcButton>
        </>
      )}>
      <fieldset className="cpm-config-draft__levels">
        <legend className="cpm-visually-hidden">Level</legend>
        {KINDS.map(k => (
          <label key={k} className="cpm-config-draft__level">
            <input type="radio" name="draft-level" value={k} checked={kind === k} onChange={() => setKind(k)} />
            <span className="cpm-config-level__kind">{k}</span>
            <span className="cpm-mono">{levels[k].ref}</span>
          </label>
        ))}
      </fieldset>
      {waiting && <p className="cpm-copy" aria-busy="true">Loading the {kind} versions…</p>}
      {unreadable && <p className="cpm-field__error" role="alert">The {kind} versions could not be read, so a draft cannot start from the right one.</p>}
      {error != null && <p className="cpm-field__error" role="alert">{error instanceof Error ? error.message : String(error)}</p>}
      <input className="cpm-input" value={note} onChange={e => setNote(e.target.value)} placeholder="draft note" aria-label="Draft note" />
    </Dialog>
  );
};

export default DraftBundleDialog;
