'use client';

import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useQuery } from '@tanstack/react-query';
import { authedAxios } from '../../api/http';
import { useAlarmStore } from '../../store/alarmStore';

/* ─────────────────────────────────────────
   Shared design tokens (mirrors Dashboard)
   ───────────────────────────────────────── */
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

/* ECharts shared light-theme axis / grid defaults */
const CHART_AXIS_STYLE = {
  axisLine:  { lineStyle: { color: T.border } },
  axisLabel: { color: T.textSecondary, fontSize: 11 },
  axisTick:  { lineStyle: { color: T.border } },
  splitLine: { lineStyle: { color: T.borderLight, type: 'solid' as const } },
};

interface AnalyticsKpiResponse {
  hourlyRates?: Array<{ hour?: string; count?: number; rate?: number }>;
  chatteringCount?: number;
  fleetingCount?: number;
  top10ContributionPercent?: number;
  badActors?: Array<{ sourceName: string; alarmCount?: number; count?: number }>;
  staleAlarmCount?: number;
  totalAlarms24h?: number;
  priorities?: Array<{ priority: string; count: number }>;
  // Phase 8 (N18) — EEMUA-191 / ISA-18.2 KPIs served by analytics when available (else derived/—).
  peakAlarmRate?: number;
  timeInFloodPercent?: number;
  alarmsPerShift?: number;
  meanTimeToAckSec?: number;
  meanTimeToRespondMin?: number;
  operatorCompliancePercent?: number;
  falseAlarmRatePercent?: number;
}

const fetchAnalytics = async () => {
  // H2: authedAxios (401 replay); skipActivity because this query re-fires on a
  // 60s interval — a parked Analytics tab must not keep the session alive.
  const res = await authedAxios.get<AnalyticsKpiResponse>('/api/v1/analytics/kpi', {
    skipActivity: true,
  });
  const raw = res.data;

  const badActors = (raw.badActors ?? []).map(a => {
    const count = a.alarmCount ?? a.count ?? 0;
    return { sourceName: a.sourceName, count, alarmCount: count };
  });
  const badActorTotal = badActors.reduce((sum, a) => sum + a.count, 0);

  return {
    ...raw,
    hourlyRates: raw.hourlyRates ?? [],
    badActors: badActors.map(a => ({
      ...a,
      percentage: badActorTotal > 0 ? (a.count / badActorTotal) * 100 : 0,
    })),
  };
};

