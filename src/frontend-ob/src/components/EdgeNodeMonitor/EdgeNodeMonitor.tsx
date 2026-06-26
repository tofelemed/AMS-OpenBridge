'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useMqttStore, getMqttBrokerUrl, type LiveAlarm } from '../../store/mqttStore';
import { fetchHistorianBffHealth, type BffHealth } from '../../api/historianHealth';

const T = {
  blue:          '#31598F',
  blueMid:       '#4069A5',
  blueLight:     '#EAF2FF',
  blueMuted:     '#C4D8F0',
  bg:            '#F6F8FB',
  card:          '#FFFFFF',
  border:        '#DDE3EA',
  borderLight:   '#EEF2F7',
  textPrimary:   '#1F2937',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  success:       '#2E8B57',
  successBg:     '#ECFDF5',
  successBorder: '#A7F3D0',
  warning:       '#B45309',
  warningBg:     '#FFFBEB',
  warningBorder: '#FDE68A',
  critical:      '#D64545',
  criticalBg:    '#FEF2F2',
  criticalBorder:'#FCA5A5',
  caution:       '#D97706',
  radius:        '12px',
  radiusSm:      '8px',
  shadow:        '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

interface SnapshotAsset {
  asset:       string;
  metricCount: number;
  freshness:   number | null;
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: T.critical, HIGH: T.caution,
  MEDIUM:   T.blueMid,  LOW: T.textMuted, DIAGNOSTIC: T.textMuted,
};

const EdgeNodeMonitor: React.FC = () => {
  /* MQTT state */
  const mqttConnected  = useMqttStore(s => s.connected);
  const mqttError      = useMqttStore(s => s.error);
  const liveAlarms     = useMqttStore(s => s.liveAlarms);
  const metrics        = useMqttStore(s => s.metrics);
  const aliasMap       = useMqttStore(s => s.aliasMap);
  const mqttConnect    = useMqttStore(s => s.connect);
  const mqttDisconnect = useMqttStore(s => s.disconnect);

  /* BFF health */
  const [bffHealth,  setBffHealth]  = useState<BffHealth | null>(null);
  const [bffLoading, setBffLoading] = useState(false);
  const [bffError,   setBffError]   = useState<string | null>(null);

  /* Snapshot assets (sample from metrics map keys) */
  const [snapAssets, setSnapAssets] = useState<SnapshotAsset[]>([]);

  /* Track incoming message count */
  const [prevMetricSize, setPrevMetricSize] = useState(0);

  /* Connect MQTT on mount */
  useEffect(() => {
    mqttConnect();
    return () => { mqttDisconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Track metric map size changes */
  useEffect(() => {
    if (metrics.size !== prevMetricSize) {
      setPrevMetricSize(metrics.size);
    }
  }, [metrics.size, prevMetricSize]);

  /* Derive snapshot asset summary from metrics map */
  useEffect(() => {
    const deviceSet = new Map<string, number>();
    for (const key of metrics.keys()) {
      const device = key.split('/')[0];
      deviceSet.set(device, (deviceSet.get(device) ?? 0) + 1);
    }
    const now = Date.now();
    const assets: SnapshotAsset[] = [];
    for (const [asset, count] of deviceSet.entries()) {
      const tsMetric = metrics.get(`${asset}/ts`) ?? metrics.get(`${asset}/state`);
      const age      = tsMetric ? Math.round((now - tsMetric.ts) / 1000) : null;
      assets.push({ asset, metricCount: count, freshness: age });
    }
    setSnapAssets(assets.sort((a, b) => a.asset.localeCompare(b.asset)));
  }, [metrics]);

  /* Fetch BFF health */
  const fetchBffHealth = useCallback(async () => {
    setBffLoading(true); setBffError(null);
    try {
      setBffHealth(await fetchHistorianBffHealth());
    } catch (e) {
      setBffError(String(e));
      setBffHealth(null);
    } finally {
      setBffLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBffHealth();
    const id = setInterval(() => void fetchBffHealth(), 15_000);
    return () => clearInterval(id);
  }, [fetchBffHealth]);

  /* Derived counts */
  const activeAlarmCount = [...liveAlarms.values()].filter(a => a.conditionActive).length;
  const criticalCount    = [...liveAlarms.values()].filter(a => a.priority === 'CRITICAL').length;
  const deviceCount      = snapAssets.length;
  const aliasCount       = aliasMap.size;

  const bffUp   = bffHealth?.status === 'Healthy';
  const iotdbUp = bffHealth?.iotdb  === 'Healthy';
  const redisUp = bffHealth?.redis  === 'Healthy';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Edge Node Monitor
            </h1>
            <ConnDot connected={mqttConnected} label={mqttConnected ? 'MQTT Live' : 'MQTT Offline'} />
          </div>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: 0 }}>
            Sparkplug B · EMQX · Redis snapshot · Historian BFF · IoTDB health
          </p>
        </div>
        <button
          onClick={() => void fetchBffHealth()}
          disabled={bffLoading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: T.card, color: T.blue, border: `1.5px solid ${T.blueMuted}`,
            borderRadius: T.radiusSm, padding: '8px 16px', fontSize: '12.5px', fontWeight: 600,
            cursor: bffLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            transition: 'background 130ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
          onMouseLeave={e => (e.currentTarget.style.background = T.card)}
        >
          ↻ Refresh Health
        </button>
      </div>

      {/* ── KPI row ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
        <EdgeKpi icon="⬡" label="Active Devices"  value={String(deviceCount)}
          status={deviceCount > 0 ? 'pass' : 'warn'} sub="Sparkplug B devices" />
        <EdgeKpi icon="⚑" label="Live Alarms"     value={String(activeAlarmCount)}
          status={criticalCount > 0 ? 'fail' : activeAlarmCount > 0 ? 'warn' : 'pass'}
          sub={criticalCount > 0 ? `${criticalCount} critical` : 'via DDATA stream'} />
        <EdgeKpi icon="⇄" label="Metric Keys"     value={String(metrics.size)}
          status="pass" sub={`${aliasCount} aliases mapped`} />
        <EdgeKpi icon="⊞" label="Historian BFF"   value={bffUp ? 'Healthy' : bffError ? 'Error' : '—'}
          status={bffUp ? 'pass' : bffError ? 'fail' : 'warn'} sub="localhost:8090" />
        <EdgeKpi icon="🗄" label="IoTDB"           value={iotdbUp ? 'Healthy' : iotdbUp === false ? 'Degraded' : '—'}
          status={iotdbUp ? 'pass' : 'warn'} sub="via BFF health" />
      </div>

      {/* ── Edge pipeline topology ────────────────────────── */}
      <MonitorCard title="Edge Data Flow" icon="⬡">
        <div style={{ padding: '16px 0', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', minWidth: '700px' }}>
            <EdgeNode label="Kafka" sub="live.alarms / live.metrics" status="active" />
            <EdgeArrow />
            <EdgeNode label="Sparkplug Edge Node" sub="Java / Tahu" status="active" />
            <EdgeArrow />
            <EdgeNode label="EMQX" sub="MQTT 5.0 · WS :8083" status={mqttConnected ? 'active' : 'warning'} />
            <EdgeArrow />
            <EdgeNode label="Frontend" sub="MQTT.js · mqttStore" status={mqttConnected ? 'active' : 'warning'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', minWidth: '700px', marginTop: '16px' }}>
            <EdgeNode label="Flink IoTDB Job" sub="raw-alarms" status="active" />
            <EdgeArrow />
            <EdgeNode label="IoTDB" sub="1.3.2 standalone" status={iotdbUp ? 'active' : 'warning'} />
            <EdgeArrow />
            <EdgeNode label="Historian BFF" sub=".NET 8 · /trend /raw" status={bffUp ? 'active' : bffError ? 'error' : 'warning'} />
            <EdgeArrow />
            <EdgeNode label="Frontend" sub="IoTDB Trend Viewer" status={bffUp ? 'active' : 'warning'} />
          </div>
        </div>
      </MonitorCard>

      {/* ── MQTT + BFF health cards side-by-side ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* MQTT / EMQX status */}
        <MonitorCard title="MQTT Connection" icon="⬡">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: 'Broker',            value: getMqttBrokerUrl() },
              { label: 'Connection State',  value: mqttConnected ? 'Connected' : 'Disconnected', highlight: mqttConnected ? T.success : T.critical },
              { label: 'Last Error',        value: mqttError ?? '—', highlight: mqttError ? T.critical : undefined },
              { label: 'Sparkplug Group',   value: import.meta.env.VITE_SPARKPLUG_GROUP ?? 'ams_site1' },
              { label: 'Sparkplug Edge',    value: import.meta.env.VITE_SPARKPLUG_EDGE  ?? 'ams_edge1' },
              { label: 'Alias Map Entries', value: String(aliasCount) },
              { label: 'Live Alarms',       value: String(liveAlarms.size) },
              { label: 'Metric Keys',       value: String(metrics.size) },
            ].map((row, i, arr) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.borderLight}` : 'none',
              }}>
                <span style={{ fontSize: '13px', color: T.textSecondary }}>{row.label}</span>
                <span style={{
                  fontSize: '13px', fontWeight: 600,
                  color: row.highlight ?? T.textPrimary,
                  fontFamily: "'Noto Sans Mono', monospace",
                  maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{row.value}</span>
              </div>
            ))}
          </div>
        </MonitorCard>

        {/* Historian BFF health */}
        <MonitorCard title="Historian BFF Health" icon="⊞">
          {bffError && !bffHealth && (
            <div style={{ padding: '12px', background: T.criticalBg, border: `1px solid ${T.criticalBorder}`, borderRadius: T.radiusSm, color: T.critical, fontSize: '13px', marginBottom: '12px' }}>
              {bffError}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: 'BFF Status',    value: bffHealth?.status  ?? (bffLoading ? 'Checking…' : '—'), ok: bffUp },
              { label: 'IoTDB',         value: bffHealth?.iotdb   ?? '—', ok: iotdbUp },
              { label: 'Redis',         value: bffHealth?.redis   ?? '—', ok: redisUp },
            ].map((row, i, arr) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.borderLight}` : 'none',
              }}>
                <span style={{ fontSize: '13px', color: T.textSecondary }}>{row.label}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '3px 10px', borderRadius: '20px',
                  background: row.ok ? T.successBg : row.ok === false ? T.criticalBg : T.bg,
                  border: `1px solid ${row.ok ? T.successBorder : row.ok === false ? T.criticalBorder : T.border}`,
                  fontSize: '11.5px', fontWeight: 700,
                  color: row.ok ? T.success : row.ok === false ? T.critical : T.textMuted,
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          {bffHealth?.checks && Object.keys(bffHealth.checks).length > 0 && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${T.borderLight}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Health Checks</div>
              {Object.entries(bffHealth.checks).map(([name, check]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: '12.5px', color: T.textSecondary }}>{name}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: check.status === 'Healthy' ? T.success : T.critical }}>{check.status}</span>
                </div>
              ))}
            </div>
          )}
        </MonitorCard>
      </div>

      {/* ── Live Alarms table ────────────────────────────── */}
      <MonitorCard title={`Live Sparkplug B Alarms (${liveAlarms.size})`} icon="⚑">
        {liveAlarms.size === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: T.textMuted, fontSize: '13px' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.4 }}>⚑</div>
            {mqttConnected
              ? 'No live alarms — waiting for Sparkplug B DDATA messages from edge node.'
              : 'MQTT not connected. Connect to receive live alarm stream.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...liveAlarms.values()].map(alarm => (
              <LiveAlarmRow key={alarm.alarmId} alarm={alarm} />
            ))}
          </div>
        )}
      </MonitorCard>

      {/* ── Snapshot assets table ────────────────────────── */}
      {snapAssets.length > 0 && (
        <MonitorCard title={`Redis Snapshot — ${snapAssets.length} Device${snapAssets.length !== 1 ? 's' : ''}`} icon="🗄">
          <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  {['Device ID', 'Metric Keys', 'Last Update', 'Freshness'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapAssets.map((a, i) => {
                  const stale  = a.freshness !== null && a.freshness > 300;
                  return (
                    <tr key={a.asset} style={{ borderBottom: i < snapAssets.length - 1 ? `1px solid ${T.borderLight}` : 'none', background: T.card }}
                      onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                      onMouseLeave={e => (e.currentTarget.style.background = T.card)}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: "'Noto Sans Mono', monospace", fontSize: '12.5px', color: T.textPrimary }}>{a.asset}</td>
                      <td style={{ padding: '10px 14px', color: T.blue, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{a.metricCount}</td>
                      <td style={{ padding: '10px 14px', color: T.textSecondary, fontSize: '12px' }}>
                        {a.freshness !== null ? `${a.freshness}s ago` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '5px',
                          padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                          background: stale ? T.warningBg : T.successBg,
                          color: stale ? T.warning : T.success,
                          border: `1px solid ${stale ? T.warningBorder : T.successBorder}`,
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                          {stale ? 'Stale' : 'Fresh'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </MonitorCard>
      )}
    </div>
  );
};

/* ── Sub-components ──────────────────────────────────────────── */

const ConnDot: React.FC<{ connected: boolean; label: string }> = ({ connected, label }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '4px 12px', borderRadius: '20px',
    background: connected ? '#ECFDF5' : '#FEF2F2',
    border: `1px solid ${connected ? '#A7F3D0' : '#FCA5A5'}`,
    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: connected ? '#2E8B57' : '#D64545',
  }}>
    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'currentColor', display: 'inline-block', boxShadow: connected ? '0 0 6px #2E8B57' : 'none' }} />
    {label}
  </span>
);

type HealthStatus = 'pass' | 'warn' | 'fail';
const KPI_CFG: Record<HealthStatus, { bar: string; val: string; badgeBg: string; badgeColor: string; badgeBorder: string; label: string }> = {
  pass: { bar: '#2E8B57', val: '#2E8B57', badgeBg: '#ECFDF5', badgeColor: '#2E8B57', badgeBorder: '#A7F3D0', label: 'Healthy' },
  warn: { bar: '#D97706', val: '#B45309', badgeBg: '#FFFBEB', badgeColor: '#B45309', badgeBorder: '#FDE68A', label: 'Degraded' },
  fail: { bar: '#D64545', val: '#D64545', badgeBg: '#FEF2F2', badgeColor: '#D64545', badgeBorder: '#FCA5A5', label: 'Critical' },
};

const EdgeKpi: React.FC<{ icon: string; label: string; value: string; status: HealthStatus; sub?: string }> = ({ icon, label, value, status, sub }) => {
  const c = KPI_CFG[status];
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
      <div style={{ height: '3px', background: c.bar }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        </div>
        <span style={{ fontSize: '26px', fontWeight: 700, color: c.val, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          {sub && <span style={{ fontSize: '11.5px', color: '#6B7280' }}>{sub}</span>}
          <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: c.badgeBg, color: c.badgeColor, border: `1px solid ${c.badgeBorder}`, flexShrink: 0 }}>{c.label}</span>
        </div>
      </div>
    </div>
  );
};

const MonitorCard: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #DDE3EA', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1.5px solid #DDE3EA' }}>
      <span style={{ width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#EAF2FF', border: '1px solid #C4D8F0', borderRadius: '8px', fontSize: '14px' }}>{icon}</span>
      <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: '#1F2937', margin: 0 }}>{title}</h3>
    </div>
    {children}
  </div>
);

