'use client';

/**
 * Loop Registry (CHG-147): Loop, Loop type and VP; search, page, the retired switch and the limit filter stay in the URL so
 * Back returns to the same list; retired loops are hidden unless asked for.
 *
 * CHG-168 (owner review, the approved sample docs/theme/redesign/samples/loop-registry-proposal.html and the owner's answers of
 * 11 Nov 2026): the header is the eyebrow and the title, no ?; top right How to read (a dialog in three titled parts: State, VP,
 * Readiness, holding what the two ? said), Bulk import and Add loop. One filter row inside the list card: search first, ONE
 * dropdown that merged Show retired and the three configuration-limit counts, Export CSV; the shared 32 px pager, centred.
 * The loop opens in a panel beside the list (a drawer below 1280 px) instead of replacing it; `?loop=` still names it. With no
 * loop in the address the panel says "Choose a loop" and nothing is read for a loop until a row is picked (owner answer 2).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, WorkspaceHeader } from './shared';
import { useCpmLoops, useFleetSummary } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useCpmScope, loopMatchesQuery } from './plantScope';
import { registryHref } from './cpaHref';
import { Inspector } from '../../ui/Inspector';
import { Pagination } from '../../ui/forms/Pagination';
import { downloadTextFile } from '../../utils/csv';
import LoopPanel from './registry/LoopPanel';
import AddLoopWizard from './AddLoopWizard';
import BulkImportDialog from './BulkImportDialog';
import ReasonedButton from './ReasonedButton';
import RegistryFilters from './registry/RegistryFilters';
import RegistryList from './registry/RegistryList';
import RegistryHowToRead from './registry/RegistryHowToRead';
import { inView, setView, viewCounts, viewOf, type RegistryView } from './registry/registryView';
import { exportFileName, registryCsv } from './registry/registryExport';

const PAGE_SIZE = 25;
const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const noop = () => undefined;

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('loop') ?? '';
  const search = params.get('search') ?? '';
  const view = viewOf(params);
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params);
  const scoped = useMemo(() => loops.filter(l => scope.matches(l)), [loops, scope]);
  const counts = useMemo(() => viewCounts(scoped, summary.data), [scoped, summary.data]);
  const filtered = useMemo(() => scoped.filter(l => loopMatchesQuery(l, search) && inView(l, view)), [scoped, search, view]);

  // A new Site, Area or Unit starts the list at page 1 (not on first render, so Back keeps its page).
  const scopeKey = `${scope.site}|${scope.area}|${scope.unit}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    setParams(p => { p.delete('page'); return p; }, { replace: true });
  }, [scopeKey, setParams]);

  // Search, page, the dropdown and the loop live in the URL; any change but the page and the loop starts at page 1.
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
  const hrefFor = (id: string) => { const q = new URLSearchParams(params); q.set('loop', id); return `${registryHref()}?${q}`; };

  // A loop named from outside the list (a link, the search palette, Back) opens the list at the page that holds it, once per
  // loop named; a row picked on the page leaves the page as it is.
  const placed = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !selectedId || placed.current === selectedId) return;
    placed.current = selectedId;
    const same = (l: { loopId: string }) => l.loopId.toLowerCase() === selectedId.toLowerCase();
    if (rows.some(same)) return;
    const at = filtered.findIndex(same);
    if (at >= 0) goPage(Math.floor(at / PAGE_SIZE) + 1);
  });

  // Below 1280 px the panel is a drawer: a row or a link that names a loop opens it, once per loop named (Close stays closed).
  const [drawer, setDrawer] = useState(() => params.has('loop'));
  const seen = useRef(selectedId);
  useEffect(() => {
    if (selectedId && selectedId !== seen.current) { seen.current = selectedId; setDrawer(true); }
  }, [selectedId]);
  const openLoop = (id: string) => { navigate(hrefFor(id)); setDrawer(true); };

  const narrowed = !!search || view !== 'current';
  return (
    <div className="cpm-screen cpm-registry">
      <WorkspaceHeader page="/cpm/registry" title="Loop Registry" copy=""
        actions={<>
          <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>
          <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setImportOpen(true)}>Bulk import</ReasonedButton>
          <ReasonedButton variant="raised" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setWizardOpen(true)}>Add loop</ReasonedButton>
        </>} />
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-reg-list" aria-label="Loops">
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
          {rows.length > 0 && <RegistryList rows={rows} selectedId={selectedId} hrefFor={hrefFor} onOpen={openLoop} />}
          {pageCount > 1 && (
            <div className="cpm-events-pager">
              <Pagination page={page} pageCount={pageCount} onChange={goPage} label="Loop pages" />
            </div>
          )}
        </section>
        {selectedId
          ? <LoopPanel loopId={selectedId} open={drawer} onClose={() => setDrawer(false)} />
          : <Inspector title="Choose a loop" open={false} onClose={noop}>{null}</Inspector>}
      </div>

      <RegistryHowToRead open={guide} onClose={() => setGuide(false)} summary={summary.data} />
      {wizardOpen && <AddLoopWizard existing={loops} onClose={() => setWizardOpen(false)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

export default LoopRegistry;
