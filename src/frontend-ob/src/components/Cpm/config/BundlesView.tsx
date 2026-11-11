/**
 * Bundles: which versions exist, and which one runs. 2026-09-18: a loop's three levels - LOOP (this loop only), PROFILE (every
 * loop of its class pack without a LOOP bundle), SITE (every loop without a more specific bundle) - with their versions newest
 * first, the active one marked. The rows are summary reads (no bundle content).
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): one list grouped
 * LOOP / PROFILE / SITE (Version with its note, By, Updated, State in words) beside the selected version's panel (a drawer below
 * 1280 px); a row selects, the panel's "Open v6 →" opens. Prepare bundle draft sits at the list's head (cpm.config.draft); the
 * callout moved into its dialog and the Draft → Review → Publish strip went (the bundle's tabs are the sequence). With no loop
 * the list holds the bundles in progress of the scope (what "Bundles in progress" listed on the overview).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { QueryError } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { codeLabel } from '../vocabulary';
import { stamp, zoneTag } from '../events/eventTime';
import { DraftBundleDialog } from './DraftBundleDialog';
import { BundleVersionPanel } from './BundleVersionPanel';
import { BundleStatePill } from './configBits';
import type { BundleSummary, ScopeKind } from '../../../api/cpm/config';

export interface LevelData { ref: string; bundles: BundleSummary[]; loading: boolean; error: unknown; retry?: () => void }
export type Levels = Record<'LOOP' | 'PROFILE' | 'SITE', LevelData>;
export interface ProgressData { bundles: BundleSummary[]; loading: boolean; error: unknown; retry: () => void }

const KINDS = ['LOOP', 'PROFILE', 'SITE'] as const;
const SETTLED = new Set(['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK']);
const newestFirst = (list: BundleSummary[]) => [...list].sort((a, b) => b.version - a.version);

export interface BundlesViewProps {
  /** A loop's three levels; without them, `progress` lists the bundles in progress of the scope. */
  levels?: Levels;
  progress?: ProgressData;
  activeBundleId: string | undefined;
  canDraft: boolean;
  creating: boolean;
  createError: unknown;
  onOpen: (bundleId: string) => void;
  onCreate: (args: { scopeKind: ScopeKind; scopeRef: string | null; parentBundleId: string | null; note?: string }) => void;
  /** Called when the draft dialog opens: the parent clears the last draft's failure, so it does not come back on reopen. */
  onDraftOpen?: () => void;
}

const Row: React.FC<{ b: BundleSummary; selected: boolean; onSelect: () => void; cells: React.ReactNode }> = ({ b, selected, onSelect, cells }) => (
  <tr className={`cpm-reg-row${selected ? ' cpm-reg-row--selected' : ''}`} aria-current={selected ? 'true' : undefined} onClick={onSelect} data-bundle={b.bundleId}>
    {cells}
  </tr>
);

const pick = (label: string, onSelect: () => void) => (
  <button type="button" className="cpm-config-rowbtn" onClick={e => { e.stopPropagation(); onSelect(); }}>{label}</button>
);

