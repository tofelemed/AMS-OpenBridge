import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { AgGridReact } from 'ag-grid-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAlarmStore } from '../../store/alarmStore';
import { getAuthToken } from '../../api/auth';

// ---- API Call ----
const fetchAnalytics = async () => {
  const res = await axios.get('/api/v1/analytics/kpi', {
    headers: { Authorization: `Bearer ${getAuthToken()}` }
  });
  return res.data;
};

// ============================================================
// Analytics — ISA-18.2 KPI Dashboards
// ============================================================

const Analytics: React.FC = () => {
  const stats = useAlarmStore(s => s.stats);
  
  // Fetch historical analytics for charts
  const { data, isLoading } = useQuery({
    queryKey: ['alarmAnalytics'],
    queryFn: fetchAnalytics,
    refetchInterval: 60000, // Refresh every minute
  });

  return (

    <div style={{ padding: 'var(--space-4)', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 600 }}>ISA-18.2 / EEMUA 191 Alarm Performance Analytics</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Comprehensive operator and system effectiveness tracking</p>
        </div>
        <button className="btn btn--ghost" style={{ border: '1px solid var(--color-border)' }}>Export ISA-18.2 Report</button>
      </div>

      {/* 1. Alarm Load KPIs (Operator Burden) & Shift-Level */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>1. Alarm Load & Shift KPIs</h3>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
          <TargetCard label="Average Alarm Rate" value={stats.alarmsPerTenMin.toFixed(1)} target="< 1.0 per 10min (ISA-18.2)" status={stats.alarmsPerTenMin <= 2.0 ? 'pass' : 'fail'} />
          <TargetCard label="Peak Alarm Rate" value="14" unit="/ 10min" target="Max burst threshold" status="fail" />
          <TargetCard label="Time in Flood" value="1.2" unit="%" target="< 1% of operating time" status="warn" />
          <TargetCard label="Alarms Handled / Shift" value="142" target="Day vs Night tracking" status="info" />
        </div>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <ChartCard title="Alarm Rate vs Target (Last 24h)">
            <AlarmRateChart data={data?.hourlyRates} />
          </ChartCard>
        </div>
      </section>

      {/* 2. Operator Response & Effectiveness KPIs */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>2. Operator Response & Effectiveness</h3>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
          <TargetCard label="Mean Time To Ack (MTTA)" value="12.4" unit="s" target="< 30s target" status="pass" />
          <TargetCard label="Mean Time To Respond (MTTR)" value="2.5" unit="m" target="Correct action tracking" status="info" />
          <TargetCard label="Operator Compliance" value="94" unit="%" target="SOP Adherence > 95%" status="warn" />
          <TargetCard label="Unacknowledged Active" value={stats.unacknowledged} target="Target 0" status={stats.unacknowledged === 0 ? 'pass' : 'warn'} />
        </div>
      </section>

      {/* 3. Nuisance, Bad Actors & Alarm Quality */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>3. Alarm Quality & Nuisance Metrics</h3>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
          <TargetCard label="Chattering Alarms" value={data?.chatteringCount ?? 34} target="Rapid ON/OFF (Target 0)" status={(data?.chatteringCount ?? 34) === 0 ? 'pass' : 'fail'} />
          <TargetCard label="Fleeting Alarms" value={data?.fleetingCount ?? 89} target="< 5% of total" status={(data?.fleetingCount ?? 89) < 20 ? 'pass' : 'warn'} />
          <TargetCard label="Top 10 Contribution" value={data?.top10ContributionPercent?.toFixed(1) ?? '28.5'} unit="%" target="< 5% of total alarms" status={(data?.top10ContributionPercent ?? 28.5) < 5 ? 'pass' : 'fail'} />
          <TargetCard label="False Alarm Rate" value="3.1" unit="%" target="Target < 1%" status="warn" />
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <ChartCard title="Priority Distribution">
            <PriorityDonutChart data={data?.priorities} />
          </ChartCard>
          <ChartCard title="Alarm Categorization (Bad Behaviors)">
            <BadBehaviorsChart />
          </ChartCard>
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <ChartCard title="Top 10 Bad Actors (Last 7 Days)">
            <div style={{ overflowY: 'auto', height: 250 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: 'var(--space-2)' }}>Source / Tag</th>
                    <th style={{ padding: 'var(--space-2)' }}>Description</th>
                    <th style={{ padding: 'var(--space-2)' }}>Count</th>
                    <th style={{ padding: 'var(--space-2)' }}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.badActors?.map((a: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>{a.sourceName}</td>
                      <td style={{ padding: 'var(--space-2)', color: 'var(--text-secondary)' }}>Process Limit Exceeded</td>
                      <td style={{ padding: 'var(--space-2)' }}>{a.count}</td>
                      <td style={{ padding: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div style={{ flex: 1, background: 'var(--color-bg-elevated)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${a.percentage}%`, background: 'var(--alarm-high)', height: '100%' }}></div>
                          </div>
                          <span style={{ width: 40 }}>{a.percentage.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data?.badActors && (
                    <tr><td colSpan={4} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>Loading bad actors...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </section>

      {/* 4. Standing, Safety & System Performance */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>4. Standing, Safety & System Performance</h3>
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-4)' }}>
          <TargetCard label="Stale Alarms" value={data?.staleAlarmCount ?? 12} target="> 24 hours standing" status={(data?.staleAlarmCount ?? 12) < 5 ? 'pass' : 'warn'} />
          <TargetCard label="Standing Alarms" value={stats.totalActive} target="Total active on board" status={stats.totalActive < 10 ? 'pass' : 'warn'} />
          <TargetCard label="Suppressed/Shelved" value={stats.suppressed + stats.shelved} target="Review manually" status="info" />
          <TargetCard label="Safety Critical Latency" value="12" unit="ms" target="Target < 100ms" status="pass" />
          <TargetCard label="System Data Loss" value="0" unit="%" target="Network reliability" status="pass" />
        </div>
      </section>

      {/* 5. Drill-Down Explorer */}
      <section>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>5. Drill-Down & RCA Explorer</h3>
        <ChartCard title="Historical Alarm Data Grid">
          <DrillDownTable data={data?.badActors || []} />
        </ChartCard>
      </section>

    </div>
  );
};

// ---- Components ----

const DrillDownTable: React.FC<{ data: any[] }> = ({ data }) => {
  const columnDefs = useMemo(() => [
    { field: 'sourceName', headerName: 'Tag / Source', flex: 2, filter: true },
    { field: 'count', headerName: 'Alarm Count', flex: 1, sortable: true },
    { field: 'percentage', headerName: '% Contribution', flex: 1, valueFormatter: (p: any) => `${p.value?.toFixed(1)}%` },
    { headerName: 'Priority Distribution', flex: 2, cellRenderer: () => 'High (40%) / Medium (60%)' },
    { headerName: 'MTTA (Avg)', flex: 1, cellRenderer: () => '14.2s' },
    { headerName: 'Suggested Action', flex: 2, cellRenderer: (p: any) => p.data.count > 500 ? 'Apply 5s ON-delay' : 'Review Setpoint' }
  ], []);

  return (
    <div className="ag-theme-alpine-dark ag-theme-industrial" style={{ height: 400, width: '100%' }}>
      <AgGridReact
        rowData={data.length > 0 ? data : Array.from({length: 25}, (_, i) => ({ sourceName: `Unit1.FIC-${100+i}.PV`, count: Math.floor(Math.random()*1000), percentage: Math.random()*10 }))}
        columnDefs={columnDefs}
        rowSelection="single"
        animateRows={true}
        defaultColDef={{ resizable: true, sortable: true }}
      />
    </div>
  );
};

// ---- Components ----

const TargetCard: React.FC<{ label: string, value: string | number, target: string, status: 'pass' | 'warn' | 'fail' | 'info', unit?: string, icon?: React.ReactNode }> = ({ label, value, target, status, unit, icon }) => {
  const color = status === 'pass' ? 'var(--color-success)' : status === 'warn' ? 'var(--color-warning)' : status === 'fail' ? 'var(--alarm-critical)' : 'var(--accent-blue)';
  return (
    <div style={{ 
      background: `linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-card) 100%)`, 
      border: '1px solid var(--color-border)', 
      borderTop: `2px solid ${color}`,
      boxShadow: `0 8px 32px rgba(0,0,0,0.5), inset 0 2px 10px rgba(0,0,0,0.3)`,
      borderRadius: 'var(--radius-lg)', 
      padding: 'var(--space-3)', 
      position: 'relative', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between'
    }}>
      <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '60px', height: '60px', background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, opacity: 0.15, borderRadius: '50%' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
        {icon && <div style={{ color: color, opacity: 0.7 }}>{icon}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', textShadow: `0 0 15px ${color}30` }}>
          {value}{unit && <span style={{ fontSize: '14px', color: 'var(--text-muted)', marginLeft: 4 }}>{unit}</span>}
        </div>
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>Target: {target}</div>
    </div>
  );
};

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {title}
    </h3>
    {children}
  </div>
);

const AlarmRateChart: React.FC<{ data: any[] }> = ({ data }) => {
  const option = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const values = data ? data.map(d => d.rate) : Array.from({ length: 24 }, () => Math.random() * 15);

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: hours,
        axisLine:  { lineStyle: { color: 'var(--color-border)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: 'Alarms / hr',
        nameTextStyle: { color: 'var(--text-muted)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--color-border)', type: 'dashed' } },
        axisLabel: { color: 'var(--text-muted)' },
      },
      series: [{
        type: 'bar',
        data: values,
        itemStyle: {
          color: (p: any) => p.value > 12 ? '#ff1744' : p.value > 6 ? '#ff9100' : '#00e676',
          borderRadius: [2, 2, 0, 0]
        },
        markLine: {
          data: [
            { yAxis: 6, name: 'Target', lineStyle: { color: '#00e676', type: 'dashed' } },
            { yAxis: 12, name: 'Max', lineStyle: { color: '#ff1744', type: 'solid' } }
          ],
          label: { position: 'end', formatter: '{b}', fontSize: 11, color: '#cbd5e1' }
        },
        markArea: {
          itemStyle: { opacity: 0.1 },
          data: [
            [{ yAxis: 12, itemStyle: { color: '#ff1744' } }, { yAxis: 30 }]
          ]
        }
      }],
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 350 }} theme="dark" />;
};

const PriorityDonutChart: React.FC<{ data: any }> = ({ data }) => {
  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { top: '5%', left: 'center', textStyle: { color: 'var(--text-secondary)' } },
      series: [
        {
          name: 'Priority',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 5,
            borderColor: 'var(--color-bg-card)',
            borderWidth: 2
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#fff' }
          },
          labelLine: { show: false },
          data: [
            { value: 12, name: 'CRITICAL', itemStyle: { color: '#ff1744' } },
            { value: 45, name: 'HIGH', itemStyle: { color: '#ff9100' } },
            { value: 120, name: 'MEDIUM', itemStyle: { color: '#ffeb3b' } },
            { value: 240, name: 'LOW', itemStyle: { color: '#2196f3' } }
          ]
        }
      ]
    };
  }, [data]);

  return <ReactECharts option={option} style={{ height: 250 }} theme="dark" />;
};

const BadBehaviorsChart: React.FC = () => {
  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 80, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'var(--color-border)', type: 'dashed' } },
        axisLabel: { color: 'var(--text-muted)' }
      },
      yAxis: {
        type: 'category',
        data: ['Chattering', 'Fleeting', 'Stale', 'Standing'],
        axisLine: { lineStyle: { color: 'var(--color-border)' } },
        axisLabel: { color: 'var(--text-secondary)', fontSize: 11 }
      },
      series: [
        {
          name: 'Count',
          type: 'bar',
          data: [
            { value: 34, itemStyle: { color: '#e040fb' } }, // Chattering (purple)
            { value: 89, itemStyle: { color: '#06b6d4' } }, // Fleeting (cyan)
            { value: 12, itemStyle: { color: '#ff9100' } }, // Stale (amber)
            { value: 156, itemStyle: { color: '#3b82f6' } } // Standing (blue)
          ],
          label: {
            show: true,
            position: 'right',
            color: '#fff',
            fontSize: 11
          }
        }
      ]
    };
  }, []);

  return <ReactECharts option={option} style={{ height: 250 }} theme="dark" />;
};

export default Analytics;
