'use client';

/**
 * Loop Registry list (CHG-147): Loop, Loop type and VP. A row opens the loop's page (`?loop=`); search,
 * page and the retired switch stay in the URL so Back returns to the same list. Retired loops are hidden
 * unless asked for.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError, TonePill, WorkspaceHeader } from './shared';
import { useCpmLoops, useFleetSummary } from '../../hooks/useCpm';
import { useAuthStore } from '../../store/authStore';
import type { CpmLoop } from '../../api/cpmApi';
import { useCpmScope, loopMatchesQuery } from './plantScope';
import { registryHref } from './cpaHref';
import { serviceName } from './loopName';
import ProfileAside from './ProfileAside';
import AddLoopWizard from './AddLoopWizard';
import BulkImportDialog from './BulkImportDialog';
import ReasonedButton from './ReasonedButton';
import ReadinessStrip from './overview/ReadinessStrip';
import { vpCellLabel } from './optionalInputs';

const PAGE_SIZE = 25;
const NEEDS_MANAGE = 'Needs the cpm.manage permission';
const HELP = 'A loop is only as good as its signal mappings. The readiness report after save lists exactly what is degraded: without a VP tag mapped, G14 cannot confirm a final-element fault, and missing peer links leaves G13 unevaluated.';

export const LoopRegistry: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('loop') ?? '';
  const search = params.get('search') ?? '';
  const showRetired = params.get('retired') === '1';
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editLoop, setEditLoop] = useState<CpmLoop | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const canManage = useAuthStore(s => s.hasPermission('cpm.manage'));

  const { data, isLoading, isError, error, refetch } = useCpmLoops();
  const summary = useFleetSummary();
  const loops = useMemo(() => data?.loops ?? [], [data]);
  const scope = useCpmScope();
  const filtered = useMemo(
    () => loops.filter(l => (showRetired || l.isActive) && scope.matches(l) && loopMatchesQuery(l, search)),
    [loops, search, scope, showRetired]);

  // Search, page and the retired switch live in the URL, so Back from a loop returns to the same list.
  const set = (k: string, v: string | null) => setParams(p => { if (v) p.set(k, v); else p.delete(k); return p; }, { replace: true });
  const onSearch = (v: string) => setParams(p => { if (v) p.set('search', v); else p.delete('search'); p.delete('page'); return p; }, { replace: true });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.get('page')) || 1), pageCount);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goPage = (n: number) => set('page', n > 1 ? String(n) : null);
  const hrefFor = (id: string) => { const q = new URLSearchParams(params); q.set('loop', id); return `${registryHref()}?${q}`; };

  const selected = selectedId ? loops.find(l => l.loopId.toLowerCase() === selectedId.toLowerCase()) : undefined;

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
        // Interim until the Loop Detail page (Task 24): the profile panel, full width, under a way back to the list.
        <>
          <div><ObcButton variant="flat" onClick={() => set('loop', null)}>← Loop Registry</ObcButton></div>
          {selected
            ? <ProfileAside loop={selected} onEdit={() => setEditLoop(selected)} />
            : <section className="cpm-surface"><EmptyState title={`No loop ${selectedId}`} copy="It was renamed, removed or never onboarded." /></section>}
        </>
      ) : (
        <>
          <ReadinessStrip summary={summary.data} />
          <section className="cpm-surface">
            <PanelHead
              title="Loop assets"
              right={
                <span className="cpm-reg-tools">
                  <label className="cpm-reg-retired">
                    <input type="checkbox" checked={showRetired} onChange={e => set('retired', e.target.checked ? '1' : null)} />
                    Show retired
                  </label>
                  <input className="cpm-input" aria-label="Find loop" placeholder="Find loop" value={search} onChange={e => onSearch(e.target.value)} />
                </span>
              }
            />
            <p className="cpm-event-row__sub cpm-reg-count">{filtered.length} loops</p>
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
                    <tr key={loop.loopId} className="cpm-reg-row">
                      <td>
                        <Link to={hrefFor(loop.loopId)} className="cpm-reg-link"><strong>{loop.loopId}</strong></Link>
                        {!loop.isActive && <> <TonePill tone="muted">Retired</TonePill></>}
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
      {editLoop && <AddLoopWizard existing={loops} editLoop={editLoop} onClose={() => setEditLoop(null)} />}
      {importOpen && <BulkImportDialog existing={loops} onClose={() => setImportOpen(false)} />}
    </div>
  );
};

export default LoopRegistry;
