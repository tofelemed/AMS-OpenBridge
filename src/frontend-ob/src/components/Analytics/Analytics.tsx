'use client';

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAlarmStore } from '../../store/alarmStore';
import { getAuthToken } from '../../api/auth';

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

const fetchAnalytics = async () => {
  const res = await axios.get('/api/v1/analytics/kpi', {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  return res.data;
};

const Analytics: React.FC = () => {
  const stats = useAlarmStore(s => s.stats);

  const { data } = useQuery({
    queryKey: ['alarmAnalytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60000,
  });

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
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: T.card, color: T.blue,
            border: `1.5px solid ${T.blue}`, borderRadius: T.radiusSm,
            padding: '9px 20px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            transition: 'background 140ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
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
          <TargetKpi label="Peak Alarm Rate"   value="14"   unit="/ 10 min" target="Max burst threshold"   status="fail" />
          <TargetKpi label="Time in Flood"      value="1.2"  unit="%"        target="Target < 1% of time"  status="warn" />
          <TargetKpi label="Alarms / Shift"     value="142"                  target="Day vs Night tracking" status="info" />
        </div>
        <ChartCard title="Alarm Rate vs Target — Last 24 Hours">
          <AlarmRateChart data={data?.hourlyRates} />
        </ChartCard>
      </AnalyticsSection>

      {/* ── 2. Operator Response ───────────────────── */}
      <AnalyticsSection
        number="2"
        title="Operator Response & Effectiveness"
        description="Response times, acknowledgment compliance, and operator SOP adherence"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          <TargetKpi label="Mean Time to Ack (MTTA)"   value="12.4" unit="s"  target="Target < 30s"         status="pass" />
          <TargetKpi label="Mean Time to Respond"       value="2.5"  unit="m"  target="Correct action time"  status="info" />
          <TargetKpi label="Operator Compliance"        value="94"   unit="%"  target="SOP Adherence > 95%"  status="warn" />
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
          <TargetKpi label="Chattering Alarms"    value={data?.chatteringCount ?? 34}
            target="Rapid ON/OFF — Target 0"
            status={(data?.chatteringCount ?? 34) === 0 ? 'pass' : 'fail'} />
          <TargetKpi label="Fleeting Alarms"      value={data?.fleetingCount ?? 89}
            target="Target < 5% of total"
            status={(data?.fleetingCount ?? 89) < 20 ? 'pass' : 'warn'} />
          <TargetKpi label="Top 10 Contribution"  value={`${data?.top10ContributionPercent?.toFixed(1) ?? '28.5'}`} unit="%"
            target="Target < 5% of alarms"
            status={(data?.top10ContributionPercent ?? 28.5) < 5 ? 'pass' : 'fail'} />
          <TargetKpi label="False Alarm Rate"     value="3.1" unit="%" target="Target < 1%" status="warn" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <ChartCard title="Priority Distribution (Donut)">
            <PriorityDonutChart data={data?.priorities} />
          </ChartCard>
          <ChartCard title="Alarm Bad Behaviours">
            <BadBehavioursChart />
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
          <TargetKpi label="Stale Alarms"         value={data?.staleAlarmCount ?? 12}  target="> 24 h standing"        status={(data?.staleAlarmCount ?? 12) < 5 ? 'pass' : 'warn'} />
          <TargetKpi label="Standing Alarms"      value={stats.totalActive}             target="Total active"           status={stats.totalActive < 10 ? 'pass' : 'warn'} />
          <TargetKpi label="Suppressed / Shelved" value={stats.suppressed + stats.shelved} target="Review manually"    status="info" />
          <TargetKpi label="Safety Latency"       value="12" unit="ms"                  target="Target < 100 ms"       status="pass" />
          <TargetKpi label="System Data Loss"     value="0"  unit="%"                   target="Network reliability"   status="pass" />
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
const AlarmRateChart: React.FC<{ data?: Array<{ rate: number }> }> = ({ data }) => {
  const option = useMemo(() => {
    const hours  = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const values = data ? data.map(d => d.rate) : Array.from({ length: 24 }, () => Math.random() * 15);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(49,89,143,0.06)' } },
        backgroundColor: T.card,
        borderColor: T.border,
        borderWidth: 1,
        textStyle: { color: T.textPrimary, fontSize: 12 },
      },
      grid: { left: 48, right: 24, top: 24, bottom: 36 },
      xAxis: {
        type: 'category', data: hours,
        ...CHART_AXIS_STYLE,
      },
      yAxis: {
        type: 'value', name: 'Alarms / hr',
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
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 320 }} />;
};

/* ═══════════════════════════════════════
   PRIORITY DONUT CHART
   ═══════════════════════════════════════ */
const PriorityDonutChart: React.FC<{ data?: unknown }> = ({ data: _ }) => {
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
      data: [
        { value: 12,  name: 'Critical', itemStyle: { color: T.critical } },
        { value: 45,  name: 'High',     itemStyle: { color: T.caution } },
        { value: 120, name: 'Medium',   itemStyle: { color: T.blue } },
        { value: 240, name: 'Low',      itemStyle: { color: T.blueMuted } },
      ],
    }],
  }), []);

  return <ReactECharts option={option} style={{ height: 260 }} />;
};

