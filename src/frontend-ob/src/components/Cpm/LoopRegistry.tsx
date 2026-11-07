'use client';

/**
 * Loop Registry list (CHG-147): Loop, Loop type and VP. A row opens the loop's page (`?loop=`); search,
 * page and the retired switch stay in the URL so Back returns to the same list. Retired loops are hidden
 * unless asked for.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader } from './shared';
import { useCpmLoops, useFleetSummary } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import { useCpmScope, loopMatchesQuery } from './plantScope';
import { registryHref } from './cpaHref';
import { serviceName } from './loopName';
import LoopDetail from './registry/LoopDetail';
import AddLoopWizard from './AddLoopWizard';
import BulkImportDialog from './BulkImportDialog';
import ReasonedButton from './ReasonedButton';
import ReadinessStrip from './overview/ReadinessStrip';
import { vpCellLabel } from './optionalInputs';
import { abnormalPill, GAP_LABEL, hasGap, parseGap, type RegistryGap } from './registryGap';

const PAGE_SIZE = 25;
const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const HELP = 'A loop is only as good as its signal mappings. The readiness report after save lists exactly what is degraded: without a VP tag mapped, G14 cannot confirm a final-element fault, and missing peer links leaves G13 unevaluated.';

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('loop') ?? '';
  const search = params.get('search') ?? '';
  const showRetired = params.get('retired') === '1';
  const gap = parseGap(params.get('gap'));
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const scope = useCpmScope();
  const summary = useFleetSummary(scope.params);
  const inScope = useMemo(() => loops.filter(l => scope.matches(l) && loopMatchesQuery(l, search)), [loops, search, scope]);
  const degraded = useMemo(() => loops.filter(l => scope.matches(l) && hasGap(l, 'degraded')).length, [loops, scope]);
  const retiredHidden = showRetired || gap ? 0 : inScope.filter(l => !l.isActive).length;
  const filtered = useMemo(
    () => inScope.filter(l => gap ? hasGap(l, gap) : showRetired || l.isActive),
    [inScope, gap, showRetired]);

  // A new Site, Area or Unit starts the list at page 1 (not on first render, so Back keeps its page).
  const scopeKey = `${scope.site}|${scope.area}|${scope.unit}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    setParams(p => { p.delete('page'); return p; }, { replace: true });
  }, [scopeKey, setParams]);

  // Search, page, the retired switch and the gap filter live in the URL, so Back from a loop returns to the same list.
  const set = (k: string, v: string | null) => setParams(p => {
    if (v) p.set(k, v); else p.delete(k);
    if (k !== 'page' && k !== 'loop') p.delete('page');
    return p;
  }, { replace: true });
  const onSearch = (v: string) => set('search', v);
  const gapHref = (g: RegistryGap) => { const q = new URLSearchParams(params); q.set('gap', g); q.delete('page'); q.delete('loop'); return `${registryHref()}?${q}`; };
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get('page')) || 1), pageCount);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goPage = (n: number) => set('page', n > 1 ? String(n) : null);
  const hrefFor = (id: string) => { const q = new URLSearchParams(params); q.set('loop', id); return `${registryHref()}?${q}`; };

  return (
    <div className="cpm-screen">
      <WorkspaceHeader
        page="/cpm/registry"
        title="Loop Registry"
        copy={HELP}
        actions={
          <>
            <ReasonedButton variant="normal" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setImportOpen(true)}>Bulk import</ReasonedButton>
            <ReasonedButton variant="raised" disabled={!canManage} reason={NEEDS_MANAGE} onClick={() => setWizardOpen(true)}>Add loop</ReasonedButton>
          </>
        }
      />
      {selectedId ? (
        <LoopDetail loopId={selectedId} onBack={() => set('loop', null)} />
      ) : (
        <>
          <ReadinessStrip summary={summary.data} isError={summary.isError} error={summary.error} retry={() => void summary.refetch()} gapHref={gapHref} degraded={degraded} />
          <section className="cpm-surface">
            <PanelHead
              title="Loop assets"
              right={
                <span className="cpm-reg-tools">
                  <span className="cpm-event-row__sub">{filtered.length} {filtered.length === 1 ? 'loop' : 'loops'}{retiredHidden > 0 ? ` · ${retiredHidden} retired hidden` : ''}</span>
                  <label className="cpm-reg-retired">
                    <input type="checkbox" checked={showRetired} onChange={e => set('retired', e.target.checked ? '1' : null)} />
                    Show retired
                  </label>
                  <input className="cpm-input" aria-label="Find loop" placeholder="Find loop" value={search} onChange={e => onSearch(e.target.value)} />
                </span>
              }
            />
            {gap && (
              <p className="cpm-event-row__sub cpm-reg-count">
                Loops with {GAP_LABEL[gap]}. <ObcButton variant="flat" onClick={() => set('gap', null)}>Clear</ObcButton>
              </p>
            )}
            {isLoading && <EmptyState title="Loading registry…" />}
            {isError && <QueryError title="Registry unavailable" error={error} retry={() => void refetch()} />}
            {!isLoading && !isError && filtered.length === 0 && (
              <EmptyState title="No loops registered" copy="Onboard the first loop to start producing diagnoses."
                action={canManage ? { label: 'Add loop', onClick: () => setWizardOpen(true) } : undefined} />
            )}
            {rows.length > 0 && (
              <table className="cpm-table cpm-reg-table">
                <thead><tr><th>Loop</th><th>Loop type</th><th>VP</th></tr></thead>
                <tbody>
                  {rows.map(loop => (
                    <tr key={loop.loopId} className="cpm-reg-row" onClick={() => navigate(hrefFor(loop.loopId))}>
                      <td>
                        <Link to={hrefFor(loop.loopId)} className="cpm-reg-link" onClick={e => e.stopPropagation()}><strong>{loop.loopId}</strong></Link>
                        {abnormalPill(loop) && <> <TonePill tone={loop.isActive && loop.monitoringEnabled ? 'warn' : 'muted'}>{abnormalPill(loop)}</TonePill></>}
                        <div className="cpm-event-row__sub">{serviceName(loop)}</div>
                      </td>
                      <td>{loop.loopType}</td>
                      <td>{vpCellLabel(loop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pageCount > 1 && (
              <div className="cpm-pager">
                <span title={page === 1 ? 'Already on the first page' : undefined}><ObcButton variant="flat" onClick={() => goPage(page - 1)} disabled={page === 1}>← Prev</ObcButton></span>
                <span className="cpm-event-row__sub">Page {page} of {pageCount}</span>
                <span title={page >= pageCount ? 'Already on the last page' : undefined}><ObcButton variant="flat" onClick={() => goPage(page + 1)} disabled={page >= pageCount}>Next →</ObcButton></span>
              </div>
            )}
          </section>
        </>
      )}

      {wizardOpen && <AddLoopWizard existing={loops} onClose={() => setWizardOpen(false)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

export default LoopRegistry;