const Analytics: React.FC = () => {
  const stats = useAlarmStore(s => s.stats);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alarmAnalytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60000,
  });

  // Phase 8 (N18) — drive the EEMUA/ISA-18.2 KPIs from live data (served value first, then a value
  // derived from what the API DOES return), instead of the former hardcoded literals. Anything with no
  // real source renders '—' rather than a fabricated number.
  const rates = (data?.hourlyRates ?? []).map(h => h.rate ?? h.count ?? 0);
  const fmt1 = (n?: number) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(1));
  const fmt0 = (n?: number) => (n == null || Number.isNaN(n) ? '—' : String(Math.round(n)));
  const kpi = {
    peakAlarmRate: data?.peakAlarmRate ?? (rates.length ? Math.max(...rates) : undefined),
    timeInFlood: data?.timeInFloodPercent,
    alarmsPerShift: data?.alarmsPerShift ?? (data?.totalAlarms24h != null ? data.totalAlarms24h / 2 : undefined),
    mtta: data?.meanTimeToAckSec,
    mttr: data?.meanTimeToRespondMin,
    compliance: data?.operatorCompliancePercent,
    falseAlarmRate: data?.falseAlarmRatePercent,
  };

  // G: was a dead button with no onClick. Exports the KPIs currently on screen
  // as a JSON file client-side — a real action, no new endpoint, no token leak.
  const handleExport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      standard: 'ISA-18.2 / EEMUA-191',
      liveStats: stats,
      kpis: data ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ams-analytics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', padding: '4px 0' }}>

      {/* ── HEADER ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Alarm Performance Analytics
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '6px 0 0' }}>
            ISA-18.2 / EEMUA 191 — Operator and system effectiveness tracking
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!data}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.card, color: T.blue,
            border: `1.5px solid ${T.blue}`, borderRadius: T.radiusSm,
            padding: '9px 20px', fontSize: '13px', fontWeight: 600,
            cursor: data ? 'pointer' : 'not-allowed', fontFamily: 'inherit', flexShrink: 0,
            opacity: data ? 1 : 0.6, transition: 'background 140ms ease',
          }}
          onMouseEnter={e => data && (e.currentTarget.style.background = T.blueLight)}
          onMouseLeave={e => (e.currentTarget.style.background = T.card)}
        >
          ↓ Export ISA-18.2 Report
        </button>
      </div>

      {/* ── 1. Alarm Load ──────────────────────────── */}
      <AnalyticsSection
        number="1"
        title="Alarm Load & Shift KPIs"
        description="Measuring alarm volume against ISA-18.2 performance targets"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
          <TargetKpi label="Average Alarm Rate" value={stats.alarmsPerTenMin.toFixed(1)} unit="/ 10 min"
            target="Target ≤ 1.0 / 10 min (ISA-18.2)"
            status={stats.alarmsPerTenMin <= 2.0 ? 'pass' : 'fail'} />
          <TargetKpi label="Peak Alarm Rate"   value={fmt1(kpi.peakAlarmRate)}   unit="/ 10 min" target="Max burst threshold"
            status={kpi.peakAlarmRate == null ? 'info' : kpi.peakAlarmRate > 10 ? 'fail' : 'warn'} />
          <TargetKpi label="Time in Flood"      value={fmt1(kpi.timeInFlood)}  unit="%"        target="Target < 1% of time"
            status={kpi.timeInFlood == null ? 'info' : kpi.timeInFlood < 1 ? 'pass' : 'warn'} />
          <TargetKpi label="Alarms / Shift"     value={fmt0(kpi.alarmsPerShift)}                target="Day vs Night tracking" status="info" />
        </div>
        <ChartCard title="Alarm Rate vs Target — Last 24 Hours">
          <AlarmRateChart
            data={data?.hourlyRates}
            loading={isLoading}
            error={isError}
            totalAlarms24h={data?.totalAlarms24h}
          />
        </ChartCard>
      </AnalyticsSection>

      {/* ── 2. Operator Response ───────────────────── */}
      <AnalyticsSection
        number="2"
        title="Operator Response & Effectiveness"
        description="Response times, acknowledgment compliance, and operator SOP adherence"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          <TargetKpi label="Mean Time to Ack (MTTA)"   value={fmt1(kpi.mtta)} unit="s"  target="Target < 30s"
            status={kpi.mtta == null ? 'info' : kpi.mtta < 30 ? 'pass' : 'warn'} />
          <TargetKpi label="Mean Time to Respond"       value={fmt1(kpi.mttr)}  unit="m"  target="Correct action time"  status="info" />
          <TargetKpi label="Operator Compliance"        value={fmt0(kpi.compliance)}   unit="%"  target="SOP Adherence > 95%"
            status={kpi.compliance == null ? 'info' : kpi.compliance >= 95 ? 'pass' : 'warn'} />
          <TargetKpi label="Unacknowledged Active"      value={stats.unacknowledged} target="Target 0"
            status={stats.unacknowledged === 0 ? 'pass' : 'warn'} />
        </div>
      </AnalyticsSection>

      {/* ── 3. Alarm Quality ───────────────────────── */}
      <AnalyticsSection
        number="3"
        title="Alarm Quality & Nuisance Metrics"
        description="Chattering, fleeting, and false alarm identification for rationalization"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
          {/* H5: no invented fallbacks — while the API hasn't answered these render '—'. */}
          <TargetKpi label="Chattering Alarms"    value={fmt0(data?.chatteringCount)}
            target="Rapid ON/OFF — Target 0"
            status={data?.chatteringCount == null ? 'info' : data.chatteringCount === 0 ? 'pass' : 'fail'} />
          <TargetKpi label="Fleeting Alarms"      value={fmt0(data?.fleetingCount)}
            target="Target < 5% of total"
            status={data?.fleetingCount == null ? 'info' : data.fleetingCount < 20 ? 'pass' : 'warn'} />
          <TargetKpi label="Top 10 Contribution"  value={fmt1(data?.top10ContributionPercent)} unit="%"
            target="Target < 5% of alarms"
            status={data?.top10ContributionPercent == null ? 'info' : data.top10ContributionPercent < 5 ? 'pass' : 'fail'} />
          <TargetKpi label="False Alarm Rate"     value={fmt1(kpi.falseAlarmRate)} unit="%" target="Target < 1%"
            status={kpi.falseAlarmRate == null ? 'info' : kpi.falseAlarmRate < 1 ? 'pass' : 'warn'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <ChartCard title="Priority Distribution (Donut)">
            <PriorityDonutChart data={data?.priorities} />
          </ChartCard>
          <ChartCard title="Alarm Bad Behaviours">
            <BadBehavioursChart
              chattering={data?.chatteringCount}
              fleeting={data?.fleetingCount}
              stale={data?.staleAlarmCount}
              standing={stats.totalActive}
            />
          </ChartCard>
        </div>

        <ChartCard title="Top 10 Bad Actors — Last 7 Days">
          <BadActorsTable data={data?.badActors} />
        </ChartCard>
      </AnalyticsSection>

      {/* ── 4. Standing & System ───────────────────── */}
      <AnalyticsSection
        number="4"
        title="Standing, Safety & System Performance"
        description="Long-standing alarms, safety latency, and data integrity"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
          <TargetKpi label="Stale Alarms"         value={fmt0(data?.staleAlarmCount)}  target="> 24 h standing"        status={data?.staleAlarmCount == null ? 'info' : data.staleAlarmCount < 5 ? 'pass' : 'warn'} />
          <TargetKpi label="Standing Alarms"      value={stats.totalActive}             target="Total active"           status={stats.totalActive < 10 ? 'pass' : 'warn'} />
          <TargetKpi label="Suppressed / Shelved" value={stats.suppressed + stats.shelved} target="Review manually"    status="info" />
          {/* H5: these two were hardcoded literals stamped 'pass' — no metric exists yet. */}
          <TargetKpi label="Safety Latency"       value="—"                             target="Not instrumented yet"  status="info" />
          <TargetKpi label="System Data Loss"     value="—"                             target="Not instrumented yet"  status="info" />
        </div>
      </AnalyticsSection>

      {/* ── 5. Drill-Down ──────────────────────────── */}
      <AnalyticsSection
        number="5"
        title="Drill-Down & RCA Explorer"
        description="Sortable grid for root-cause analysis and corrective action planning"
      >
        <DrillDownTable data={data?.badActors || []} />
      </AnalyticsSection>

    </div>
  );
};

