/**
 * CHG-219 (owner-approved design docs/next-release/gate-configuration-per-loop-design.md): the third Gate Configuration view,
 * per-loop settings apart from the plant-wide ones. One row per active loop of the header scope with its operating region,
 * where that region comes from, and the open batch's state for it. "Edit regions" turns Region min / max into inputs; Save sends
 * the changed rows as one batch, which opens in the panel above the table (approve, deploy). After a plant-wide change, the loops
 * whose own settings sit on the previous plant-wide settings are offered new versions.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { Pagination } from '../../../ui/forms/Pagination';
import { serviceName } from '../loopName';
import type { BatchRow, LoopRegion } from '../../../api/cpm/configRegions';
import { batchMoving, useBatch, useRegionActions, useRegions, useStaleLoops } from './useConfigRegions';
import { RegionBatchPanel, BatchRowState } from './RegionBatchPanel';
import { SOURCE_WORD, approveAction, changedRows, deployAction, draftOf, numberText, outsideRange, parseDraft, rangeText, type RegionDraft } from './regionEdit';

const PAGE = 20;

export interface PerLoopSettingsProps {
  /** The site the table reads; undefined while the header scope spans several sites. */
  site: string | undefined;
  /** The header's area / unit filter, applied to the rows. */
  inScope: (loopId: string) => boolean;
  perms: { draft: boolean; approve: boolean; activate: boolean };
  viewer: { username?: string | null; role?: string | null } | null;
  batchId: string | undefined;
  onBatch: (batchId: string | null) => void;
}

const message = (e: unknown) => (e instanceof Error ? e.message : e ? String(e) : null);
/** loopId -> the server's reason, for the rows of an answer it left out. */
const errorsOf = (rows: BatchRow[]) => Object.fromEntries(rows.filter(r => r.error).map(r => [r.loopId, r.error!]));
const matches = (l: LoopRegion, q: string) => !q || l.loopId.toLowerCase().includes(q) || (l.displayName ?? '').toLowerCase().includes(q) || (l.loopType ?? '').toLowerCase().includes(q);

