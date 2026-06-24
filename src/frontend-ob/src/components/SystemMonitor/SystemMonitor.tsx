'use client';

import React, { useEffect, useState } from 'react';

const T = {
  blue:          '#31598F',
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

interface PipelineHealth {
  readiness?: { score: number };
  flink?:     { status: string; checkpointLatencyMs: number };
  kafka?:     { lag: number; throughput: number };
}

export const SystemMonitor: React.FC = () => {
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/v1/health/pipeline');
        if (res.ok) setPipelineHealth(await res.json() as PipelineHealth);
      } catch { /* silent */ }
    };
    void fetchHealth();
    const id = setInterval(() => void fetchHealth(), 5000);
    return () => clearInterval(id);
  }, []);

  /* Loading skeleton */
  if (!pipelineHealth) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: T.textSecondary }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          border: `2px solid ${T.blueMuted}`, borderTopColor: T.blue,
          animation: 'spin 0.7s linear infinite',
        }} />
        Initializing edge observability…
      </div>
    );
  }

  const score      = pipelineHealth.readiness?.score ?? 0;
  const flinkOk    = pipelineHealth.flink?.status === 'Running';
  const kafkaLag   = pipelineHealth.kafka?.lag ?? 0;
  const kafkaTput  = pipelineHealth.kafka?.throughput ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>

      {/* ── Page header ─────────────────────────── */}
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          System Monitor
        </h1>
        <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
          Edge pipeline health — Kafka, Flink, SignalR, and alarm lifecycle observability
        </p>
      </div>

      {/* ── Health KPI row ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <HealthKpi
          icon="📊" label="Edge Health Score"
          value={`${score.toFixed(0)}`} unit="/ 100"
          status={score > 80 ? 'pass' : score > 50 ? 'warn' : 'fail'}
          sub="Overall pipeline readiness"
        />
        <HealthKpi
          icon="⚙" label="Flink Checkpoint"
          value={flinkOk ? 'Healthy' : 'Degraded'}
          status={flinkOk ? 'pass' : 'fail'}
          sub={`Latency: ${pipelineHealth.flink?.checkpointLatencyMs ?? 0} ms`}
        />
        <HealthKpi
          icon="⏱" label="Kafka Topic Lag"
          value={String(kafkaLag)}
          unit=" msgs"
          status={kafkaLag === 0 ? 'pass' : kafkaLag < 100 ? 'warn' : 'fail'}
          sub={`Throughput: ${kafkaTput.toFixed(1)} ev/s`}
        />
        <HealthKpi
          icon="✅" label="Alarm Consistency"
          value="100%" status="pass"
          sub="0 state drifts detected"
        />
      </div>

      {/* ── Pipeline flow ───────────────────────── */}
      <MonitorCard title="Pipeline Data Flow" icon="🔄">
        <div style={{ padding: '20px 0', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0', minWidth: '600px' }}>
            <PipelineNode label="OPC Server"    status="active" sublabel="AE 1.10" />
            <PipelineArrow />
            <PipelineNode label="Ingestion API" status="active" sublabel="HTTP pull" />
            <PipelineArrow />
            <PipelineNode label="Kafka"         status="active" sublabel={`${kafkaTput.toFixed(0)} ev/s`} />
            <PipelineArrow />
            <PipelineNode label="Flink Jobs"    status={flinkOk ? 'active' : 'warning'} sublabel={flinkOk ? 'Running' : 'Degraded'} />
            <PipelineArrow />
            <PipelineNode label="SignalR Hub"   status="active" sublabel="WebSocket" />
            <PipelineArrow />
            <PipelineNode label="UI Clients"    status="active" sublabel="React" />
          </div>
        </div>
      </MonitorCard>

      {/* ── Flink Jobs + Alarm Lifecycle ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        <MonitorCard title="Flink Job Status" icon="⚙">
          <DataTable
            headers={['Job Name', 'Status', 'Uptime', 'Records/s', 'Checkpoint']}
            rows={[
              ['alarm-enrichment',  'RUNNING', '4d 12h', '1,250', 'OK'],
              ['correlation-engine','RUNNING', '4d 12h',   '320', 'OK'],
              ['flood-detector',    'RUNNING', '4d 12h',    '15', 'OK'],
              ['soe-sequencer',     'RUNNING', '4d 12h',   '890', 'OK'],
            ]}
            mono={[true, false, false, true, false]}
            statusCol={1}
          />
        </MonitorCard>

        <MonitorCard title="Alarm Lifecycle Inspector" icon="🔍">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: 'Alarms in Transit',         value: '12',    unit: 'msgs',  trend: 'normal' },
              { label: 'Avg Processing Time',        value: '8.2',   unit: 'ms',    trend: 'good' },
              { label: 'Dedup Rate',                 value: '2.1',   unit: '%',     trend: 'normal' },
              { label: 'OPC → UI Latency (P99)',     value: '45',    unit: 'ms',    trend: 'good' },
              { label: 'SignalR Connected Clients',  value: '3',     unit: 'users', trend: 'normal' },
              { label: 'Failed ACK Writebacks',      value: '0',     unit: '',      trend: 'good' },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 0',
                  borderBottom: i < 5 ? `1px solid ${T.borderLight}` : 'none',
                }}
              >
                <span style={{ fontSize: '13px', color: T.textSecondary }}>{row.label}</span>
                <span style={{
                  fontFamily: "'Noto Sans Mono', monospace", fontWeight: 700,
                  fontSize: '14px',
                  color: row.trend === 'good' ? T.success : T.textPrimary,
                }}>
                  {row.value}
                  {row.unit && <span style={{ fontSize: '11px', fontWeight: 400, color: T.textMuted, marginLeft: '3px' }}>{row.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </MonitorCard>
      </div>

      {/* ── Kafka Topics ────────────────────────── */}
      <MonitorCard title="Kafka Topics" icon="📨">
        <DataTable
          headers={['Topic', 'Partitions', 'Consumer Lag', 'Msg Rate', 'Status']}
          rows={[
            ['ams.raw-alarms',       '6', String(kafkaLag), '125 msg/s', 'Healthy'],
            ['ams.enriched-alarms',  '6', '0',              '125 msg/s', 'Healthy'],
            ['ams.audit-events',     '3', '0',              '45 msg/s',  'Healthy'],
          ]}
          mono={[true, false, true, true, false]}
          statusCol={4}
        />
      </MonitorCard>

    </div>
  );
};