/* ═══════════════════════════════════════
   ANALYTICS SECTION WRAPPER
   ═══════════════════════════════════════ */
const AnalyticsSection: React.FC<{
  number: string; title: string; description: string; children: React.ReactNode;
}> = ({ number, title, description, children }) => (
  <div style={{
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: '22px 24px',
    boxShadow: T.shadow,
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
      <div style={{
        width: '32px', height: '32px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.blueLight, border: `1.5px solid ${T.blueMuted}`,
        borderRadius: '8px', fontSize: '13px', fontWeight: 800, color: T.blue,
      }}>
        {number}
      </div>
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: T.textPrimary, margin: 0, lineHeight: 1.3 }}>
          {title}
        </h3>
        <p style={{ fontSize: '12.5px', color: T.textSecondary, margin: '3px 0 0' }}>
          {description}
        </p>
      </div>
    </div>
    {children}
  </div>
);

/* ═══════════════════════════════════════
   TARGET KPI CARD
   ═══════════════════════════════════════ */
type TargetStatus = 'pass' | 'warn' | 'fail' | 'info';

const STATUS_MAP: Record<TargetStatus, {
  valueColor: string; badgeBg: string; badgeColor: string;
  badgeBorder: string; badgeLabel: string; barColor: string;
}> = {
  pass: { valueColor: T.success,  badgeBg: T.successBg,  badgeColor: T.success,  badgeBorder: T.successBorder, badgeLabel: 'On Target', barColor: T.success },
  warn: { valueColor: T.warning,  badgeBg: T.warningBg,  badgeColor: T.warning,  badgeBorder: T.warningBorder, badgeLabel: 'Warning',   barColor: T.caution },
  fail: { valueColor: T.critical, badgeBg: T.criticalBg, badgeColor: T.critical, badgeBorder: T.criticalBorder, badgeLabel: 'Exceeds',  barColor: T.critical },
  info: { valueColor: T.blue,     badgeBg: T.blueLight,  badgeColor: T.blue,     badgeBorder: T.blueMuted,      badgeLabel: 'Tracking', barColor: T.blue },
};

