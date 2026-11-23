/**
 * Operating regions (Gate Configuration journey, task 9; /cpm/config/regions; approved look data-screen="regions"): one row per
 * loop of the plant - Loop, Type, PV range, Region, From. Selected rows open "Edit regions (n)" and, when every selected loop has
 * its own settings, "Use plant-wide settings (n)". A saved batch shows above the table (?batch=) with Approve and Deploy.
 * The old per-loop view's data flow is kept: useRegions / useBatch / useRegionActions, approveAction / deployAction.
 * Final review: the back link keeps the header's plant scope (I1); a missing permission is said once, under the primary (I3);
 * the plant-wide notice and its "Update them" are the start page's only (M-h).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import { useCpmScope } from '../plantScope';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useAuthStore } from '../../../store/authStore';
import { Pagination } from '../../../ui/forms/Pagination';
import type { BatchRow } from '../../../api/cpm/configRegions';
import { batchMoving, useBatch, useRegionActions, useRegions } from './useConfigRegions';
import { RegionBatchPanel } from './RegionBatchPanel';
import { SubPageHead } from './SubPageHead';
import { CONFIG_BASE, scoped } from './configRoutes';
import { NEEDS } from './lifecycle';
import { realName } from './loopNames';
import { EditRegionsDialog } from './EditRegionsDialog';
import { UsePlantWideDialog } from './UsePlantWideDialog';
import { approveAction, deployAction, fromWord, hasOwnSettings, rangeText } from './regionEdit';

const PAGE = 25;
const Back: React.FC = () => {
  const [params] = useSearchParams();
  return <div className="cpm-reg-detail-head"><Link className="cpm-reg-back" to={scoped(CONFIG_BASE, params)}><span aria-hidden>{'‹ '}</span>Gate Configuration</Link></div>;
};
const message = (e: unknown) => (e instanceof Error ? e.message : e ? String(e) : null);
/** loopId -> the server's reason, for the rows of an answer it left out. */
const errorsOf = (rows: BatchRow[]) => Object.fromEntries(rows.filter(r => r.error).map(r => [r.loopId, r.error!]));