type EdgeNodeStatus = 'active' | 'warning' | 'error';
const EDGE_STATUS: Record<EdgeNodeStatus, { dot: string; border: string; bg: string }> = {
  active:  { dot: '#2E8B57', border: '#A7F3D0', bg: '#ECFDF5' },
  warning: { dot: '#D97706', border: '#FDE68A', bg: '#FFFBEB' },
  error:   { dot: '#D64545', border: '#FCA5A5', bg: '#FEF2F2' },
};

const EdgeNode: React.FC<{ label: string; sub?: string; status: EdgeNodeStatus }> = ({ label, sub, status }) => {
  const ns = EDGE_STATUS[status];
  return (
    <div style={{ padding: '12px 14px', minWidth: '110px', background: ns.bg, border: `1.5px solid ${ns.border}`, borderRadius: '8px', textAlign: 'center', boxShadow: `0 1px 4px ${ns.dot}20` }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ns.dot, margin: '0 auto 7px', boxShadow: status === 'active' ? `0 0 7px ${ns.dot}` : 'none' }} />
      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap' }}>{label}</div>
      {sub && <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '2px', fontFamily: "'Noto Sans Mono', monospace" }}>{sub}</div>}
    </div>
  );
};

const EdgeArrow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="22" y2="8" stroke="#C4D8F0" strokeWidth="1.5" />
      <path d="M19 4 L26 8 L19 12" fill="none" stroke="#C4D8F0" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  </div>
);