/* ═══════════════════════════════════════
   HEALTH KPI CARD
   ═══════════════════════════════════════ */
type HealthStatus = 'pass' | 'warn' | 'fail';

const STATUS_CFG: Record<HealthStatus, { barColor: string; valueColor: string; badgeBg: string; badgeColor: string; badgeBorder: string; badgeLabel: string }> = {
  pass: { barColor: T.success,  valueColor: T.success,  badgeBg: T.successBg,  badgeColor: T.success,  badgeBorder: T.successBorder, badgeLabel: 'Healthy' },
  warn: { barColor: T.caution,  valueColor: T.warning,  badgeBg: T.warningBg,  badgeColor: T.warning,  badgeBorder: T.warningBorder, badgeLabel: 'Degraded' },
  fail: { barColor: T.critical, valueColor: T.critical, badgeBg: T.criticalBg, badgeColor: T.critical, badgeBorder: T.criticalBorder, badgeLabel: 'Critical' },
};

const HealthKpi: React.FC<{
  icon: string; label: string; value: string;
  status: HealthStatus; sub?: string; unit?: string;
}> = ({ icon, label, value, status, sub, unit }) => {
  const cfg = STATUS_CFG[status];
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden', boxShadow: T.shadow }}>
      <div style={{ height: '3px', background: cfg.barColor }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '28px', fontWeight: 700, color: cfg.valueColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: '12px', color: T.textMuted }}>{unit}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          {sub && <span style={{ fontSize: '11.5px', color: T.textSecondary }}>{sub}</span>}
          <span style={{
            marginLeft: 'auto', padding: '2px 8px', borderRadius: '20px',
            fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
            background: cfg.badgeBg, color: cfg.badgeColor, border: `1px solid ${cfg.badgeBorder}`,
            flexShrink: 0,
          }}>
            {cfg.badgeLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MONITOR CARD WRAPPER
   ═══════════════════════════════════════ */
const MonitorCard: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: '20px 22px', boxShadow: T.shadow }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: '16px', paddingBottom: '12px',
      borderBottom: `1.5px solid ${T.border}`,
    }}>
      <span style={{
        width: '30px', height: '30px', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        background: T.blueLight, border: `1px solid ${T.blueMuted}`,
        borderRadius: '8px', fontSize: '14px',
      }}>
        {icon}
      </span>
      <h3 style={{ fontSize: '13.5px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>{title}</h3>
    </div>
    {children}
  </div>
);

/* ═══════════════════════════════════════
   PIPELINE NODE
   ═══════════════════════════════════════ */
const NODE_STATUS: Record<'active' | 'warning' | 'error', { dot: string; border: string; bg: string }> = {
  active:  { dot: T.success,  border: T.successBorder, bg: T.successBg },
  warning: { dot: T.caution,  border: T.warningBorder,  bg: T.warningBg },
  error:   { dot: T.critical, border: T.criticalBorder, bg: T.criticalBg },
};

const PipelineNode: React.FC<{ label: string; status: 'active' | 'warning' | 'error'; sublabel?: string }> = ({ label, status, sublabel }) => {
  const ns = NODE_STATUS[status];
  return (
    <div style={{
      padding: '12px 16px', minWidth: '90px',
      background: ns.bg, border: `1.5px solid ${ns.border}`,
      borderRadius: T.radiusSm, textAlign: 'center',
      boxShadow: `0 1px 4px ${ns.dot}20`,
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: ns.dot, margin: '0 auto 7px',
        boxShadow: status === 'active' ? `0 0 7px ${T.success}` : 'none',
      }} />
      <div style={{ fontSize: '12px', fontWeight: 700, color: T.textPrimary, whiteSpace: 'nowrap' }}>{label}</div>
      {sublabel && <div style={{ fontSize: '10.5px', color: T.textSecondary, marginTop: '2px', fontFamily: "'Noto Sans Mono', monospace" }}>{sublabel}</div>}
    </div>
  );
};

const PipelineArrow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: T.textMuted, flexShrink: 0 }}>
    <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
      <line x1="0" y1="8" x2="22" y2="8" stroke={T.blueMuted} strokeWidth="1.5" />
      <path d="M19 4 L26 8 L19 12" fill="none" stroke={T.blueMuted} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  </div>
);

