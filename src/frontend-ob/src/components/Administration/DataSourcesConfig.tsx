'use client';

/**
 * Data sources (CHG-172, owner review: the approved sample docs/theme/redesign/samples/administration-proposal.html, badges
 * 12-15, and the owner's answers of 11 Nov 2026). One list: a search (it matches the name, the type, the broker URL and the
 * profile shown under each name; "MQTT" under every row went) and Data source / State (✓ Active / ○ Off). The selected source
 * is in a panel beside it (a drawer below 1280 px). Add data source sits in the page header and opens the editor as a dialog
 * (it replaced the whole tab). Delete asks first in a dialog with the same question. Reading needs ingestion.view; every write
 * (Add, Edit, Test, Turn on / off, Delete, the MODE map) needs ingestion.manage, as before.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useAuthStore } from '../../store/authStore';
import {
  DataSourceDto, ProfileInfo, TestResult,
  deleteDataSource, extractApiError, listDataSources, listProfiles,
  setDataSourceActive, testDataSource,
} from './dataSourcesApi';
import DataSourceWizard from './DataSourceWizard';
import { DataSourceDetail, SourceState } from './DataSourceDetail';
import { AdminActions } from './AdminActions';
import { AdminConfirmDialog } from './AdminConfirmDialog';
import { EmptyState } from '../Cpm/shared';

type Editor = { kind: 'create' } | { kind: 'edit'; source: DataSourceDto } | null;

export const DataSourcesConfig: React.FC = () => {
  const canManage = useAuthStore(s => s.hasPermission)('ingestion.manage');
  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editor, setEditor] = useState<Editor>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deleting, setDeleting] = useState<DataSourceDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const [srcs, profs] = await Promise.all([listDataSources(), listProfiles()]);
      setSources(srcs);
      setProfiles(profs);
    } catch (err) {
      setActionError(extractApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try { await fn(); } catch (err) { setActionError(extractApiError(err).message); }
  };

  const handleTest = (id: string) => void runAction(async () => {
    setTestingId(id);
    try {
      const result = await testDataSource(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
      await reload();
    } finally {
      setTestingId(null);
    }
  });

  const handleToggle = (source: DataSourceDto) => void runAction(async () => {
    await setDataSourceActive(source.configId, !source.isActive);
    await reload();
  });

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true); setDeleteError(null);
    try {
      await deleteDataSource(deleting.configId);
      setDeleting(null);
      await reload();
    } catch (err) {
      setDeleteError(extractApiError(err).message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const profileOf = (s: DataSourceDto) => profiles.find(p => p.profileType === s.profileType);
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? sources.filter(s => [s.name, s.sourceType, s.connectionUrl, profileOf(s)?.displayName ?? ''].some(v => v.toLowerCase().includes(needle)))
    : sources;
  const selected = shown.find(s => s.configId === selectedId) ?? shown[0];
  const pick = (id: string) => { setSelectedId(id); setDrawer(true); };

  return (
    <>
      {canManage && (
        <AdminActions>
          <ObcButton variant="raised" onClick={() => setEditor({ kind: 'create' })}>Add data source</ObcButton>
        </AdminActions>
      )}
      <div className="cpm-master-detail">
        <section className="cpm-surface cpm-admin-list" aria-label="Data sources">
          <div className="cpm-compact cpm-admin-filters" role="group" aria-label="Data source filters">
            <input className="cpm-input" type="search" aria-label="Find data source" placeholder="Name, type or broker URL"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {actionError && <p className="cpm-field__error" role="alert">{actionError}</p>}
          {isLoading && sources.length === 0 && <div className="cpm-admin-loading"><div className="spinner" /></div>}
          {!isLoading && sources.length === 0 && (
            <EmptyState title={`No data sources configured yet.${canManage ? ' Click "Add data source" to connect the OT gateway broker.' : ''}`} />
          )}
          {sources.length > 0 && shown.length === 0 && <p className="cpm-copy cpm-admin-none">No data source matches the search.</p>}
          {shown.length > 0 && (
            <table className="cpm-table cpm-reg-table cpm-admin-table cpm-admin-table--sources">
              <thead><tr><th>Data source</th><th>State</th></tr></thead>
              <tbody>
                {shown.map(s => {
                  const on = s.configId === selected?.configId;
                  return (
                    <tr key={s.configId} className={`cpm-reg-row${on ? ' cpm-reg-row--selected' : ''}`} aria-current={on ? 'true' : undefined}
                      onClick={() => pick(s.configId)}>
                      <td>
                        <button type="button" className="cpm-admin-rowlink" onClick={e => { e.stopPropagation(); pick(s.configId); }}>
                          <strong>{s.name}</strong>
                          <span className="cpm-event-row__sub">{profileOf(s)?.displayName ?? s.sourceType}</span>
                        </button>
                      </td>
                      <td><SourceState active={s.isActive} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        {selected && (
          <DataSourceDetail
            source={selected}
            profile={profileOf(selected)}
            canManage={canManage}
            testing={testingId === selected.configId}
            lastTest={testResults[selected.configId]}
            open={drawer}
            onClose={() => setDrawer(false)}
            onTest={() => handleTest(selected.configId)}
            onEdit={() => setEditor({ kind: 'edit', source: selected })}
            onToggle={() => handleToggle(selected)}
            onAskDelete={() => { setDeleteError(null); setDeleting(selected); }}
            onSaved={saved => setSources(list => list.map(x => (x.configId === saved.configId ? saved : x)))}
          />
        )}
      </div>

      {editor && (
        <DataSourceWizard
          profiles={profiles}
          existing={editor.kind === 'edit' ? editor.source : undefined}
          onCancel={() => setEditor(null)}
          onDone={() => { setEditor(null); void reload(); }}
        />
      )}
      <AdminConfirmDialog open={!!deleting} title="Delete data source" confirmLabel="Delete" busy={deleteBusy} error={deleteError}
        onCancel={() => setDeleting(null)} onConfirm={() => void handleDelete()}>
        <p className="cpm-copy">{`Delete "${deleting?.name ?? ''}" and its stored credentials?`}</p>
      </AdminConfirmDialog>
    </>
  );
};

export default DataSourcesConfig;
