'use client';

import React, { useMemo, useEffect } from 'react';
import { useAlarmStore, type AlarmStats } from '../../store/alarmStore';
import { useMqttStore } from '../../store/mqttStore';
import { useAlarmAnalytics } from '../../hooks/useAlarmAnalytics';
import { useNavigate } from 'react-router-dom';

/* ─────────────────────────────────────────────
   Design tokens (OpenBridge-inspired light theme)
   ───────────────────────────────────────────── */

const Dashboard: React.FC = () => {
  const stats   = useAlarmStore(s => s.stats);
  const alarms  = useAlarmStore(s => s.alarms);
  const servers = useAlarmStore(s => s.serverStatuses);
  const lastUpdated = useAlarmStore(s => s.lastUpdated);
  const navigate = useNavigate();

  // Plant-wide KPIs shared with the Analytics page (same react-query key — no
  // extra request). MTTA and the 24h rate sparkline come from here.
  const { data: analytics } = useAlarmAnalytics();

  // Phase 5 — connect MQTT on dashboard mount; disconnect on unmount
  const mqttConnect         = useMqttStore(s => s.connect);
  const mqttConnected       = useMqttStore(s => s.connected);
  const mqttError           = useMqttStore(s => s.error);
  const liveAlarms          = useMqttStore(s => s.liveAlarms);
  const subscribeFirehose   = useMqttStore(s => s.subscribeFirehose);
  const unsubscribeFirehose = useMqttStore(s => s.unsubscribeFirehose);

  useEffect(() => {
    mqttConnect();
    // Dashboard shows a plant-wide live-alarm summary → opt into the DDATA firehose.
    subscribeFirehose();
    return () => unsubscribeFirehose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const operatorMetrics = useMemo(() => {
    const allAlarms   = Array.from(alarms.values());
    const ackedAlarms = allAlarms.filter(a => a.acknowledged && a.ackTimeEpochMs && a.activeTimeEpochMs);
    const totalHandled = ackedAlarms.length;
    let avgMtta = 0;
    if (ackedAlarms.length > 0) {
      const totalMttaMs = ackedAlarms.reduce((sum, a) => {
        const responseMs = (a.ackTimeEpochMs ?? 0) - (a.activeTimeEpochMs ?? a.eventTimeEpochMs ?? 0);
        return sum + Math.max(0, responseMs);
      }, 0);
      avgMtta = totalMttaMs / ackedAlarms.length / 1000;
    }
    return { totalHandled, avgMtta };
  }, [alarms]);

  const connectedServers = [...servers.values()].filter(s => s.isConnected).length;
  const alarmRateWarning = stats.alarmsPerTenMin > 1.0 && !stats.floodActive;

  // "Updated" reflects the last time alarm state actually changed (alarmStore),
  // not a render-time clock that ticked just because React re-rendered.
  const updatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—';

  // FE-05: a cold load used to render ZEROS while hydrating — indistinguishable from a
  // quiet plant. Until the first hydration completes, say we're loading.
  const hydrated = useAlarmStore(s => s.hydrated);
  if (!hydrated) {
    return (
      <div className="loading-screen" style={{ minHeight: '300px' }} data-testid="dashboard-hydrating">
        <div className="spinner" />
        <p style={{ color: 'var(--on-container-neutral-color)', fontSize: '13.5px' }}>
          Loading alarm data…
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '4px 0' }}>

      {/* ── HEADER ─────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{
              fontSize: '28px', fontWeight: 600, margin: 0,
              color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2,
            }}>
              Alarm Management Dashboard
            </h1>
            <SystemHealthBadge stats={stats} floodActive={stats.floodActive} />
          </div>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: 0, fontWeight: 400 }}>
            ISA-18.2 / EEMUA 191 — Real-time operational awareness&ensp;·&ensp;
            <span style={{ color: T.textMuted }}>Updated {updatedStr}</span>
          </p>
        </div>
        <button
          onClick={() => navigate('/alarms')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.blue, color: '#fff',
            border: 'none', borderRadius: T.radiusSm,
            padding: '9px 20px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', transition: 'background 140ms ease',
            fontFamily: 'inherit', letterSpacing: '0.01em',
            boxShadow: '0 1px 4px rgba(49,89,143,0.25)',
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = T.blueMid)}
          onMouseLeave={e => (e.currentTarget.style.background = T.blue)}
        >
          <span style={{ fontSize: '16px', lineHeight: 1 }}>⚑</span>
          View Active Alarms
        </button>
      </div>

      {/* ── LEVEL 1 — Critical Operational KPIs ─────────── */}
      <SectionBlock label="Operational Status" level={1}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <PrimaryKpi
            label="Active Alarms"
            value={stats.totalActive}
            sub={`${stats.alarmsPerTenMin.toFixed(1)} per 10 min`}
            status={stats.totalActive > 100 ? 'warning' : stats.totalActive > 0 ? 'active' : 'ok'}
            icon="⚠"
            onClick={() => navigate('/alarms')}
          />
          <PrimaryKpi
            label="Critical Alarms"
            value={stats.totalCritical}
            sub={stats.totalCritical > 0 ? 'Immediate action required' : 'No critical conditions'}
            status={stats.totalCritical > 0 ? 'critical' : 'ok'}
            icon="🚨"
            onClick={() => navigate('/alarms?priority=CRITICAL')}
          />
          <PrimaryKpi
            label="Unacknowledged"
            value={stats.unacknowledged}
            sub="Requires operator action"
            status={stats.unacknowledged > 20 ? 'warning' : stats.unacknowledged > 0 ? 'active' : 'ok'}
            icon="✗"
            onClick={() => navigate('/alarms?unacked=1')}
          />
          <PrimaryKpi
            label="Alarm Rate"
            value={`${stats.alarmsPerTenMin.toFixed(1)}`}
            sub={stats.floodActive ? '⚠ FLOOD CONDITION DETECTED' : alarmRateWarning ? 'Exceeds ISA-18.2 target' : 'ISA-18.2 target ≤ 1.0 / 10 min'}
            status={stats.floodActive ? 'critical' : alarmRateWarning ? 'warning' : 'ok'}
            icon="~"
            unit="/ 10 min"
          />
        </div>
        <RateSparkline points={analytics?.hourlyRates} />
      </SectionBlock>

      {/* ── LEVEL 2 — System Status KPIs ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
        <SecondaryKpi
          label="High Priority"
          value={stats.totalHigh}
          status={stats.totalHigh > 10 ? 'warning' : 'neutral'}
        />
        <SecondaryKpi label="Medium Priority" value={stats.totalMedium} status="neutral" />
        <SecondaryKpi label="Low Priority"    value={stats.totalLow}    status="neutral" />
        <SecondaryKpi
          label="Out of Service"
          value={stats.outOfService || 0}
          status={(stats.outOfService || 0) > 0 ? 'warning' : 'neutral'}
          sub="Monitoring disabled"
        />
        <SecondaryKpi
          label="OPC Servers"
          value={servers.size}
          status={connectedServers < servers.size ? 'warning' : 'ok'}
          sub={`${connectedServers} / ${servers.size} connected`}
        />
      </div>

      {/* ── LEVEL 3 — Priority Distribution + Operator Perf (side by side) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* Priority Distribution */}
        <SectionBlock label="Alarm Priority Distribution" level={3}>
          <PriorityDistribution stats={stats} />
        </SectionBlock>

        {/* Operator Performance */}
        <SectionBlock label="Operator Performance" level={3}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <OperatorMetric
              label="Mean Time to Acknowledge"
              // Prefer the plant-wide MTTA from /analytics/kpi (shared query) over the
              // session-only compute; fall back to the session value if unavailable.
              value={analytics?.meanTimeToAckSec != null
                ? `${analytics.meanTimeToAckSec.toFixed(1)}s`
                : operatorMetrics.avgMtta > 0 ? `${operatorMetrics.avgMtta.toFixed(1)}s` : '—'}
              description="Avg. operator response time"
              accentColor={T.blue}
            />
            <OperatorMetric
              label="Alarms Handled"
              value={String(operatorMetrics.totalHandled)}
              description="Acknowledged in session"
              accentColor={T.success}
            />
            <OperatorMetric
              label="Shelved Alarms"
              value={String(stats.shelved)}
              description="ISA-18.2 temporary suppression"
              accentColor={T.caution}
            />
            <OperatorMetric
              label="Suppressed Alarms"
              value={String(stats.suppressed)}
              description="By design rule"
              accentColor={T.textMuted}
            />
          </div>
        </SectionBlock>
      </div>

      {/* ── LEVEL 4 — Alarm Management State ─────────────── */}
      <SectionBlock label="Alarm Management State" level={4}>
        <AlarmStateMatrix stats={stats} />
      </SectionBlock>

      {/* ── LEVEL 5 — OPC Server Status ───────────────────── */}
      <SectionBlock label="OPC Server Connectivity" level={5}>
        {servers.size === 0 ? (
          <EmptyState message="No OPC servers configured. Connect a server to begin alarm monitoring." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {[...servers.values()].map(s => <ServerCard key={s.serverId} server={s} />)}
          </div>
        )}
      </SectionBlock>

      {/* ── Phase 5 — Live MQTT / Sparkplug B Stream ──────── */}
      <SectionBlock label="Live MQTT Stream (Sparkplug B)" level={5}>
        <MqttStatusPanel
          connected={mqttConnected}
          error={mqttError}
          liveAlarms={liveAlarms}
        />
      </SectionBlock>

    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SYSTEM HEALTH BADGE
   ═══════════════════════════════════════════════════════ */
const SystemHealthBadge: React.FC<{ stats: AlarmStats; floodActive: boolean }> = ({ stats, floodActive }) => {
  if (floodActive) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 12px', borderRadius: '20px',
        background: T.criticalBg, border: `1px solid ${T.critical}`,
        color: T.critical, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.critical, display: 'inline-block' }} />
        Alarm Flood
      </span>
    );
  }
  if (stats.totalCritical > 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 12px', borderRadius: '20px',
        background: T.criticalBg, border: `1px solid ${T.criticalBorder}`,
        color: T.critical, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.critical, display: 'inline-block' }} />
        Critical Active
      </span>
    );
  }
  if (stats.unacknowledged > 0 || stats.totalActive > 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 12px', borderRadius: '20px',
        background: T.warningBg, border: `1px solid ${T.warningBorder}`,
        color: T.warning, fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.caution, display: 'inline-block' }} />
        Alarms Active
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '4px 12px', borderRadius: '20px',
      background: T.successBg, border: `1px solid ${T.successBorder}`,
      color: T.success, fontSize: '11px', fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: T.success, display: 'inline-block' }} />
      All Clear
    </span>
  );
};