const Regions: React.FC<{ site: string }> = ({ site }) => {
  const [params, setParams] = useSearchParams();
  const scope = useCpmScope();
  const loopsQ = useCpmLoops();
  const regions = useRegions(site);
  const qc = useQueryClient();
  const batchId = params.get('batch') ?? undefined;
  const batch = useBatch(batchId, site);
  const actions = useRegionActions(site);
  const perms = {
    draft: useAuthStore(s => s.hasPermission('cpm.config.draft')),
    approve: useAuthStore(s => s.hasPermission('cpm.config.approve')),
    activate: useAuthStore(s => s.hasPermission('cpm.config.activate')),
  };
  const viewer = useAuthStore(s => s.user);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'edit' | 'plant' | null>(null);
  const [page, setPage] = useState(1);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [notSaved, setNotSaved] = useState<Record<string, string>>({});

  const byId = useMemo(() => new Map((loopsQ.data?.loops ?? []).map(l => [l.loopId, l])), [loopsQ.data]);
  const inScope = useCallback((id: string) => { const l = byId.get(id); return l ? scope.matches(l) : !scope.params.area && !scope.params.unit; }, [byId, scope]);
  const loops = useMemo(() => (regions.data?.loops ?? []).filter(l => inScope(l.loopId)).sort((a, b) => a.loopId.localeCompare(b.loopId)), [regions.data, inScope]);
  const pageCount = Math.max(1, Math.ceil(loops.length / PAGE));
  const current = Math.min(page, pageCount);
  const rows = loops.slice((current - 1) * PAGE, current * PAGE);
  const chosen = useMemo(() => loops.filter(l => picked.has(l.loopId)), [loops, picked]);
  const allOwn = chosen.length > 0 && chosen.every(hasOwnSettings);

  // a deployment that finishes changes the regions and their source: read them again once nothing moves any more
  const moving = batchMoving(batch.data);
  const wasMoving = useRef(false);
  useEffect(() => {
    if (wasMoving.current && !moving) { void regions.refetch(); void qc.invalidateQueries({ queryKey: ['cpm', 'config', 'stale-loops'] }); }
    wasMoving.current = moving;
  }, [moving]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRowErrors({}); }, [batchId]);

  const showBatch = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('batch', id); else n.delete('batch'); return n; });
  const saved = (id: string, errs?: Record<string, string>) => { setDialog(null); setPicked(new Set()); setNotSaved(errs ?? {}); showBatch(id); };
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every(l => picked.has(l.loopId));
  const togglePage = () => setPicked(s => { const n = new Set(s); rows.forEach(l => (allOnPage ? n.delete(l.loopId) : n.add(l.loopId))); return n; });
  // the two buttons share one reason: it is said once, under Edit regions; the other keeps it on hover
  const needDraft = perms.draft ? null : NEEDS.draft;

  return (
    <div className="cpm-screen cpm-config-workspace">
      <SubPageHead backHref={scoped(CONFIG_BASE, params)} backLabel="Gate Configuration" title="Operating regions"
        actions={<>
          {allOwn && <ReasonedButton disabled={!perms.draft} title={needDraft ?? undefined} onClick={() => setDialog('plant')}>Use plant-wide settings ({chosen.length})</ReasonedButton>}
          <ReasonedButton variant="raised" disabled={!perms.draft || chosen.length === 0} reason={needDraft} onClick={() => setDialog('edit')}>Edit regions ({chosen.length})</ReasonedButton>
        </>} />
      {Object.keys(notSaved).length > 0 && (
        <section className="cpm-surface cpm-region-stale" role="alert" aria-label="Not saved">
          <div>
            <strong>Not saved</strong>
            <ul className="cpm-region-list">{Object.entries(notSaved).map(([id, why]) => <li key={id}><strong>{id}</strong> <span className="cpm-field__error">{why}</span></li>)}</ul>
          </div>
          <ObcButton variant="flat" onClick={() => setNotSaved({})}>Dismiss</ObcButton>
        </section>
      )}
      {batchId && (
        <RegionBatchPanel batch={batch.data} loading={batch.isLoading} error={batch.isError ? batch.error : null} onRetry={() => void batch.refetch()}
          approve={approveAction(batch.data, viewer, perms.approve)} deploy={deployAction(batch.data, perms.activate)}
          approving={actions.approve.isPending} deploying={actions.deploy.isPending}
          actionError={message(actions.approve.error) ?? message(actions.deploy.error)} rowErrors={rowErrors}
          onApprove={n => actions.approve.mutate({ batchId, note: n }, { onSuccess: r => setRowErrors(errorsOf(r.rows)) })}
          onDeploy={() => actions.deploy.mutate(batchId, { onSuccess: r => setRowErrors(errorsOf(r.rows)) })}
          onClose={() => { actions.approve.reset(); actions.deploy.reset(); showBatch(null); }} />
      )}
      <section className="cpm-surface cpm-config-list cpm-config-list--foot" aria-label="Operating regions">
        {regions.isLoading && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the loops…</span></div>}
        {regions.isError && <QueryError title="Operating regions unavailable" error={regions.error} retry={() => void regions.refetch()} />}
        <table className="cpm-table cpm-config-rows cpm-region-rows">
          <thead><tr>
            <th className="cpm-region-pick"><input type="checkbox" aria-label="Select all loops on this page" checked={allOnPage} onChange={togglePage} /></th>
            <th>Loop</th><th>Type</th><th>PV range</th><th>Region</th><th>From</th>
          </tr></thead>
          <tbody>
            {rows.map(l => {
              const name = realName(l);
              return (
                <tr key={l.loopId} aria-selected={picked.has(l.loopId)}>
                  <td><input type="checkbox" aria-label={`Select ${l.loopId}`} checked={picked.has(l.loopId)} onChange={() => toggle(l.loopId)} /></td>
                  <td><strong>{l.loopId}</strong>{name && <div className="cpm-event-row__sub">{name}</div>}</td>
                  <td>{l.loopType ?? ''}</td>
                  <td className="cpm-num">{rangeText(l.pvRangeMin, l.pvRangeMax)}</td>
                  <td className="cpm-num">{rangeText(l.regionMin, l.regionMax) || '—'}</td>
                  <td>{fromWord(l)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!regions.isLoading && !regions.isError && loops.length === 0 && <EmptyState title="No loops in this scope" />}
        {pageCount > 1 && <div className="cpm-events-pager"><Pagination page={current} pageCount={pageCount} onChange={setPage} label="Loop pages" /></div>}
      </section>
      <EditRegionsDialog open={dialog === 'edit'} site={site} loops={chosen} onClose={() => setDialog(null)} onSaved={saved} />
      <UsePlantWideDialog open={dialog === 'plant'} site={site} loopIds={chosen.map(l => l.loopId)} onClose={() => setDialog(null)} onDone={saved} />
    </div>
  );
};

export const ConfigRegionsPage: React.FC = () => {
  const scope = useCpmScope();
  const loopsQ = useCpmLoops();
  const sites = useMemo(() => [...new Set((loopsQ.data?.loops ?? []).map(l => l.site).filter(Boolean))], [loopsQ.data]);
  const site = scope.params.site || (sites.length === 1 ? sites[0] : '');
  if (loopsQ.isError && !site) return <div className="cpm-screen cpm-config-workspace"><Back /><QueryError error={loopsQ.error} retry={() => void loopsQ.refetch()} /></div>;
  if (!site) {
    return loopsQ.isLoading
      ? <div className="cpm-screen"><div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading…</span></div></div>
      : <div className="cpm-screen cpm-config-workspace"><Back /><EmptyState title="Choose a plant in the header" level={2} /></div>;
  }
  return <Regions key={site} site={site} />;
};

export default ConfigRegionsPage;