/* ═══════════════════════════════════════
   BAD BEHAVIOURS HORIZONTAL BAR
   ═══════════════════════════════════════ */
const BAD_BEHAVIOUR_COLORS = [T.critical, T.caution, T.warning, T.blue];

const BadBehavioursChart: React.FC = () => {
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
      data: [
        { value: 34,  itemStyle: { color: BAD_BEHAVIOUR_COLORS[0], borderRadius: [0, 3, 3, 0] } },
        { value: 89,  itemStyle: { color: BAD_BEHAVIOUR_COLORS[1], borderRadius: [0, 3, 3, 0] } },
        { value: 12,  itemStyle: { color: BAD_BEHAVIOUR_COLORS[2], borderRadius: [0, 3, 3, 0] } },
        { value: 156, itemStyle: { color: BAD_BEHAVIOUR_COLORS[3], borderRadius: [0, 3, 3, 0] } },
      ],
      label: { show: true, position: 'right', fontSize: 11, color: T.textSecondary },
    }],
  }), []);

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
   DRILL-DOWN AG GRID TABLE
   ═══════════════════════════════════════ */
const DrillDownTable: React.FC<{ data: Array<{ sourceName?: string; count?: number; percentage?: number }> }> = ({ data }) => {
  const columnDefs = useMemo<ColDef[]>(() => [
    { field: 'sourceName',  headerName: 'Tag / Source',       flex: 2, filter: true },
    { field: 'count',       headerName: 'Alarm Count',         flex: 1, sortable: true },
    { field: 'percentage',  headerName: '% Contribution',      flex: 1, valueFormatter: (p: { value: number }) => `${p.value?.toFixed(1)}%` },
    { headerName: 'Priority Mix',    flex: 2, cellRenderer: () => 'High (40%) / Medium (60%)' },
    { headerName: 'MTTA (Avg)',       flex: 1, cellRenderer: () => '14.2s' },
    { headerName: 'Suggested Action', flex: 2,
      cellRenderer: (p: { data?: { count?: number } }) => (p.data?.count ?? 0) > 500 ? 'Apply 5s ON-delay' : 'Review Setpoint'
    },
  ], []);

  const rowData = data.length > 0 ? data : Array.from({ length: 25 }, (_, i) => ({
    sourceName: `Unit1.FIC-${100 + i}.PV`,
    count:      Math.floor(Math.random() * 1000),
    percentage: Math.random() * 10,
  }));

  return (
    <div className="ag-theme-openbridge" style={{ height: 420, width: '100%' }}>
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        rowSelection="single"
        animateRows={true}
        defaultColDef={{ resizable: true, sortable: true }}
      />
    </div>
  );
};

export default Analytics;