const LiveAlarmRow: React.FC<{ alarm: LiveAlarm }> = ({ alarm }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '12px',
    padding: '10px 14px', background: '#FFFFFF',
    border: '1px solid #DDE3EA', borderRadius: '8px',
    borderLeft: `3px solid ${PRIORITY_COLOR[alarm.priority] ?? '#DDE3EA'}`,
  }}>
    <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: alarm.conditionActive ? (PRIORITY_COLOR[alarm.priority] ?? '#DDE3EA') : '#2E8B57' }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
        {alarm.sourceName || alarm.alarmId}
      </span>
      {alarm.conditionName && <span style={{ fontSize: '11px', color: '#6B7280' }}>{alarm.conditionName}</span>}
    </div>
    <span style={{
      fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
      background: alarm.state === 'CLEARED' ? '#ECFDF5' : alarm.state === 'ACKNOWLEDGED' ? '#EAF2FF' : '#FEF2F2',
      color:      alarm.state === 'CLEARED' ? '#2E8B57'  : alarm.state === 'ACKNOWLEDGED' ? '#31598F'  : '#D64545',
    }}>{alarm.state || 'ACTIVE'}</span>
    {alarm.priority && (
      <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: '#F6F8FB', border: '1px solid #DDE3EA', color: PRIORITY_COLOR[alarm.priority] ?? '#6B7280' }}>
        {alarm.priority}
      </span>
    )}
    <span style={{ fontSize: '12px', fontWeight: 700, color: PRIORITY_COLOR[alarm.priority] ?? '#9CA3AF', minWidth: '28px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
      {alarm.severity > 0 ? alarm.severity : '—'}
    </span>
    <span style={{ fontSize: '11px', color: '#9CA3AF', minWidth: '60px', textAlign: 'right', fontFamily: 'monospace' }}>
      {new Date(alarm.ts).toLocaleTimeString('en-GB')}
    </span>
  </div>
);

export default EdgeNodeMonitor;
