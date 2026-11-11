'use client';

/**
 * One data source in the panel beside the list (a drawer below 1280 px). CHG-172 (owner review, the approved sample, badge 13):
 * the profile as eyebrow, the name and the state once (the heading had three pills and no state); the connection rows, every
 * topic filter (only the first was shown), times in the site zone named once ("25 Sep 19:45"); Loop ingest; Test · Edit ·
 * Turn off / Turn on · Delete (owner answer 10a: the button read On / Off) with the test's answer under them; the configuration
 * and client ids and the version in Record details (they were Technical details).
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Inspector } from '../../ui/Inspector';
import { KvRow, TonePill } from '../Cpm/shared';
import { DetailsDialog } from '../Cpm/config/DetailsDialog';
import type { DataSourceDto, ProfileInfo, TestResult } from './dataSourcesApi';
import LoopIngestPanel from './LoopIngestPanel';
import { stamp, zoneTag } from './adminTime';

export const SourceState: React.FC<{ active: boolean }> = ({ active }) =>
  (active ? <TonePill tone="good" glyph="✓">Active</TonePill> : <TonePill tone="muted" glyph="○">Off</TonePill>);

interface Props {
  source: DataSourceDto;
  profile?: ProfileInfo;
  canManage: boolean;
  testing: boolean;
  lastTest?: TestResult;
  open: boolean;
  onClose: () => void;
  onTest: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onSaved: (saved: DataSourceDto) => void;
}

export const DataSourceDetail: React.FC<Props> = ({
  source, profile, canManage, testing, lastTest, open, onClose, onTest, onEdit, onToggle, onAskDelete, onSaved,
}) => {
  const [record, setRecord] = useState(false);
  const mqtt = source.profileConfig?.mqtt;
  const topics = mqtt?.topics ?? [];
  const zone = zoneTag();
  const ok = source.lastConnectionStatus === 'SUCCESS';
  return (
    <>
      <Inspector eyebrow={profile?.displayName ?? source.sourceType} title={source.name} open={open} onClose={onClose}
        meta={<SourceState active={source.isActive} />}
        primaryAction={
          <div className="cpm-admin-foot cpm-admin-foot--end">
            <ObcButton variant="flat" onClick={() => setRecord(true)}>Record details</ObcButton>
          </div>
        }>
        <KvRow label="Connection URL"><span className="cpm-mono">{source.connectionUrl}</span></KvRow>
        <KvRow label="Username">{source.username}</KvRow>
        <KvRow label={topics.length > 1 ? 'Topic filters' : 'Topic filter'}><span className="cpm-mono">{topics.join(', ') || '—'}</span></KvRow>
        {profile && <KvRow label="Feeds">{`${profile.module} · ${profile.destination}`}</KvRow>}
        <KvRow label="QoS · keepalive">{`QoS ${mqtt?.qos ?? 1} · ${mqtt?.keepalive_seconds ?? 60} s`}</KvRow>
        <KvRow label="Timeout">{`${source.timeoutSeconds} s`}</KvRow>
        <KvRow label={`Last connection test · ${zone}`}>
          {source.lastConnectionTest
            ? <span className={ok ? 'cpm-admin-good' : source.lastConnectionStatus ? 'cpm-field__error' : undefined}>{`${ok ? '✓' : '✗'} ${stamp(source.lastConnectionTest)}`}</span>
            : '—'}
        </KvRow>
        <KvRow label={`Last data received · ${zone}`}>{source.lastDataReceived ? stamp(source.lastDataReceived) : '—'}</KvRow>

        {/* loop_ingest: a missing MODE map once excluded the whole fleet unnoticed. Loop-samples profile only. */}
        {source.profileType === 'MQTT_LOOP_SAMPLES' && <LoopIngestPanel source={source} canManage={canManage} onSaved={onSaved} />}

        {canManage && (
          <div className="cpm-admin-part">
            <div className="cpm-admin-inline">
              <ObcButton variant="normal" disabled={testing} onClick={onTest}>{testing ? 'Testing…' : 'Test'}</ObcButton>
              <ObcButton variant="normal" onClick={onEdit}>Edit</ObcButton>
              <ObcButton variant="normal" onClick={onToggle}>{source.isActive ? 'Turn off' : 'Turn on'}</ObcButton>
              <ObcButton variant="flat" onClick={onAskDelete}>Delete</ObcButton>
            </div>
            {lastTest && (
              <p role="status" className={lastTest.ok ? 'cpm-admin-ok' : 'cpm-admin-warn'}>
                {lastTest.ok ? `✓ Connected in ${lastTest.latencyMs} ms` : `✗ ${lastTest.error ?? 'Connection failed'}`}
              </p>
            )}
            {!lastTest && source.lastConnectionStatus === 'FAILED' && source.lastConnectionError && (
              <p className="cpm-field__error" title={source.lastConnectionError}>
                Last test error: {source.lastConnectionError.length > 160 ? `${source.lastConnectionError.slice(0, 160)}…` : source.lastConnectionError}
              </p>
            )}
          </div>
        )}
      </Inspector>
      <DetailsDialog title="Record details" open={record} onClose={() => setRecord(false)} rows={[
        { label: 'Configuration id', copy: source.configId },
        { label: 'Client id', copy: source.effectiveClientId },
        { label: 'Version', value: source.version },
      ]} />
    </>
  );
};

export default DataSourceDetail;