export const PerLoopSettings: React.FC<PerLoopSettingsProps> = ({ site, inScope, perms, viewer, batchId, onBatch }) => {
  const regions = useRegions(site);
  const stale = useStaleLoops(site);
  const batch = useBatch(batchId, site);
  const actions = useRegionActions(site);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RegionDraft>>({});
  const [note, setNote] = useState('');
  const [notSaved, setNotSaved] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [restackErrors, setRestackErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [query, site]);
  useEffect(() => { setRowErrors({}); }, [batchId]);
  // a deployment that finishes changes the regions and their source: read them again once nothing moves any more
  const moving = batchMoving(batch.data);
  const wasMoving = useRef(false);
  useEffect(() => {
    if (wasMoving.current && !moving) { void regions.refetch(); void stale.refetch(); }
    wasMoving.current = moving;
  }, [moving]); // eslint-disable-line react-hooks/exhaustive-deps

  const loops = useMemo(() => (regions.data?.loops ?? []).filter(l => inScope(l.loopId)), [regions.data, inScope]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => loops.filter(l => matches(l, q)).sort((a, b) => a.loopId.localeCompare(b.loopId)), [loops, q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const { changes, errors } = useMemo(() => changedRows(loops, drafts), [loops, drafts]);
  const pending = useMemo(() => new Map<string, BatchRow>((batch.data?.rows ?? []).map(r => [r.loopId, r])), [batch.data]);

  if (!site) return <EmptyState title="Pick a site" copy="Per-loop settings are kept per site. Choose one in the plant selector." />;

  const startEdit = () => { setDrafts(Object.fromEntries(loops.map(l => [l.loopId, draftOf(l)]))); setNotSaved({}); setEditing(true); };
  const cancel = () => { setEditing(false); setDrafts({}); setNote(''); };
  const setCell = (loopId: string, key: keyof RegionDraft, value: string) => setDrafts(d => ({ ...d, [loopId]: { ...(d[loopId] ?? { min: '', max: '' }), [key]: value } }));
  const save = () => actions.save.mutate({ regions: changes, note: note.trim() }, {
    onSuccess: r => {
      setNotSaved(Object.fromEntries(r.rows.filter(x => x.error).map(x => [x.loopId, x.error!])));
      setEditing(false); setDrafts({}); setNote('');
      if (r.drafts !== 0) onBatch(r.batchId);
    },
  });
  const restack = () => actions.restack.mutate({ note: 'New versions on the current plant-wide settings' }, {
    onSuccess: r => {
      setRestackErrors(r.rows.filter(x => x.error).map(x => `${x.loopId}: ${x.error}`));
      if (r.drafts !== 0) { onBatch(r.batchId); setRowErrors(errorsOf(r.rows)); }
    },
  });
  const blocked = Object.keys(errors).length > 0;
  const staleCount = stale.data?.count ?? 0;

  return (
    <>
      {staleCount > 0 && (
        <section className="cpm-surface cpm-region-stale" role="status">
          <p className="cpm-copy">{staleCount} {staleCount === 1 ? 'loop has its' : 'loops have their'} own settings on the previous plant-wide settings.</p>
          <ReasonedButton variant="raised" disabled={!perms.draft || actions.restack.isPending} reason={perms.draft ? null : 'Your account cannot prepare drafts'} onClick={restack}>
            {actions.restack.isPending ? 'Preparing…' : 'Prepare their new versions'}
          </ReasonedButton>
          {actions.restack.isError && <p className="cpm-field__error" role="alert">{message(actions.restack.error)}</p>}
          {restackErrors.map(e => <p key={e} className="cpm-field__error">{e}</p>)}
        </section>
      )}
      {batchId && (
        <RegionBatchPanel batch={batch.data} loading={batch.isLoading} error={batch.isError ? batch.error : null} onRetry={() => void batch.refetch()}
          approve={approveAction(batch.data, viewer, perms.approve)} deploy={deployAction(batch.data, perms.activate)}
          approving={actions.approve.isPending} deploying={actions.deploy.isPending}
          actionError={message(actions.approve.error) ?? message(actions.deploy.error)} rowErrors={rowErrors}
          onApprove={n => actions.approve.mutate({ batchId, note: n }, { onSuccess: r => setRowErrors(errorsOf(r.rows)) })}
          onDeploy={() => actions.deploy.mutate(batchId, { onSuccess: r => setRowErrors(errorsOf(r.rows)) })}
          onClose={() => { actions.approve.reset(); actions.deploy.reset(); onBatch(null); }} />
      )}
      <section className="cpm-surface cpm-config-list cpm-config-list--foot" aria-label="Per-loop settings">
        <div className="cpm-compact cpm-config-filters" role="group" aria-label="Per-loop settings tools">
          <input type="search" className="cpm-input" aria-label="Find a loop" placeholder="Loop, service or type" value={query} onChange={e => setQuery(e.target.value)} />
          {!editing && (
            <ReasonedButton disabled={!perms.draft || loops.length === 0} reason={perms.draft ? null : 'Your account cannot prepare drafts'} onClick={startEdit}>Edit regions</ReasonedButton>
          )}
          {editing && <>
            <input className="cpm-input cpm-region-note" aria-label="Change note" placeholder="Change note" value={note} onChange={e => setNote(e.target.value)} />
            <ReasonedButton variant="raised" disabled={changes.length === 0 || blocked || actions.save.isPending} onClick={save}>
              {actions.save.isPending ? 'Saving…' : `Save ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`}
            </ReasonedButton>
            <ObcButton variant="flat" onClick={cancel}>Cancel</ObcButton>
          </>}
        </div>
        {actions.save.isError && <p className="cpm-field__error" role="alert">{message(actions.save.error)}</p>}
        {regions.isLoading && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the loops…</span></div>}
        {regions.isError && <QueryError title="Per-loop settings unavailable" error={regions.error} retry={() => void regions.refetch()} />}
        <table className="cpm-table cpm-config-rows cpm-region-rows">
          <thead><tr><th>Loop</th><th>Type</th><th>PV range</th><th>Region min</th><th>Region max</th><th>Source</th><th>Pending</th></tr></thead>
          <tbody>
            {rows.map(l => {
              const d = drafts[l.loopId];
              const p = d ? parseDraft(d) : { pvMin: l.regionMin, pvMax: l.regionMax };
              const problem = errors[l.loopId] ?? notSaved[l.loopId];
              const outside = !problem && outsideRange(l, p.pvMin, p.pvMax);
              const row = pending.get(l.loopId);
              return (
                <tr key={l.loopId} data-invalid={problem ? 'true' : undefined}>
                  <td><strong>{l.loopId}</strong><div className="cpm-event-row__sub">{serviceName({ loopId: l.loopId, displayName: l.displayName })}</div></td>
                  <td>{l.loopType ?? ''}</td>
                  <td className="cpm-num">{rangeText(l.pvRangeMin, l.pvRangeMax)}</td>
                  {(['min', 'max'] as const).map(k => (
                    <td key={k} className="cpm-num">
                      {editing && d
                        ? <input className="cpm-input cpm-region-cell" inputMode="decimal" aria-label={`${l.loopId} region ${k}`} value={d[k]} onChange={e => setCell(l.loopId, k, e.target.value)} />
                        : numberText(k === 'min' ? l.regionMin : l.regionMax)}
                    </td>
                  ))}
                  <td>{SOURCE_WORD[l.source] ?? l.source}</td>
                  <td>
                    {row ? <BatchRowState row={row} /> : !problem && '—'}
                    {problem && <div className="cpm-field__error">{problem}</div>}
                    {outside && <div className="cpm-event-row__sub">Outside the PV range</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!regions.isLoading && !regions.isError && filtered.length === 0 && (
          q ? <EmptyState title={`No loop matches “${query.trim()}”`} action={{ label: 'Show all loops', onClick: () => setQuery('') }} />
            : <EmptyState title="No loops in this scope" />
        )}
        {pageCount > 1 && <div className="cpm-events-pager"><Pagination page={current} pageCount={pageCount} onChange={setPage} label="Loop pages" /></div>}
      </section>
    </>
  );
};

export default PerLoopSettings;