const TargetKpi: React.FC<{
  label: string; value: string | number; target: string;
  status: TargetStatus; unit?: string;
}> = ({ label, value, target, status, unit }) => {
  const s = STATUS_MAP[status];
  return (
    <div style={{
      background: T.card,
      border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm,
      overflow: 'hidden',
      boxShadow: T.shadow,
    }}>
      <div style={{ height: '3px', background: s.barColor }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
          <span style={{ fontSize: '32px', fontWeight: 700, color: s.valueColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
          {unit && <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: 500 }}>{unit}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <span style={{ fontSize: '11.5px', color: T.textSecondary, lineHeight: 1.3, flex: 1 }}>{target}</span>
          <span style={{
            fontSize: '10px', fontWeight: 700, padding: '2px 7px',
            borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em',
            background: s.badgeBg, color: s.badgeColor, border: `1px solid ${s.badgeBorder}`,
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>
            {s.badgeLabel}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   CHART CARD WRAPPER
   ═══════════════════════════════════════ */
const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: T.radiusSm,
    padding: '16px 18px',
  }}>
    <h4 style={{
      fontSize: '12px', fontWeight: 700, color: T.textSecondary,
      textTransform: 'uppercase', letterSpacing: '0.07em',
      margin: '0 0 14px', paddingBottom: '10px',
      borderBottom: `1.5px solid ${T.border}`,
    }}>
      {title}
    </h4>
    {children}
  </div>
);

/* ═══════════════════════════════════════
   ALARM RATE BAR CHART
   ═══════════════════════════════════════ */
interface HourlyRatePoint { hour?: string; count?: number; rate?: number; }

function buildHourlySeries(data?: HourlyRatePoint[]) {
  const bucketMap = new Map<number, number>();
  for (const item of data ?? []) {
    if (!item.hour) continue;
    const bucketMs = new Date(item.hour).setMinutes(0, 0, 0);
    bucketMap.set(bucketMs, item.count ?? item.rate ?? 0);
  }

  const labels: string[] = [];
  const values: number[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(d.getHours() - i);
    labels.push(`${String(d.getHours()).padStart(2, '0')}:00`);
    values.push(bucketMap.get(d.getTime()) ?? 0);
  }

  return { labels, values, hasData: values.some(v => v > 0) };
}

const AlarmRateChart: React.FC<{
  data?: HourlyRatePoint[];
  loading?: boolean;
  error?: boolean;
  totalAlarms24h?: number;
}> = ({ data, loading, error, totalAlarms24h }) => {
  const { labels, values, hasData } = useMemo(() => buildHourlySeries(data), [data]);

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(49,89,143,0.06)' } },
      backgroundColor: T.card,
      borderColor: T.border,
      borderWidth: 1,
      textStyle: { color: T.textPrimary, fontSize: 12 },
      formatter: (params: Array<{ axisValue: string; value: number }>) => {
        const p = params[0];
        return `${p.axisValue}<br/><strong>${p.value}</strong> alarms`;
      },
    },
    grid: { left: 48, right: 24, top: 24, bottom: 36 },
    xAxis: {
      type: 'category', data: labels,
      ...CHART_AXIS_STYLE,
    },
    yAxis: {
      type: 'value', name: 'Alarms / hr', min: 0,
      nameTextStyle: { color: T.textMuted, fontSize: 11, padding: [0, 0, 0, 0] },
      ...CHART_AXIS_STYLE,
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: values,
      barMaxWidth: 28,
      itemStyle: {
        color: (p: { value: number }) =>
          p.value > 12 ? T.critical
          : p.value > 6  ? T.caution
          : T.blue,
        borderRadius: [3, 3, 0, 0],
      },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 6,  name: 'ISA Target', lineStyle: { color: T.success,  type: 'dashed', width: 1.5 } },
          { yAxis: 12, name: 'Max',         lineStyle: { color: T.critical, type: 'dashed', width: 1.5 } },
        ],
        label: { position: 'end', color: T.textSecondary, fontSize: 10, formatter: '{b}' },
      },
    }],
  }), [labels, values]);

  if (loading) {
    return (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: '13px' }}>
        Loading hourly alarm rates…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.critical, fontSize: '13px' }}>
        Failed to load analytics data from /api/v1/analytics/kpi
      </div>
    );
  }

  if (!hasData) {
    return (
      <div style={{
        height: 320, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '10px',
        background: T.bg, borderRadius: T.radiusSm,
        border: `1px dashed ${T.border}`,
      }}>
        <div style={{ fontSize: '28px' }}>📊</div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: T.textSecondary }}>
          No alarm history in the last 24 hours
        </div>
        <div style={{ fontSize: '12.5px', color: T.textMuted, textAlign: 'center', maxWidth: '380px' }}>
          The API is responding, but there are no alarms in the last 24 hours
          ({totalAlarms24h ?? 0} total). Historical alarm events will populate this chart automatically.
        </div>
      </div>
    );
  }

  return <ReactECharts option={option} style={{ height: 320 }} />;
};