/* ═══════════════════════════════════════════════════════
   SECTION BLOCK WRAPPER
   ═══════════════════════════════════════════════════════ */
const LEVEL_COLORS: Record<number, string> = {
  1: T.blue, 3: T.blueMid, 4: T.textSecondary, 5: T.textMuted,
};

const SectionBlock: React.FC<{ label: string; level: number; children: React.ReactNode }> = ({
  label, level, children,
}) => (
  <div style={{
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: '20px 22px',
    boxShadow: T.shadow,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      marginBottom: '18px',
    }}>
      <div style={{
        width: '3px', height: '18px',
        background: LEVEL_COLORS[level] ?? T.blue,
        borderRadius: '2px', flexShrink: 0,
      }} />
      <h3 style={{
        fontSize: '13px', fontWeight: 700,
        color: T.textSecondary, margin: 0,
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </h3>
    </div>
    {children}
  </div>
);

/* ═══════════════════════════════════════════════════════
   24-HOUR ALARM-RATE SPARKLINE (Level 1)
   Reuses the Analytics hourlyRates (shared query) — no new endpoint. The ISA-18.2
   target of 1.0 alarms / 10 min = 6 / hour is drawn as a dashed reference line.
   ═══════════════════════════════════════════════════════ */
const ISA_TARGET_PER_HOUR = 6;

const RateSparkline: React.FC<{ points?: Array<{ hour?: string; count?: number; rate?: number }> }> = ({ points }) => {
  const values = (points ?? []).slice(-24).map(p => p.rate ?? p.count ?? 0);
  if (values.length < 2) return null; // nothing meaningful to draw yet

  const W = 100, H = 28;
  const max = Math.max(ISA_TARGET_PER_HOUR, ...values, 1);
  const stepX = W / (values.length - 1);
  const y = (v: number) => H - (v / max) * H;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * stepX).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L ${W.toFixed(2)},${H} L 0,${H} Z`;
  const targetY = y(ISA_TARGET_PER_HOUR).toFixed(2);
  const peak = Math.max(...values);
  const overTarget = values.filter(v => v > ISA_TARGET_PER_HOUR).length;

  return (
    <div style={{
      marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px',
      background: T.bg, border: `1px solid ${T.borderLight}`, borderRadius: T.radiusSm, padding: '12px 16px',
    }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Alarm rate — last 24 h
        </div>
        <div style={{ fontSize: '12px', color: T.textSecondary, marginTop: '2px' }}>
          Peak {peak.toFixed(0)}/hr · {overTarget} h over target
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Alarm rate over the last 24 hours"
        style={{ flex: 1, height: '40px', width: '100%', display: 'block', overflow: 'visible' }}>
        <line x1="0" y1={targetY} x2={W} y2={targetY} style={{ stroke: T.caution }} strokeWidth="0.75" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <path d={area} style={{ fill: T.blue, opacity: 0.12 }} />
        <path d={line} fill="none" style={{ stroke: T.blue }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ flexShrink: 0, fontSize: '10.5px', color: T.caution, fontWeight: 700, whiteSpace: 'nowrap' }}>
        ISA {ISA_TARGET_PER_HOUR}/hr
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   PRIMARY KPI CARD (Level 1)
   ═══════════════════════════════════════════════════════ */
type KpiStatus = 'ok' | 'active' | 'warning' | 'critical' | 'neutral';

const STATUS_STYLES: Record<KpiStatus, { bar: string; valueBg: string; valueColor: string; badgeBg: string; badgeColor: string; badgeBorder: string; label: string }> = {
  ok: {
    bar: T.success, valueBg: T.successBg,
    valueColor: T.success, badgeBg: T.successBg,
    badgeColor: T.success, badgeBorder: T.successBorder, label: 'Normal',
  },
  active: {
    bar: T.blueMid, valueBg: T.blueLight,
    valueColor: T.blue, badgeBg: T.blueLight,
    badgeColor: T.blue, badgeBorder: T.blueMuted, label: 'Active',
  },
  warning: {
    bar: T.caution, valueBg: T.warningBg,
    valueColor: T.warning, badgeBg: T.warningBg,
    badgeColor: T.warning, badgeBorder: T.warningBorder, label: 'Warning',
  },
  critical: {
    bar: T.critical, valueBg: T.criticalBg,
    valueColor: T.critical, badgeBg: T.criticalBg,
    badgeColor: T.critical, badgeBorder: T.criticalBorder, label: 'Critical',
  },
  neutral: {
    bar: T.border, valueBg: T.bg,
    valueColor: T.textPrimary, badgeBg: T.bg,
    badgeColor: T.textSecondary, badgeBorder: T.border, label: '',
  },
};

interface PrimaryKpiProps {
  label: string;
  value: number | string;
  sub?: string;
  status?: KpiStatus;
  icon?: string;
  unit?: string;
  /** When set, the card becomes a button that drills into the alarm console with a filter preset. */
  onClick?: () => void;
}

const PrimaryKpi: React.FC<PrimaryKpiProps> = ({ label, value, sub, status = 'neutral', icon, unit, onClick }) => {
  const s = STATUS_STYLES[status];
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
      title={clickable ? 'Open in the alarm console' : undefined}
      style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      overflow: 'hidden',
      boxShadow: T.shadow,
      transition: 'box-shadow 180ms ease',
      cursor: clickable ? 'pointer' : 'default',
      display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={clickable ? (e) => (e.currentTarget.style.boxShadow = T.shadowHover) : undefined}
      onMouseLeave={clickable ? (e) => (e.currentTarget.style.boxShadow = T.shadow) : undefined}
    >
      {/* Accent bar */}
      <div style={{ height: '3px', background: s.bar, flexShrink: 0 }} />

      <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Label row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: '11.5px', fontWeight: 700, color: T.textSecondary,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            {label}
          </span>
          {icon && (
            <span style={{
              width: '28px', height: '28px', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              background: s.valueBg, borderRadius: '6px',
              fontSize: '13px', color: s.valueColor,
              border: `1px solid ${s.badgeBorder}`,
            }}>
              {icon}
            </span>
          )}
        </div>

        {/* Value */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{
            fontSize: '40px', fontWeight: 700, lineHeight: 1,
            color: s.valueColor,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.02em',
          }}>
            {value}
          </span>
          {unit && (
            <span style={{ fontSize: '13px', color: T.textMuted, fontWeight: 500 }}>{unit}</span>
          )}
        </div>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {sub && (
            <span style={{ fontSize: '12px', color: T.textSecondary, lineHeight: 1.4, flex: 1 }}>
              {sub}
            </span>
          )}
          {status !== 'neutral' && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px',
              borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em',
              background: s.badgeBg, color: s.badgeColor,
              border: `1px solid ${s.badgeBorder}`,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              {s.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SECONDARY KPI (Level 2 — compact)
   ═══════════════════════════════════════════════════════ */
interface SecondaryKpiProps {
  label: string;
  value: number | string;
  status?: KpiStatus;
  sub?: string;
}

const SecondaryKpi: React.FC<SecondaryKpiProps> = ({ label, value, status = 'neutral', sub }) => {
  const s = STATUS_STYLES[status];
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm,
      padding: '14px 16px',
      boxShadow: T.shadow,
      display: 'flex', flexDirection: 'column', gap: '6px',
      borderLeft: `3px solid ${s.bar}`,
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{
        fontSize: '28px', fontWeight: 700, lineHeight: 1,
        color: s.valueColor, fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '11.5px', color: T.textSecondary, lineHeight: 1.3 }}>
          {sub}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   OPERATOR METRIC (inside performance section)
   ═══════════════════════════════════════════════════════ */
const OperatorMetric: React.FC<{
  label: string; value: string; description: string; accentColor: string;
}> = ({ label, value, description, accentColor }) => (
  <div style={{
    background: T.bg,
    border: `1px solid ${T.borderLight}`,
    borderRadius: T.radiusSm,
    padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  }}>
    <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
      {label}
    </div>
    <div style={{ fontSize: '24px', fontWeight: 700, color: accentColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
      {value}
    </div>
    <div style={{ fontSize: '11.5px', color: T.textSecondary, lineHeight: 1.4, marginTop: '2px' }}>
      {description}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════
   PRIORITY DISTRIBUTION
   ═══════════════════════════════════════════════════════ */
const PRIORITY_DEFS = [
  { key: 'totalCritical' as const, label: 'Critical', color: T.critical,  textColor: '#fff' },
  { key: 'totalHigh'     as const, label: 'High',     color: T.caution,   textColor: '#fff' },
  { key: 'totalMedium'   as const, label: 'Medium',   color: 'var(--element-active-color)', textColor: 'var(--on-selected-color, #fff)' },
  { key: 'totalLow'      as const, label: 'Low',      color: 'var(--container-section-color)', textColor: 'var(--element-active-color)' },
];

const PriorityDistribution: React.FC<{ stats: AlarmStats }> = ({ stats }) => {
  const total = PRIORITY_DEFS.reduce((sum, d) => sum + stats[d.key], 0);

  if (total === 0) {
    return (
      <div style={{ padding: '28px 0', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>✓</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: T.success }}>No active alarms</div>
        <div style={{ fontSize: '12.5px', color: T.textSecondary, marginTop: '4px' }}>All processes operating within normal parameters</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Segmented bar */}
      <div style={{
        height: '20px', borderRadius: '6px', overflow: 'hidden',
        display: 'flex', background: T.bg, border: `1px solid ${T.border}`,
      }}>
        {PRIORITY_DEFS.map(d => {
          const count = stats[d.key];
          const pct   = count > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={d.key}
              title={`${d.label}: ${count} (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`, background: d.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10.5px', fontWeight: 700, color: d.textColor,
                transition: 'width 400ms ease',
                minWidth: count > 0 ? '20px' : '0',
              }}
            >
              {pct > 8 ? count : ''}
            </div>
          );
        })}
      </div>

      {/* Detailed legend rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {PRIORITY_DEFS.map(d => {
          const count = stats[d.key];
          const pct   = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={d.key}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 12px',
                background: T.bg,
                border: `1px solid ${T.borderLight}`,
                borderRadius: T.radiusSm,
                borderLeft: `3px solid ${d.color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: T.textPrimary }}>{d.label}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: d.color, fontVariantNumeric: 'tabular-nums' }}>
                  {count}
                </span>
                <span style={{ fontSize: '11px', color: T.textMuted, marginLeft: '4px' }}>
                  {pct > 0 ? `${pct.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   ALARM STATE MATRIX (Level 4)
   ═══════════════════════════════════════════════════════ */
const AlarmStateMatrix: React.FC<{ stats: AlarmStats }> = ({ stats }) => {
  const states = [
    {
      label: 'Active & Unacknowledged',
      value: stats.unacknowledged,
      desc: 'Requires immediate operator attention',
      icon: '⚠',
      color: T.critical,
      bg: T.criticalBg,
      border: T.criticalBorder,
    },
    {
      label: 'Active & Acknowledged',
      value: Math.max(0, stats.totalActive - stats.unacknowledged),
      desc: 'Operator aware, condition persists',
      icon: '✓',
      color: T.caution,
      bg: T.cautionBg,
      border: T.warningBorder,
    },
    {
      label: 'Shelved',
      value: stats.shelved,
      desc: 'Temporary suppression in place',
      icon: '⏸',
      color: T.blueMid,
      bg: T.blueLight,
      border: T.blueMuted,
    },
    {
      label: 'Suppressed by Design',
      value: stats.suppressed,
      desc: 'Filtered by process state rules',
      icon: '🔇',
      color: T.textSecondary,
      bg: T.bg,
      border: T.border,
    },
    {
      label: 'Out of Service',
      value: stats.outOfService || 0,
      desc: 'Monitoring fully disabled',
      icon: '🔧',
      color: (stats.outOfService || 0) > 0 ? T.warning : T.textSecondary,
      bg: (stats.outOfService || 0) > 0 ? T.warningBg : T.bg,
      border: (stats.outOfService || 0) > 0 ? T.warningBorder : T.border,
    },
    {
      label: 'Total Active',
      value: stats.totalActive,
      desc: 'All active alarm conditions',
      icon: '⚑',
      color: T.blue,
      bg: T.blueLight,
      border: T.blueMuted,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      {states.map(st => (
        <div
          key={st.label}
          style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '14px 16px',
            background: st.bg,
            border: `1px solid ${st.border}`,
            borderRadius: T.radiusSm,
          }}
        >
          <div style={{
            width: '40px', height: '40px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.card, border: `1px solid ${st.border}`,
            borderRadius: '8px', fontSize: '18px',
          }}>
            {st.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
              {st.label}
            </div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: st.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {st.value}
            </div>
            <div style={{ fontSize: '11.5px', color: T.textSecondary, marginTop: '3px', lineHeight: 1.3 }}>
              {st.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   SERVER STATUS CARD
   ═══════════════════════════════════════════════════════ */
interface ServerCardProps {
  server: { serverId: string; serverName: string; isConnected: boolean; error: string | null };
}

const ServerCard: React.FC<ServerCardProps> = ({ server }) => {
  const statusColor  = server.isConnected ? T.success  : T.critical;
  const statusBg     = server.isConnected ? T.successBg : T.criticalBg;
  const statusBorder = server.isConnected ? T.successBorder : T.criticalBorder;
  const statusLabel  = server.isConnected ? 'Connected' : 'Disconnected';

  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '14px',
      boxShadow: T.shadow,
      transition: 'box-shadow 180ms ease',
      borderLeft: `3px solid ${statusColor}`,
    }}>
      {/* Status dot */}
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: statusColor,
          boxShadow: server.isConnected ? `0 0 6px ${T.success}` : 'none',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {server.serverName || server.serverId}
        </div>
        {server.serverId !== server.serverName && (
          <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '2px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {server.serverId}
          </div>
        )}
        {!server.isConnected && server.error && (
          <div style={{ fontSize: '11px', color: T.critical, marginTop: '3px', lineHeight: 1.3 }}>
            {server.error}
          </div>
        )}
      </div>

      {/* Status badge */}
      <span style={{
        fontSize: '10.5px', fontWeight: 700, padding: '3px 10px',
        borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.05em',
        background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
        flexShrink: 0,
      }}>
        {statusLabel}
      </span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════ */
const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    padding: '40px 20px', textAlign: 'center',
    color: T.textMuted, fontSize: '13px', lineHeight: 1.6,
  }}>
    <div style={{ fontSize: '28px', marginBottom: '10px', opacity: 0.5 }}>⚡</div>
    {message}
  </div>
);

/* ═══════════════════════════════════════════════════════
   Phase 5 — MQTT STATUS PANEL
   Shows live MQTT connection state + Sparkplug B active
   alarms received via the edge node.
   ═══════════════════════════════════════════════════════ */
import type { LiveAlarm } from '../../store/mqttStore';
import { T } from '../../styles/theme';

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL:   T.critical,
  HIGH:       T.caution,
  MEDIUM:     T.blueMid,
  LOW:        T.textMuted,
  DIAGNOSTIC: T.textMuted,
};

const MqttStatusPanel: React.FC<{
  connected:  boolean;
  error:      string | null;
  liveAlarms: Map<string, LiveAlarm>;
}> = ({ connected, error, liveAlarms }) => {
  const activeCount = [...liveAlarms.values()].filter(a => a.conditionActive).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Connection status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
            background: connected ? T.success : T.critical,
            boxShadow: connected ? `0 0 6px ${T.success}` : 'none',
          }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: connected ? T.success : T.critical }}>
            {connected ? 'Connected to EMQX' : 'Disconnected'}
          </span>
        </div>
        {connected && (
          <span style={{
            fontSize: '11px', padding: '2px 10px', borderRadius: '12px',
            background: T.blueLight, color: T.blue, border: `1px solid ${T.blueMuted}`,
            fontWeight: 600,
          }}>
            spBv1.0/ams_site1 · Sparkplug B
          </span>
        )}
        {activeCount > 0 && (
          <span style={{
            fontSize: '11px', padding: '2px 10px', borderRadius: '12px',
            background: T.criticalBg, color: T.critical, border: `1px solid ${T.criticalBorder}`,
            fontWeight: 700,
          }}>
            {activeCount} live alarm{activeCount !== 1 ? 's' : ''}
          </span>
        )}
        {error && (
          <span style={{ fontSize: '12px', color: T.critical }}>{error}</span>
        )}
      </div>

      {/* Live alarms table */}
      {liveAlarms.size === 0 ? (
        <div style={{
          padding: '20px', textAlign: 'center',
          color: T.textMuted, fontSize: '12.5px',
          background: T.bg, borderRadius: T.radiusSm,
          border: `1px dashed ${T.border}`,
        }}>
          {connected
            ? 'Waiting for Sparkplug B DDATA messages from edge node...'
            : 'Connect to EMQX to receive live alarm stream.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[...liveAlarms.values()].slice(0, 10).map(alarm => (
            <div key={alarm.alarmId} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              background: T.card, border: `1px solid ${T.border}`,
              borderRadius: T.radiusSm,
              borderLeft: `3px solid ${PRIORITY_COLOR[alarm.priority] ?? T.border}`,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: alarm.conditionActive ? (PRIORITY_COLOR[alarm.priority] ?? T.border) : T.success,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: T.textPrimary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {alarm.sourceName || alarm.alarmId}
                </span>
                {alarm.conditionName && (
                  <span style={{ fontSize: '11px', color: T.textSecondary }}>{alarm.conditionName}</span>
                )}
              </div>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '2px 8px',
                borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '0.04em',
                background: alarm.state === 'CLEARED'       ? T.successBg
                           : alarm.state === 'ACKNOWLEDGED'  ? T.blueLight
                           : T.criticalBg,
                color: alarm.state === 'CLEARED'       ? T.success
                     : alarm.state === 'ACKNOWLEDGED'  ? T.blue
                     : T.critical,
              }}>
                {alarm.state || 'ACTIVE'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: PRIORITY_COLOR[alarm.priority] ?? T.textMuted, minWidth: '28px', textAlign: 'right' }}>
                {alarm.severity > 0 ? alarm.severity : '—'}
              </span>
              <span style={{ fontSize: '11px', color: T.textMuted, minWidth: '55px', textAlign: 'right' }}>
                {new Date(alarm.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
          {liveAlarms.size > 10 && (
            <div style={{ fontSize: '12px', color: T.textMuted, textAlign: 'center', padding: '6px' }}>
              +{liveAlarms.size - 10} more live alarms
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
