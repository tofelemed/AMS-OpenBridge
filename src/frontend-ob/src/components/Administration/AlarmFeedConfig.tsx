'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { authedAxios } from '../../api/http';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA', borderLight: '#EEF2F7',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5', successBorder: '#A7F3D0',
  critical: '#D64545', criticalBg: '#FEF2F2', criticalBorder: '#FCA5A5',
  warning: '#B45309', warningBg: '#FFFBEB', warningBorder: '#FDE68A',
  radius: '12px', radiusSm: '8px',
  shadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

interface AlarmFeedStatus {
  enabled: boolean; feedUrl: string; pollIntervalMs: number;
  serverId: string; serverName: string; protocol: string;
  kafkaTopic: string; status: string; lastError?: string | null;
  httpStatusCode?: number | null; telemetryState: string;
  secondsSinceLastEvent?: number | null; totalEventsObserved: number;
  pipelinePath: string; configNote: string;
}


function getStatusStyle(status: string): { color: string; bg: string; border: string } {
  if (status === 'Connected' || status === 'Healthy')
    return { color: T.success,  bg: T.successBg,  border: T.successBorder };
  if (status === 'Disabled')
    return { color: T.textMuted, bg: T.bg, border: T.border };
  return { color: T.critical, bg: T.criticalBg, border: T.criticalBorder };
}

export const AlarmFeedConfig: React.FC = () => {
  const [status,    setStatus]    = useState<AlarmFeedStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testUrl,   setTestUrl]   = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await authedAxios.get<AlarmFeedStatus>('/api/v1/admin/alarm-feed', { skipActivity: true });
      setStatus(res.data);
      setTestUrl(res.data.feedUrl);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 10000);
    return () => window.clearInterval(id);
  }, [reload]);

  const handleTest = async () => {
    if (!testUrl.trim()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await authedAxios.post<{ success: boolean; message?: string; statusCode?: number }>(
        '/api/v1/admin/alarm-feed/test', { feedUrl: testUrl.trim() });
      const d = res.data;
      setTestResult({
        ok: !!d.success,
        message: d.message || (d.success ? `OK (HTTP ${d.statusCode ?? 200})` : `Failed (HTTP ${d.statusCode ?? '—'})`),
      });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Probe request failed' });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading && !status) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
        <div className="spinner" />
      </div>
    );
  }

  const ss = getStatusStyle(status?.status ?? '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
          Alarm Feed (HTTP API)
        </h3>
        <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
          Sole authoritative alarm source. Ingestion publishes to Kafka; Flink processes before UI projection.
        </p>
      </div>

      {/* Status KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <FeedStatCard
          label="Feed Status"
          value={status?.status ?? 'Unknown'}
          valueStyle={{ color: ss.color, fontWeight: 700 }}
          accent={ss.color}
        />
        <FeedStatCard label="Telemetry State"    value={status?.telemetryState ?? '—'} />
        <FeedStatCard label="Events Observed"    value={String(status?.totalEventsObserved ?? 0)} />
        <FeedStatCard
          label="Last Event"
          value={status?.secondsSinceLastEvent != null ? `${Math.round(status.secondsSinceLastEvent)}s ago` : '—'}
        />
      </div>

      {/* Configuration detail */}
      <ConfigSection title="Feed Configuration">
        <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '10px 20px', margin: 0, fontSize: '13px' }}>
          {[
            ['Enabled',       status?.enabled ? 'Yes' : 'No'],
            ['Feed URL',      status?.feedUrl,       true],
            ['Poll Interval', `${status?.pollIntervalMs ?? 0} ms`],
            ['Server',        status?.serverName ? `${status.serverName}  (${status.serverId})` : '—'],
            ['Kafka Topic',   status?.kafkaTopic,    true],
            ['Pipeline',      status?.pipelinePath,  true],
          ].map(([label, value, mono]) => (
            <React.Fragment key={String(label)}>
              <dt style={{ color: T.textMuted, fontWeight: 600, alignSelf: 'start', paddingTop: '2px' }}>{label}</dt>
              <dd style={{
                margin: 0, color: T.textPrimary, wordBreak: 'break-all',
                fontFamily: mono ? "'Noto Sans Mono', monospace" : 'inherit',
                fontSize: mono ? '12px' : '13px',
              }}>
                {value ?? '—'}
              </dd>
            </React.Fragment>
          ))}
        </dl>

        {status?.lastError && (
          <div style={{
            marginTop: '14px', padding: '12px 14px',
            background: T.criticalBg, border: `1px solid ${T.criticalBorder}`,
            borderLeft: `3px solid ${T.critical}`, borderRadius: T.radiusSm,
            fontSize: '12.5px', color: T.critical,
          }}>
            <strong>Error:</strong> {status.lastError}
          </div>
        )}
        {status?.configNote && (
          <p style={{ marginTop: '10px', fontSize: '12px', color: T.textMuted }}>{status.configNote}</p>
        )}
      </ConfigSection>

      {/* Test connectivity */}
      <ConfigSection title="Test Feed Connectivity">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="ob-input"
            style={{ flex: 1, minWidth: '280px', fontFamily: "'Noto Sans Mono', monospace", fontSize: '13px' }}
            value={testUrl}
            onChange={e => setTestUrl(e.target.value)}
            placeholder="http://192.168.1.51:8010/api/current-alarms"
          />
          <ObcButton variant="raised" onClick={() => void handleTest()} disabled={isTesting}>
            {isTesting ? 'Testing…' : 'Test GET'}
          </ObcButton>
          <ObcButton variant="flat" onClick={() => void reload()} disabled={isLoading}>
            Refresh
          </ObcButton>
        </div>
        {testResult && (
          <div role="status" style={{
            marginTop: '10px', padding: '9px 14px', borderRadius: T.radiusSm, fontSize: '13px', fontWeight: 600,
            background: testResult.ok ? T.successBg : T.criticalBg,
            border: `1px solid ${testResult.ok ? T.success : T.critical}`,
            color: testResult.ok ? T.success : T.critical,
          }}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
          </div>
        )}
      </ConfigSection>
    </div>
  );
};

/* ── Sub-components ───────────────────────────────────── */

const FeedStatCard: React.FC<{
  label: string; value: string;
  valueStyle?: React.CSSProperties; accent?: string;
}> = ({ label, value, valueStyle, accent }) => (
  <div style={{
    background: T.bg, border: `1px solid ${T.borderLight}`,
    borderLeft: `3px solid ${accent ?? T.border}`,
    borderRadius: T.radiusSm, padding: '13px 16px',
  }}>
    <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '5px' }}>
      {label}
    </div>
    <div style={{ fontSize: '20px', fontWeight: 700, color: T.textPrimary, ...valueStyle }}>
      {value}
    </div>
  </div>
);

const ConfigSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: T.radiusSm, padding: '18px 20px',
  }}>
    <div style={{
      fontSize: '11.5px', fontWeight: 700, color: T.blue,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      marginBottom: '14px', paddingBottom: '10px',
      borderBottom: `1.5px solid ${T.border}`,
    }}>
      {title}
    </div>
    {children}
  </div>
);

export default AlarmFeedConfig;