/* ═══════════════════════════════════════
   PRIORITY DONUT CHART
   ═══════════════════════════════════════ */
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: T.critical, HIGH: T.caution, MEDIUM: T.blue, LOW: T.blueMuted,
};

// H5: was a hardcoded 12/45/120/240 donut that ignored its prop. It now renders
// the server's live per-priority counts, and says so when there are none.
const PriorityDonutChart: React.FC<{ data?: Array<{ priority: string; count: number }> }> = ({ data }) => {
  const slices = (data ?? [])
    .filter(p => p.count > 0)
    .map(p => ({
      value: p.count,
      name: p.priority.charAt(0) + p.priority.slice(1).toLowerCase(),
      itemStyle: { color: PRIORITY_COLORS[p.priority.toUpperCase()] ?? T.blueMuted },
    }));

  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: T.card, borderColor: T.border, borderWidth: 1,
      textStyle: { color: T.textPrimary, fontSize: 12 },
    },
    legend: {
      top: '4%', left: 'center',
      textStyle: { color: T.textSecondary, fontSize: 11 },
      itemWidth: 10, itemHeight: 10,
    },
    series: [{
      name: 'Priority', type: 'pie',
      radius: ['42%', '68%'], center: ['50%', '58%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 4, borderColor: T.card, borderWidth: 2 },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 13, fontWeight: 700, color: T.textPrimary },
        itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.12)' },
      },
      data: slices,
    }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [JSON.stringify(slices)]);

  if (slices.length === 0) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: 13 }}>
        No active alarms to distribute.
      </div>
    );
  }
  return <ReactECharts option={option} style={{ height: 260 }} />;
};

/* ═══════════════════════════════════════
   BAD BEHAVIOURS HORIZONTAL BAR
   ═══════════════════════════════════════ */
const BAD_BEHAVIOUR_COLORS = [T.critical, T.caution, T.warning, T.blue];