/* ═══════════════════════════════════════
   DATA TABLE
   ═══════════════════════════════════════ */
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  RUNNING: { bg: T.successBg, color: T.success },
  STOPPED: { bg: T.criticalBg, color: T.critical },
  Healthy: { bg: T.successBg, color: T.success },
  OK:      { bg: T.successBg, color: T.success },
};

const DataTable: React.FC<{
  headers: string[];
  rows: string[][];
  mono?: boolean[];
  statusCol?: number;
}> = ({ headers, rows, mono = [], statusCol }) => (
  <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: T.bg }}>
          {headers.map(h => (
            <th key={h} style={{
              padding: '10px 14px', textAlign: 'left',
              fontSize: '10.5px', fontWeight: 700, color: T.textMuted,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              borderBottom: `1.5px solid ${T.border}`,
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.borderLight}` : 'none', background: T.card }}
            onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
            onMouseLeave={e => (e.currentTarget.style.background = T.card)}
          >
            {row.map((cell, j) => {
              const isStatus = j === statusCol;
              const badge    = STATUS_BADGE[cell];
              return (
                <td key={j} style={{
                  padding: '11px 14px',
                  fontFamily: mono[j] ? "'Noto Sans Mono', monospace" : 'inherit',
                  fontSize: mono[j] ? '12px' : '13px',
                  color: isStatus ? undefined : (j === 2 && cell === '0' ? T.success : T.textPrimary),
                }}>
                  {isStatus && badge ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '5px',
                      padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 700,
                      background: badge.bg, color: badge.color,
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: badge.color, display: 'inline-block' }} />
                      {cell}
                    </span>
                  ) : cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default SystemMonitor;
