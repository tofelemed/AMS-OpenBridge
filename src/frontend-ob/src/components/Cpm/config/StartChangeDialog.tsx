/**
 * Change settings (Gate Configuration journey, task 7): Apply to (this loop / every loop of its type / the whole plant, each with its
 * loop count), a required Reason, Cancel / Start. Start creates the draft from the version running at the chosen level
 * (`draftRequest`, see startChange.ts) and opens its change page, keeping the header's plant scope. A plant page has no choice: only the Reason.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { codeLabel } from '../vocabulary';
import { useBundleSummaries, useConfigActions } from './useConfig';
import { changePath, scoped } from './configRoutes';
import { errorText } from './lifecycle';
import { draftRequest } from './startChange';
import type { LevelData, Levels } from './startChange';

export interface StartChangeDialogProps {
  open: boolean;
  site: string;
  loopId?: string;
  profileId?: string;
  /** Loops of the loop's type, and of the whole plant (from the effective summary); undefined while it loads. */
  counts: { type: number | undefined; plant: number | undefined };
  onClose: () => void;
}

type Kind = keyof Levels;
const loopsWord = (n: number | undefined) => (n === undefined ? '…' : `${n} ${n === 1 ? 'loop' : 'loops'}`);

/** One level's bundles as the start rule reads them: the summaries of that level only. */
function useLevel(site: string, kind: Kind, ref: string | undefined, enabled: boolean): LevelData {
  const q = useBundleSummaries(site, kind, kind === 'SITE' ? undefined : ref, enabled);
  const bundles = useMemo(() => (q.data?.bundles ?? []).filter(b => b.scopeKind === kind && (kind === 'SITE' || (b.scopeRef ?? null) === ref)), [q.data, kind, ref]);
  return { ref: kind === 'SITE' ? site : ref ?? '…', bundles, loading: enabled && q.isLoading, error: q.isError ? q.error : null };
}

export const StartChangeDialog: React.FC<StartChangeDialogProps> = ({ open, site, loopId, profileId, counts, onClose }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { create } = useConfigActions(site);
  const kinds: Kind[] = loopId ? (profileId ? ['LOOP', 'PROFILE', 'SITE'] : ['LOOP', 'SITE']) : profileId ? ['PROFILE', 'SITE'] : ['SITE'];
  const [picked, setPicked] = useState<Kind | null>(null);
  const [reason, setReason] = useState('');
  const kind = picked && kinds.includes(picked) ? picked : kinds[0];
  const loop = useLevel(site, 'LOOP', loopId, !!loopId);
  const profile = useLevel(site, 'PROFILE', profileId, !!profileId);
  const plant = useLevel(site, 'SITE', undefined, true);
  const levels: Levels = { LOOP: loop, PROFILE: profile, SITE: plant };
  // a loop whose type is not known yet cannot start: a first LOOP version starts from the type's version
  const reading = (!!loopId && !profileId) || [loop, profile, plant].some(l => l.loading || l.error != null);
  const typeWord = profileId ? codeLabel(profileId).toLowerCase() : '';
  const label: Record<Kind, { text: string; count: number | undefined }> = {
    LOOP: { text: 'This loop only', count: 1 },
    PROFILE: { text: `Every ${typeWord} loop`, count: counts.type },
    SITE: { text: 'The whole plant', count: counts.plant },
  };
  const reasonText = reason.trim();
  const start = () => create.mutate({ site, ...draftRequest(kind, levels, reasonText) }, { onSuccess: made => navigate(scoped(changePath(made.bundleId, 'edit'), params)) });

  return (
    <Dialog open={open} title="Change settings" onClose={onClose}
      footer={(
        <>
          <ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>
          <ObcButton variant="raised" disabled={!reasonText || reading || create.isPending} onClick={start}>Start</ObcButton>
        </>
      )}>
      {kinds.length > 1 && (
        <div className="cpm-field" role="radiogroup" aria-label="Apply to">
          <span className="cpm-howto__title">Apply to</span>
          {kinds.map(k => (
            <label key={k} className="cpm-config-draft__level">
              <input type="radio" name="start-change-scope" value={k} checked={kind === k} onChange={() => setPicked(k)} />
              <strong>{label[k].text}</strong>
              <span>{loopsWord(label[k].count)}</span>
            </label>
          ))}
        </div>
      )}
      <label className="cpm-field">
        <span className="cpm-howto__title">Reason</span>
        <textarea className="cpm-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
      </label>
      {create.isError && <p className="cpm-field__error" role="alert">{errorText(create.error)}</p>}
    </Dialog>
  );
};

export default StartChangeDialog;
