import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { getAuthToken } from '../../api/auth';

interface AlarmFeedStatus {
  enabled: boolean;
  feedUrl: string;
  pollIntervalMs: number;
  serverId: string;
  serverName: string;
  protocol: string;
  kafkaTopic: string;
  status: string;
  lastError?: string | null;
  httpStatusCode?: number | null;
  telemetryState: string;
  secondsSinceLastEvent?: number | null;
  totalEventsObserved: number;
  pipelinePath: string;
  configNote: string;
}

const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken()}` });

function statusColor(status: string): string {
  if (status === 'Connected' || status === 'Healthy') return 'var(--color-success)';
  if (status === 'Disabled') return 'var(--text-muted)';
  return 'var(--alarm-critical)';
}

export const AlarmFeedConfig: React.FC = () => {
  const [status, setStatus] = useState<AlarmFeedStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testUrl, setTestUrl] = useState('');

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axios.get<AlarmFeedStatus>('/api/v1/admin/alarm-feed', { headers: authHeaders() });
      setStatus(res.data);
      setTestUrl(res.data.feedUrl);
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(msg ?? 'Failed to load alarm feed status.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 10000);
    return () => window.clearInterval(id);
  }, [reload]);

  const handleTest = async () => {
    if (!testUrl.trim()) {
      toast.error('Enter a feed URL to test.');
      return;
    }
    try {
      setIsTesting(true);
      const res = await axios.post(
        '/api/v1/admin/alarm-feed/test',
        { feedUrl: testUrl.trim() },
        { headers: authHeaders() },
      );
      if (res.data?.success) toast.success(res.data.message ?? 'Feed reachable.');
      else toast.error(res.data?.message ?? 'Feed test failed.');
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      toast.error(msg ?? 'Feed test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading && !status) return <div className="spinner" style={{ margin: 'auto' }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Alarm Feed (HTTP API)</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Sole authoritative alarm source. Ingestion publishes to Kafka; Flink processes before UI projection.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-3)',
      }}>
        <StatCard label="Status" value={status?.status ?? 'Unknown'} color={statusColor(status?.status ?? '')} />
        <StatCard label="Telemetry" value={status?.telemetryState ?? '—'} />
        <StatCard label="Events observed" value={String(status?.totalEventsObserved ?? 0)} />
        <StatCard
          label="Last event"
          value={status?.secondsSinceLastEvent != null ? `${Math.round(status.secondsSinceLastEvent)}s ago` : '—'}
        />
      </div>

      <div style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        fontSize: '13px',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 'var(--space-3)' }}>Configuration</div>
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 16px', margin: 0 }}>
          <dt style={{ color: 'var(--text-muted)' }}>Enabled</dt>
          <dd>{status?.enabled ? 'Yes' : 'No'}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Feed URL</dt>
          <dd style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{status?.feedUrl}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Poll interval</dt>
          <dd>{status?.pollIntervalMs ?? 0} ms</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Server</dt>
          <dd>{status?.serverName} ({status?.serverId})</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Kafka topic</dt>
          <dd style={{ fontFamily: 'var(--font-mono)' }}>{status?.kafkaTopic}</dd>
          <dt style={{ color: 'var(--text-muted)' }}>Pipeline</dt>
          <dd style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{status?.pipelinePath}</dd>
        </dl>
        {status?.lastError && (
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--alarm-critical)', fontSize: '12px' }}>
            {status.lastError}
          </div>
        )}
        <p style={{ marginTop: 'var(--space-3)', fontSize: '12px', color: 'var(--text-muted)' }}>
          {status?.configNote}
        </p>
      </div>

      <div style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}>
        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: 'var(--space-2)' }}>Test feed connectivity</div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="input-field"
            style={{ flex: 1, minWidth: '280px', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
            value={testUrl}
            onChange={e => setTestUrl(e.target.value)}
            placeholder="http://192.168.1.51:8010/api/current-alarms"
          />
          <button className="btn btn--primary" onClick={() => void handleTest()} disabled={isTesting}>
            {isTesting ? 'Testing…' : 'Test GET'}
          </button>
          <button className="btn btn--ghost" onClick={() => void reload()} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--color-bg-primary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-3) var(--space-4)',
    }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: color ?? 'var(--text-primary)', marginTop: '4px' }}>
        {value}
      </div>
    </div>
  );
}

export default AlarmFeedConfig;
