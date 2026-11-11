'use client';

/**
 * Tag Aliases — admin surface for assets.alias_mapping (P4.3 / G-08).
 *
 * The alias table is the OT bridge: `legacy OT tag → canonical UNS path`, so the DCS never has to be renamed. It shipped
 * write-only (create + resolve, no list, no delete) and sat empty in production. This page lists, creates, retires and
 * CSV-imports aliases. legacy_path + source_system are immutable identity — correcting them is delete + recreate, mirroring the
 * server contract.
 *
 * CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-proposal.html, badges 19-20, and the
 * owner's answers 12a/12c of 11 Nov 2026): one list (the tag with its UNS path under it, Source; ⊘ Inactive only on an inactive
 * row; inactive aliases listed as before); one filter row, a search (the server ignores case since CHG-172) and a Source dropdown
 * with each source's count; the shared pager, 100 a page (the API pages; 203 of 703 could not be reached without a search under
 * "Showing 500 of 703"). The selected alias is in a panel beside the list with Delete. The Source counts come from one read of
 * every alias (in pages of 1000), cached for a minute.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { toast } from 'react-toastify';
import { apiFetch, apiJson } from '../../api/apiFetch';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../Cpm/shared';
import { Pagination } from '../../ui/forms/Pagination';
import { AdminActions } from './AdminActions';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import { ALIAS_API, AddAliasDialog, ImportAliasDialog } from './aliases/AliasDialogs';
import { AliasPanel, AliasState, type AliasRow } from './aliases/AliasPanel';

const PAGE_SIZE = 100;
const FACET_PAGE = 1000;
const FACET_PAGES = 10;

/** Every alias's source system, counted: one read in pages of 1000 (the API's ceiling). */
async function sourceCounts(): Promise<{ total: number; bySource: Array<[string, number]> }> {
  const counts = new Map<string, number>();
  let total = 0;
  for (let page = 0; page < FACET_PAGES; page++) {
    const res = await apiJson<{ total: number; items: AliasRow[] }>(`${ALIAS_API}?take=${FACET_PAGE}&skip=${page * FACET_PAGE}&includeInactive=true`);
    total = res.total;
    res.items.forEach(a => counts.set(a.sourceSystem, (counts.get(a.sourceSystem) ?? 0) + 1));
    if ((page + 1) * FACET_PAGE >= res.total || res.items.length === 0) break;
  }
  return { total, bySource: [...counts].sort(([a], [b]) => a.localeCompare(b)) };
}

export const AliasConfig: React.FC = () => {
  const qc = useQueryClient();
  const canEdit = useAuthStore(s => s.hasPermission('asset.edit'));
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [deleting, setDeleting] = useState<AliasRow | null>(null);

  useEffect(() => { setPage(1); }, [search, source]);
  const url = useMemo(() => {
    const q = `${ALIAS_API}?take=${PAGE_SIZE}&skip=${(page - 1) * PAGE_SIZE}&includeInactive=true`;
    return `${q}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}${source ? `&source=${encodeURIComponent(source)}` : ''}`;
  }, [page, search, source]);
  // The previous page stays on screen while the next one is read, so the pager does not vanish under the cursor.
  const aliases = useQuery({
    queryKey: ['aliases', url], staleTime: 15_000, placeholderData: prev => prev,
    queryFn: () => apiJson<{ total: number; items: AliasRow[] }>(url),
  });
  const facets = useQuery({ queryKey: ['aliases', 'sources'], staleTime: 60_000, queryFn: sourceCounts });

  const items = aliases.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((aliases.data?.total ?? 0) / PAGE_SIZE));
  const selected = items.find(a => a.id === selectedId) ?? items[0];
  const pick = (a: AliasRow) => { setSelectedId(a.id); setDrawer(true); };

  const onDelete = async (row: AliasRow) => {
    setDeleting(null);
    const res = await apiFetch(`${ALIAS_API}/${row.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      toast.error(`Delete failed (HTTP ${res.status})`);
      return;
    }
    void qc.invalidateQueries({ queryKey: ['aliases'] });
  };

  const refresh = (changed: boolean) => {
    setAddOpen(false);
    setImportOpen(false);
    if (changed) void qc.invalidateQueries({ queryKey: ['aliases'] });
  };

  return (
    <>
      {canEdit && (
        <AdminActions>
          <ObcButton variant="normal" onClick={() => setImportOpen(true)}>Import CSV</ObcButton>
          <ObcButton variant="raised" onClick={() => setAddOpen(true)}>Add alias</ObcButton>
        </AdminActions>
      )}
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-admin-list" aria-label="Tag aliases">
          <div className="cpm-compact cpm-admin-filters" role="group" aria-label="Tag alias filters">
            <input className="cpm-input" type="search" aria-label="Find tag alias" placeholder="Tag or path" value={search}
              onChange={e => setSearch(e.target.value)} />
            <select className="cpm-select" aria-label="Source" value={source} onChange={e => setSource(e.target.value)}>
              <option value="">{facets.data ? `All sources ${facets.data.total}` : 'All sources'}</option>
              {(facets.data?.bySource ?? []).map(([s, n]) => <option key={s} value={s}>{`${s} ${n}`}</option>)}
            </select>
          </div>
          {aliases.data && items.length === 0 && (
            <EmptyState title={`No aliases${search.trim() || source ? ' match the search' : ' configured yet'}.`} />
          )}
          {items.length > 0 && (
            <table className="cpm-table cpm-reg-table cpm-admin-table cpm-admin-table--aliases">
              <thead><tr><th>Tag → UNS path</th><th>Source</th></tr></thead>
              <tbody>
                {items.map(a => {
                  const on = a.id === selected?.id;
                  return (
                    <tr key={a.id} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => pick(a)}>
                      <td>
                        <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); pick(a); }}>
                          <strong className="cpm-mono">{a.legacyPath}</strong>
                          <span className="cpm-event-row__sub cpm-mono">{a.canonicalPath}</span>
                        </button>
                        {!a.isActive && <> <AliasState active={false} /></>}
                      </td>
                      <td className="cpm-copy">{a.sourceSystem}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {pageCount > 1 && (
            <div className="cpm-events-pager">
              <Pagination page={page} pageCount={pageCount} onChange={setPage} label="Alias pages" />
            </div>
          )}
        </section>
        {selected && (
          <AliasPanel alias={selected} canEdit={canEdit} open={drawer} onClose={() => setDrawer(false)} onDelete={() => setDeleting(selected)} />
        )}
      </div>

      <AdminConfirmDialog open={!!deleting} title="Delete alias" confirmLabel="Delete" onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void onDelete(deleting)}>
        <p className="cpm-copy">
          {deleting && `Delete the mapping '${deleting.legacyPath}' → '${deleting.canonicalPath}'? Events using this tag will park as unknown until remapped.`}
        </p>
      </AdminConfirmDialog>
      {addOpen && <AddAliasDialog onClose={refresh} />}
      {importOpen && <ImportAliasDialog onClose={refresh} />}
    </>
  );
};

export default AliasConfig;