export const BundlesView: React.FC<BundlesViewProps> = ({ levels, progress, activeBundleId, canDraft, creating, createError, onOpen, onCreate, onDraftOpen }) => {
  const [drafting, setDrafting] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const inProgress = useMemo(() => (progress?.bundles ?? []).filter(b => !SETTLED.has(b.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [progress?.bundles]);
  const all = useMemo(() => (levels ? KINDS.flatMap(k => newestFirst(levels[k].bundles)) : inProgress), [levels, inProgress]);
  const selected = all.find(b => b.bundleId === chosen) ?? all.find(b => b.bundleId === activeBundleId) ?? all[0];
  useEffect(() => { if (chosen && !all.some(b => b.bundleId === chosen)) setChosen(null); }, [all, chosen]);
  const select = (id: string) => { setChosen(id); setDrawer(true); };
  const zone = zoneTag();

  return (
    <>
    <div className="cpm-master-detail">
      <section className="cpm-surface cpm-config-list" aria-label="Bundles">
        <div className="cpm-config-list__head">
          {levels ? (
            <ReasonedButton variant="raised" disabled={!canDraft || creating} reason={!canDraft ? 'Drafting a bundle needs cpm.config.draft.' : null} onClick={() => { onDraftOpen?.(); setDrafting(true); }}>
              Prepare bundle draft
            </ReasonedButton>
          ) : <span className="cpm-copy">Bundles in progress</span>}
        </div>
        <table className="cpm-table cpm-config-rows">
          <thead>
            {levels
              ? <tr><th>Version</th><th>By</th><th>Updated · {zone}</th><th>State</th></tr>
              : <tr><th>Scope</th><th>Version</th><th>State</th><th>Updated · {zone}</th><th>By</th></tr>}
          </thead>
          {levels && KINDS.map(kind => {
            const level = levels[kind];
            const versions = newestFirst(level.bundles);
            return (
              <tbody key={kind} aria-label={kind} data-level={kind}>
                <tr className="cpm-config-group"><th colSpan={4} scope="colgroup">{kind}{kind !== 'LOOP' && <span className="cpm-config-group__ref"> · {kind === 'PROFILE' ? codeLabel(level.ref) : level.ref}</span>}</th></tr>
                {level.error != null && <tr><td colSpan={4}><QueryError title="Versions unavailable" error={level.error} retry={level.retry} /></td></tr>}
                {level.loading && level.bundles.length === 0 && <tr><td colSpan={4} className="cpm-copy" aria-busy="true">Loading versions…</td></tr>}
                {!level.loading && level.error == null && versions.length === 0 && <tr><td colSpan={4} className="cpm-copy">no bundle at this level - the layer below applies</td></tr>}
                {versions.map(v => (
                  <Row key={v.bundleId} b={v} selected={v.bundleId === selected?.bundleId} onSelect={() => select(v.bundleId)} cells={<>
                    <td>{pick(`v${v.version}`, () => select(v.bundleId))}{v.note && <div className="cpm-event-row__sub">{v.note}</div>}</td>
                    <td className="cpm-config-rows__by">{v.createdBy}</td>
                    <td>{stamp(v.updatedAt)}</td>
                    <td><BundleStatePill state={v.state} /></td>
                  </>} />
                ))}
              </tbody>
            );
          })}
          {!levels && (
            <tbody aria-label="Bundles in progress">
              {progress?.error != null && <tr><td colSpan={5}><QueryError title="Bundles unavailable" error={progress.error} retry={progress.retry} /></td></tr>}
              {progress?.loading && inProgress.length === 0 && <tr><td colSpan={5} className="cpm-copy" aria-busy="true">Loading the bundles…</td></tr>}
              {!progress?.loading && progress?.error == null && inProgress.length === 0 && <tr><td colSpan={5} className="cpm-copy">Nothing in progress in this scope.</td></tr>}
              {inProgress.map(v => (
                <Row key={v.bundleId} b={v} selected={v.bundleId === selected?.bundleId} onSelect={() => select(v.bundleId)} cells={<>
                  <td>{pick(`${v.scopeKind} ${v.scopeRef || v.site}`, () => select(v.bundleId))}{v.note && <div className="cpm-event-row__sub">{v.note}</div>}</td>
                  <td>v{v.version}</td>
                  <td><BundleStatePill state={v.state} /></td>
                  <td>{stamp(v.updatedAt)}</td>
                  <td className="cpm-config-rows__by">{v.createdBy}</td>
                </>} />
              ))}
            </tbody>
          )}
        </table>
      </section>
      {selected && <BundleVersionPanel bundle={selected} withScope={!levels} open={drawer} onClose={() => setDrawer(false)} onOpen={onOpen} />}
    </div>
      {createError != null && !drafting && <p className="cpm-field__error" role="alert">{createError instanceof Error ? createError.message : String(createError)}</p>}
      {drafting && levels && <DraftBundleDialog levels={levels} creating={creating} error={createError} onClose={() => setDrafting(false)} onCreate={onCreate} />}
    </>
  );
};

export default BundlesView;