// H5: was a hardcoded 34/89/12/156 bar. Chattering/fleeting/stale come from the
// analytics API; standing is the live active count from the alarm store.
const BadBehavioursChart: React.FC<{
  chattering?: number; fleeting?: number; stale?: number; standing?: number;
}> = ({ chattering, fleeting, stale, standing }) => {
  const values = [chattering, fleeting, stale, standing];
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(49,89,143,0.06)' } },
      backgroundColor: T.card, borderColor: T.border, borderWidth: 1,
      textStyle: { color: T.textPrimary, fontSize: 12 },
    },
    grid: { left: 90, right: 48, top: 12, bottom: 16 },
    xAxis: {
      type: 'value',
      ...CHART_AXIS_STYLE,
      axisLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: ['Chattering', 'Fleeting', 'Stale', 'Standing'],
      ...CHART_AXIS_STYLE,
      axisLine: { show: false },
    },
    series: [{
      name: 'Count', type: 'bar',
      barMaxWidth: 20,
      data: values.map((v, i) => ({
        value: v ?? 0,
        itemStyle: { color: BAD_BEHAVIOUR_COLORS[i], borderRadius: [0, 3, 3, 0] },
      })),
      label: { show: true, position: 'right', fontSize: 11, color: T.textSecondary },
    }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [chattering, fleeting, stale, standing]);

  if (values.every(v => v == null)) {
    return (
      <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: 13 }}>
        Waiting for analytics data…
      </div>
    );
  }
  return <ReactECharts option={option} style={{ height: 260 }} />;
};

/* ═══════════════════════════════════════
   BAD ACTORS TABLE
   ═══════════════════════════════════════ */
