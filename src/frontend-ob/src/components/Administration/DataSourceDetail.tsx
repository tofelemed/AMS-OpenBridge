'use client';

/**
 * One data source, open: its connection facts, the loop-ingest MODE map and the actions (Test, Edit, On/Off, Delete).
 * Connection fields stay here. The configuration and client ids are build and engine identifiers: closed under Technical details.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { T } from '../../styles/theme';
import type { DataSourceDto, ProfileInfo, TestResult } from './dataSourcesApi';
import LoopIngestPanel from './LoopIngestPanel';
import { Fact, Pill } from './adminUi';
import { TechnicalDetails } from '../../ui/TechnicalDetails';

interface Props {
  source: DataSourceDto;
  profile?: ProfileInfo;
  canManage: boolean;
  testing: boolean;
  lastTest?: TestResult;
  confirmingDelete: boolean;
  onTest: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onSaved: (saved: DataSourceDto) => void;
}

export const DataSourceDetail: React.FC<Props> = ({
  source, profile, canManage, testing, lastTest, confirmingDelete,
  onTest, onEdit, onToggle, onAskDelete, onCancelDelete, onDelete, onSaved,
}) => {
  const mqtt = source.profileConfig?.mqtt;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h3 className="cpm-panel-title">{source.name}</h3>
          <Pill text={source.sourceType} color={T.blue} />
          {profile && <Pill text={profile.displayName} color={T.blue} />}
          {mqtt?.topics?.[0] && <Pill text={mqtt.topics[0]} color={T.success} mono />}
        </div>
        {canManage && (
          <div className="cpm-admin-bar__actions">
            <ObcButton variant="flat" disabled={testing} onClick={onTest}>{testing ? 'Testing…' : 'Test'}</ObcButton>
            <ObcButton variant="flat" onClick={onEdit}>Edit</ObcButton>
            <ObcButton variant="flat" onClick={onToggle}>{source.isActive ? 'Off' : 'On'}</ObcButton>
            <ObcButton variant="flat" onClick={onAskDelete}>Delete</ObcButton>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 24px' }}>
        <Fact label="Connection URL" value={source.connectionUrl} mono />
        <Fact label="Username" value={source.username} />
        {profile && <Fact label="Feeds" value={`${profile.module} · ${profile.destination}`} />}
        <Fact label="QoS / Keepalive" value={`QoS ${mqtt?.qos ?? 1} · ${mqtt?.keepalive_seconds ?? 60}s`} />
        <Fact label="Timeout" value={`${source.timeoutSeconds}s`} />
        <Fact
          label="Last Connection Test"
          value={source.lastConnectionTest
            ? `${source.lastConnectionStatus === 'SUCCESS' ? '✓' : '✗'} ${new Date(source.lastConnectionTest).toLocaleString()}`
            : '—'}
          color={source.lastConnectionStatus === 'SUCCESS' ? T.success : source.lastConnectionStatus ? T.critical : undefined}
        />
        <Fact label="Last Data Received" value={source.lastDataReceived ? new Date(source.lastDataReceived).toLocaleString() : '—'} />
      </div>

      {/* loop_ingest: a missing MODE map once excluded the whole fleet unnoticed. Loop-samples profile only. */}
      {source.profileType === 'MQTT_LOOP_SAMPLES' && (
        <LoopIngestPanel source={source} canManage={canManage} onSaved={onSaved} />
      )}

      {lastTest && (
        <div role="status" style={{
          padding: '9px 14px', borderRadius: T.radiusSm, fontSize: '12.5px', fontWeight: 600,
          background: lastTest.ok ? T.successBg : T.criticalBg,
          border: `1px solid ${lastTest.ok ? T.success : T.critical}`,
          color: lastTest.ok ? T.success : T.critical,
        }}>
          {lastTest.ok ? `✓ Connected in ${lastTest.latencyMs} ms` : `✗ ${lastTest.error ?? 'Connection failed'}`}
        </div>
      )}
      {!lastTest && source.lastConnectionStatus === 'FAILED' && source.lastConnectionError && (
        <div style={{ fontSize: '12px', color: T.critical }} title={source.lastConnectionError}>
          Last test error: {source.lastConnectionError.length > 160 ? `${source.lastConnectionError.slice(0, 160)}…` : source.lastConnectionError}
        </div>
      )}

      {confirmingDelete && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
          background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, borderRadius: T.radiusSm,
        }}>
          <span style={{ fontSize: '13px', color: T.critical, fontWeight: 600 }}>
            Delete "{source.name}" and its stored credentials?
          </span>
          <ObcButton variant="flat" onClick={onDelete}>Delete</ObcButton>
          <ObcButton variant="flat" onClick={onCancelDelete}>Cancel</ObcButton>
        </div>
      )}

      <TechnicalDetails items={[
        { label: 'Configuration id', value: source.configId },
        { label: 'Client id', value: source.effectiveClientId },
        { label: 'Version', value: source.version, mono: false },
      ]} />
    </div>
  );
};

export default DataSourceDetail;
