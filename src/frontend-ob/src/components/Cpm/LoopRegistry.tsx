'use client';

/**
 * Loop Registry (CHG-147): search, page, the retired switch and the limit filter stay in the URL so Back returns to the same
 * list; retired loops are hidden unless asked for. CHG-168 (owner review): the header is the eyebrow and the title, top right How
 * to read, Bulk import and Add loop; one filter row inside the list card: search first, ONE dropdown (Show retired and the three
 * configuration-limit counts), Export CSV; the shared pager, centred.
 *
 * CHG-201 (owner-approved mockup docs/theme/redesign/samples/loop-detail-proposal.html, 15 Nov 2026): the list is the whole page.
 * The side panel went; a row opens the loop's own page, /cpm/registry/:loopId (registry/detail/LoopDetailPage), with the list's
 * address kept so "‹ All loops" returns here. An old ?loop= link lands on that page. The plant names are read once (the cached
 * whole-tree read, usePlantLocations); readiness is computed from each loop record (readinessRules), never read per row.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { useCpmLoops, useFleetSummary } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useCpmScope, loopMatchesQuery } from './plantScope';
import { usePlantLocations } from './plantLocation';
import { Pagination } from '../../ui/forms/Pagination';
import { downloadTextFile } from '../../utils/csv';
import AddLoopWizard from './AddLoopWizard';
import BulkImportDialog from './BulkImportDialog';
import ReasonedButton from './ReasonedButton';
import RegistryFilters from './registry/RegistryFilters';
import RegistryList from './registry/RegistryList';
import RegistryHowToRead from './registry/RegistryHowToRead';
import { placeOf } from './registry/loopFacts';
import { loopPageHref } from './registry/registryUrl';
import { inView, setView, viewCounts, viewOf, type RegistryView } from './registry/registryView';
import { exportFileName, registryCsv } from './registry/registryExport';

const PAGE_SIZE = 25;
const NEEDS_MANAGE = 'Needs the cpm.manage permission';

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const oldLoop = params.get('loop');
  const search = params.get('search') ?? '';
  const view = viewOf(params);
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const locations = usePlantLocations().data;
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params);
  const scoped = useMemo(() => loops.filter(l => scope.matches(l)), [loops, scope]);
  const counts = useMemo(() => viewCounts(scoped, summary.data), [scoped, summary.data]);
  // The search also finds a loop by its unit's name as the list shows it (the slug was all it matched).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byUnitName = (l: (typeof scoped)[number]) => !!q && (placeOf(locations, l).unit ?? '').toLowerCase().includes(q);
    return scoped.filter(l => (loopMatchesQuery(l, search) || byUnitName(l)) && inView(l, view));
  }, [scoped, search, view, locations]);

  // A new Site, Area or Unit starts the list at page 1 (not on first render, so Back keeps its page).
  const scopeKey = `${scope.site}|${scope.area}|${scope.unit}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    setParams(p => { p.delete('page'); return p; }, { replace: true });
  }, [scopeKey, setParams]);

  // An old link names a loop with ?loop=: it lands on that loop's page, the rest of its address kept.
  if (oldLoop) return <Navigate to={loopPageHref(oldLoop, params)} replace />;

  // Search, page and the dropdown live in the URL; any change but the page starts at page 1.
  const edit = (change: (p: URLSearchParams) => void, keepPage = false) => setParams(p => {
    change(p);
    if (!keepPage) p.delete('page');
    return p;
  }, { replace: true });
  const onSearch = (v: string) => edit(p => { if (v) p.set('search', v); else p.delete('search'); });
  const onView = (v: RegistryView) => edit(p => setView(p, v));
  const showAll = () => edit(p => { p.delete('search'); setView(p, 'current'); });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get('page')) || 1), pageCount);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goPage = (n: number) => edit(p => { if (n > 1) p.set('page', String(n)); else p.delete('page'); }, true);
  const hrefFor = (id: string) => loopPageHref(id, params);

  const narrowed = !!search || view !== 'current';
  return (
    <div className="cpm-screen cpm-registry">
      <WorkspaceHeader page="/cpm/registry" title="Loop Registry" copy=""
        actions={<>
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
          <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setImportOpen(true)}>Bulk import</ReasonedButton>
          <ReasonedButton variant="raised" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setWizardOpen(true)}>Add loop</ReasonedButton>
        </>} />
      <section className="cpm-surface cpm-reg-card" aria-label="Loops">
        <RegistryFilters search={search} onSearch={onSearch} view={view} onView={onView} counts={counts}
          limitsError={summary.isError && !summary.data ? { retry: () => void summary.refetch() } : null}
          onExport={() => downloadTextFile(exportFileName(), registryCsv(filtered))} />
        {isLoading && <EmptyState title="Loading registry…" />}
        {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
        {!isLoading && !isError && loops.length === 0 && (
          <EmptyState title="No loops registered" copy="Onboard the first loop to start producing diagnoses."
            action={canManage ? { label: 'Add loop', onClick: () => setWizardOpen(true) } : undefined} />
        )}
        {loops.length > 0 && filtered.length === 0 && (
          <EmptyState title={search ? `No loop matches “${search}”` : 'No loop matches this filter and plant scope'}
            action={narrowed ? { label: 'Show all loops', onClick: showAll } : undefined} />
        )}
        {rows.length > 0 && <RegistryList rows={rows} locations={locations} hrefFor={hrefFor} onOpen={id => navigate(hrefFor(id))} />}
        {pageCount > 1 && (
          <div className="cpm-events-pager">
            <Pagination page={page} pageCount={pageCount} onChange={goPage} label="Loop pages" />
          </div>
        )}
      </section>

      <RegistryHowToRead open={guide} onClose={() => setGuide(false)} summary={summary.data} />
      {wizardOpen && <AddLoopWizard existing={loops} onClose={() => setWizardOpen(false)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

export default LoopRegistry;