const BadActorsTable: React.FC<{ data?: Array<{ sourceName: string; count: number; percentage: number }> }> = ({ data }) => (
  <div style={{ overflowY: 'auto', maxHeight: 240, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
      <thead>
        <tr style={{ background: T.bg, position: 'sticky', top: 0 }}>
          {['#', 'Source / Tag', 'Count', '% Contribution', 'Suggested Action'].map(h => (
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
        {(data || []).map((a, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}` }}
            onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
            onMouseLeave={e => (e.currentTarget.style.background = T.card)}
          >
            <td style={{ padding: '9px 14px', color: T.textMuted, width: 32 }}>{i + 1}</td>
            <td style={{ padding: '9px 14px', fontFamily: "'Noto Sans Mono', monospace", fontWeight: 600, color: T.textPrimary }}>
              {a.sourceName}
            </td>
            <td style={{ padding: '9px 14px', fontWeight: 700, color: T.textPrimary }}>{a.count}</td>
            <td style={{ padding: '9px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, background: T.bg, height: 6, borderRadius: 4, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  <div style={{ width: `${Math.min(a.percentage * 10, 100)}%`, background: T.blue, height: '100%', borderRadius: 4 }} />
                </div>
                <span style={{ width: 44, textAlign: 'right', fontWeight: 600, color: T.blue }}>{a.percentage?.toFixed(1)}%</span>
              </div>
            </td>
            <td style={{ padding: '9px 14px', color: T.textSecondary, fontSize: '12px' }}>
              {a.count > 500 ? 'Apply 5s ON-delay' : 'Review setpoint'}
            </td>
          </tr>
        ))}
        {(!data || data.length === 0) && (
          <tr>
            <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: T.textMuted, fontSize: '13px' }}>
              No bad actor data available. API data will appear here.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

/* ═══════════════════════════════════════
   DRILL-DOWN TABLE (RCA Explorer)
   ═══════════════════════════════════════ */
type SortKey = 'sourceName' | 'count' | 'percentage' | 'mtta' | 'action';
type SortDir = 'asc' | 'desc';

interface RcaRow { sourceName: string; count: number; percentage: number; priorityMix: string; mtta: string; action: string; }

const DrillDownTable: React.FC<{ data: Array<{ sourceName?: string; count?: number; percentage?: number }> }> = ({ data }) => {
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page,    setPage]    = useState(0);
  const [search,  setSearch]  = useState('');
  const PAGE_SIZE = 10;

  // H5: rows come ONLY from the API. priorityMix/MTTA per source are not served
  // yet, so they render '—' instead of the fabricated values they used to show.
  const rows: RcaRow[] = data.map(d => {
    const count = d.count ?? (d as { alarmCount?: number }).alarmCount ?? 0;
    return {
      sourceName:  d.sourceName ?? '—',
      count,
      percentage:  d.percentage ?? 0,
      priorityMix: '—',
      mtta:        '—',
      action:      count > 500 ? 'Apply 5s ON-delay' : 'Review setpoint',
    };
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? rows.filter(r => r.sourceName.toLowerCase().includes(q) || r.action.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const pageRows   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
    setPage(0);
  };

  const SortTh: React.FC<{ k: SortKey; label: string; align?: 'right' | 'left' }> = ({ k, label, align = 'left' }) => (
    <th
      onClick={() => toggleSort(k)}
      style={{
        padding: '11px 14px', textAlign: align,
        fontSize: '10.5px', fontWeight: 700, color: sortKey === k ? T.blue : T.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        borderBottom: `1.5px solid ${T.border}`,
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        background: sortKey === k ? T.blueLight : T.bg,
        transition: 'background 120ms ease',
      }}
    >
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <span style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted, fontSize: '13px' }}>🔍</span>
          <input
            type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Filter by tag or action…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', fontSize: '13px',
              border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
              background: T.card, color: T.textPrimary, fontFamily: 'inherit',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <span style={{ fontSize: '12px', color: T.textMuted, flexShrink: 0 }}>
          {filtered.length} tags · showing {Math.min(page * PAGE_SIZE + 1, filtered.length)}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}
        </span>
      </div>

      {/* Table */}
      <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
            <thead>
              <tr>
                <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`, background: T.bg, width: '32px' }}>#</th>
                <SortTh k="sourceName"  label="Tag / Source" />
                <SortTh k="count"       label="Alarm Count"  align="right" />
                <SortTh k="percentage"  label="% Total"      align="right" />
                <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`, background: T.bg }}>Priority Mix</th>
                <SortTh k="mtta"        label="MTTA Avg" />
                <SortTh k="action"      label="Suggested Action" />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: T.textMuted, fontSize: '13px' }}>
                    No bad-actor data yet — rows appear when the analytics API reports alarm sources.
                  </td>
                </tr>
              )}
              {pageRows.map((r, i) => (
                <tr
                  key={r.sourceName}
                  style={{ borderBottom: `1px solid ${T.borderLight}`, background: T.card }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                  onMouseLeave={e => (e.currentTarget.style.background = T.card)}
                >
                  <td style={{ padding: '10px 14px', color: T.textMuted, fontSize: '11px' }}>
                    {page * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '10px 14px', fontFamily: "'Noto Sans Mono', monospace", fontWeight: 600, color: T.textPrimary, fontSize: '12px' }}>
                    {r.sourceName}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                    {r.count.toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <div style={{ width: '60px', height: '5px', background: T.bg, borderRadius: 4, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(r.percentage * 10, 100)}%`, height: '100%', background: r.percentage > 5 ? T.critical : T.blue, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontWeight: 600, color: r.percentage > 5 ? T.critical : T.blue, minWidth: '38px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: T.textSecondary, fontSize: '12px' }}>{r.priorityMix}</td>
                  <td style={{ padding: '10px 14px', fontFamily: "'Noto Sans Mono', monospace", fontWeight: 600, color: T.blue, fontSize: '12px' }}>
                    {r.mtta}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 9px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 600,
                      background: r.action.includes('ON-delay') ? T.criticalBg : r.action.includes('setpoint') ? T.warningBg : T.blueLight,
                      color: r.action.includes('ON-delay') ? T.critical : r.action.includes('setpoint') ? T.warning : T.blue,
                    }}>
                      {r.action}
                    </span>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: T.textMuted }}>No matching records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          <PaginationBtn onClick={() => setPage(p => p - 1)} disabled={page === 0}>← Prev</PaginationBtn>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} style={{
              minWidth: '32px', height: '32px', padding: '0 8px',
              borderRadius: '6px', border: `1.5px solid ${i === page ? T.blue : T.border}`,
              background: i === page ? T.blue : T.card,
              color: i === page ? '#fff' : T.textSecondary,
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {i + 1}
            </button>
          ))}
          <PaginationBtn onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next →</PaginationBtn>
        </div>
      )}
    </div>
  );
};

const PaginationBtn: React.FC<{ onClick: () => void; disabled: boolean; children: React.ReactNode }> = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '6px 14px', fontSize: '12px', fontWeight: 600,
    borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${disabled ? T.borderLight : T.border}`,
    background: disabled ? T.bg : T.card, color: disabled ? T.textMuted : T.textSecondary,
  }}>
    {children}
  </button>
);

export default Analytics;
