'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { T } from '../../styles/theme';
import { useAuthStore } from '../../store/authStore';
import {
  DataSourceDto, ProfileInfo, TestResult,
  deleteDataSource, extractApiError, listDataSources, listProfiles,
  setDataSourceActive, testDataSource,
} from './dataSourcesApi';
import DataSourceWizard from './DataSourceWizard';
import DataSourceDetail from './DataSourceDetail';
import { Pill } from './adminUi';
import { Toggletip } from '../../ui/Toggletip';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; source: DataSourceDto };

export const DataSourcesConfig: React.FC = () => {
  const canManage = useAuthStore(s => s.hasPermission)('ingestion.manage');
  const [sources, setSources] = useState<DataSourceDto[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const handleDelete = (id: string) => void runAction(async () => {
    await deleteDataSource(id);
    setConfirmDeleteId(null);
    await reload();
  });

  if (view.kind !== 'list') {
    return (
      <DataSourceWizard
        profiles={profiles}
        existing={view.kind === 'edit' ? view.source : undefined}
        onCancel={() => setView({ kind: 'list' })}
        onDone={() => { setView({ kind: 'list' }); void reload(); }}
      />
    );
  }

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? sources.filter(s => [s.name, s.sourceType, s.connectionUrl].some(v => v.toLowerCase().includes(needle)))
    : sources;
  const selected = sources.find(s => s.configId === selectedId) ?? shown[0];

  return (
    <>
      <div className="cpm-admin-bar">
        <div className="cpm-title-row">
          <input className="ob-input" type="search" aria-label="Search data sources" placeholder="Search data sources…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <Toggletip variant="how-to" label="About data sources">
            <p>OT data sources: MQTT broker connections consumed by the ingestion service.</p>
          </Toggletip>
        </div>
        {canManage && (
          <ObcButton variant="raised" onClick={() => setView({ kind: 'create' })}>
            + New Configuration
          </ObcButton>
        )}
      </div>

      {actionError && (
        <div role="alert" style={{
          padding: '10px 14px', borderRadius: T.radiusSm, fontSize: '13px',
          background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, color: T.critical,
        }}>
          {actionError}
        </div>
      )}

      {isLoading && sources.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
          <div className="spinner" />
        </div>
      )}

      {!isLoading && sources.length === 0 && (
        <div style={{
          padding: '40px', textAlign: 'center', color: T.textMuted, fontSize: '13.5px',
          background: T.bg, border: `1px dashed ${T.border}`, borderRadius: T.radiusSm,
        }}>
          No data sources configured yet.
          {canManage && ' Click "New Configuration" to connect the OT gateway broker.'}
        </div>
      )}

      {sources.length > 0 && (
        <div className="cpm-master-detail">
          <div>
            {shown.map(s => (
              <button key={s.configId} type="button" className="cpm-admin-source"
                aria-current={s.configId === selected?.configId} onClick={() => setSelectedId(s.configId)}>
                <span className="cpm-admin-source__line">
                  <strong>{s.name}</strong>
                  <Pill text={s.isActive ? 'Active' : 'Off'} color={s.isActive ? T.success : T.textMuted} />
                </span>
                <span className="cpm-admin-user__full">{s.sourceType}</span>
              </button>
            ))}
            {shown.length === 0 && <p>No data source matches the search.</p>}
          </div>
          {selected && (
            <DataSourceDetail
              source={selected}
              profile={profiles.find(p => p.profileType === selected.profileType)}
              canManage={canManage}
              testing={testingId === selected.configId}
              lastTest={testResults[selected.configId]}
              confirmingDelete={confirmDeleteId === selected.configId}
              onTest={() => handleTest(selected.configId)}
              onEdit={() => setView({ kind: 'edit', source: selected })}
              onToggle={() => handleToggle(selected)}
              onAskDelete={() => setConfirmDeleteId(selected.configId)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => handleDelete(selected.configId)}
              onSaved={saved => setSources(list => list.map(x => (x.configId === saved.configId ? saved : x)))}
            />
          )}
        </div>
      )}
    </>
  );
};

export default DataSourcesConfig;
