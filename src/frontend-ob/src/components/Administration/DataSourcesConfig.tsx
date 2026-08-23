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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
            Source Configuration
          </h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Configure OT data sources — MQTT broker connections consumed by the ingestion service
          </p>
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

      {sources.map(source => {
        const mqtt = source.profileConfig?.mqtt;
        const profile = profiles.find(p => p.profileType === source.profileType);
        const lastTest = testResults[source.configId];
        return (
          <div key={source.configId} style={{
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
            padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px',
          }}>

            {/* Card header: name + badges + actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: T.textPrimary }}>{source.name}</span>
                <Pill
                  text={source.isActive ? 'Active' : 'Off'}
                  color={source.isActive ? T.success : T.textMuted}
                />
                <Pill text={source.sourceType} color={T.blue} />
                {profile && <Pill text={profile.displayName} color={T.blue} />}
                {mqtt?.topics?.[0] && <Pill text={mqtt.topics[0]} color={T.success} mono />}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <ObcButton
                    variant="flat"
                    disabled={testingId === source.configId}
                    onClick={() => handleTest(source.configId)}
                  >
                    {testingId === source.configId ? 'Testing…' : 'Test'}
                  </ObcButton>
                  <ObcButton variant="flat" onClick={() => setView({ kind: 'edit', source })}>Edit</ObcButton>
                  <ObcButton variant="flat" onClick={() => handleToggle(source)}>
                    {source.isActive ? 'Off' : 'On'}
                  </ObcButton>
                  <ObcButton variant="flat" onClick={() => setConfirmDeleteId(source.configId)}>Delete</ObcButton>
                </div>
              )}
            </div>

            {/* Card body: key facts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 24px' }}>
              <Fact label="Connection URL" value={source.connectionUrl} mono />
              <Fact label="Username" value={source.username} />
              {profile && <Fact label="Feeds" value={`${profile.module} · ${profile.destination}`} />}
              <Fact label="QoS / Keepalive" value={`QoS ${mqtt?.qos ?? 1} · ${mqtt?.keepalive_seconds ?? 60}s`} />
              <Fact label="Timeout" value={`${source.timeoutSeconds}s`} />
              <Fact
                label="Last Connection Test"
                value={
                  source.lastConnectionTest
                    ? `${source.lastConnectionStatus === 'SUCCESS' ? '✓' : '✗'} ${new Date(source.lastConnectionTest).toLocaleString()}`
                    : '—'
                }
                color={
                  source.lastConnectionStatus === 'SUCCESS' ? T.success
                  : source.lastConnectionStatus ? T.critical : undefined
                }
              />
              <Fact
                label="Last Data Received"
                value={source.lastDataReceived ? new Date(source.lastDataReceived).toLocaleString() : '—'}
              />
            </div>

            {/* Test / error detail */}
            {lastTest && (
              <div role="status" style={{
                padding: '9px 14px', borderRadius: T.radiusSm, fontSize: '12.5px', fontWeight: 600,
                background: lastTest.ok ? T.successBg : T.criticalBg,
                border: `1px solid ${lastTest.ok ? T.success : T.critical}`,
                color: lastTest.ok ? T.success : T.critical,
              }}>
                {lastTest.ok
                  ? `✓ Connected in ${lastTest.latencyMs} ms`
                  : `✗ ${lastTest.error ?? 'Connection failed'}`}
              </div>
            )}
            {!lastTest && source.lastConnectionStatus === 'FAILED' && source.lastConnectionError && (
              <div style={{ fontSize: '12px', color: T.critical }} title={source.lastConnectionError}>
                Last test error: {source.lastConnectionError.length > 160
                  ? `${source.lastConnectionError.slice(0, 160)}…`
                  : source.lastConnectionError}
              </div>
            )}

            {/* Delete confirmation */}
            {confirmDeleteId === source.configId && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, borderRadius: T.radiusSm,
              }}>
                <span style={{ fontSize: '13px', color: T.critical, fontWeight: 600 }}>
                  Delete "{source.name}" and its stored credentials?
                </span>
                <ObcButton variant="flat" onClick={() => handleDelete(source.configId)}>Delete</ObcButton>
                <ObcButton variant="flat" onClick={() => setConfirmDeleteId(null)}>Cancel</ObcButton>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ── Sub-components ───────────────────────────────────── */

const Pill: React.FC<{ text: string; color: string; mono?: boolean }> = ({ text, color, mono }) => (
  <span style={{
    fontSize: '11px', fontWeight: 700, color, border: `1px solid ${color}`,
    borderRadius: '999px', padding: '2px 10px',
    fontFamily: mono ? "'Noto Sans Mono', monospace" : 'inherit',
  }}>
    {text}
  </span>
);

const Fact: React.FC<{ label: string; value: string; mono?: boolean; color?: string }> = ({ label, value, mono, color }) => (
  <div>
    <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
      {label}
    </div>
    <div style={{
      fontSize: '13px', color: color ?? T.textPrimary, wordBreak: 'break-all',
      fontFamily: mono ? "'Noto Sans Mono', monospace" : 'inherit',
    }}>
      {value}
    </div>
  </div>
);

export default DataSourcesConfig;
