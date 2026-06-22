import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlarmStore, type AlarmStats, type ActiveAlarm } from '../../store/alarmStore';
import { User, Clock, CheckCircle, ShieldAlert, Activity } from 'lucide-react';

// ============================================================
// Main Dashboard — Live KPI Overview
// ============================================================

export const Dashboard: React.FC = () => {
  const stats = useAlarmStore(s => s.stats);
  const alarms = useAlarmStore(s => s.alarms);
  const floodAlert = useAlarmStore(s => s.floodAlert);
  const servers = useAlarmStore(s => s.serverStatuses);
  const alarmKpis = useAlarmStore(s => s.alarmKpis);
  const loopKpis = useAlarmStore(s => s.loopKpis);

  const [shiftTime, setShiftTime] = useState('');

  // Filters
  const [filterServer, setFilterServer] = useState<string>('ALL');
  const [filterArea, setFilterArea] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  useEffect(() => {
    // Simple mock shift timer
    const updateTime = () => {
      const now = new Date();
      const shiftStart = new Date();
      shiftStart.setHours(6, 0, 0, 0); // 06:00 AM start
      if (now.getHours() < 6 || now.getHours() >= 18) {
        shiftStart.setHours(18, 0, 0, 0); // 18:00 PM start
      }
      const diff = Math.max(0, now.getTime() - shiftStart.getTime());
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setShiftTime(`${hrs}h ${mins}m`);
    };
    updateTime();
    const int = setInterval(updateTime, 60000);
    return () => clearInterval(int);
  }, []);

  // Compute real-time operator metrics from actual alarm data
  const operatorMetrics = useMemo(() => {
    const allAlarms = Array.from(alarms.values());
    const ackedAlarms = allAlarms.filter(a => a.acknowledged && a.ackTimeEpochMs && a.activeTimeEpochMs);
    const totalHandled = ackedAlarms.length;
    let avgMtta = 0;
    if (ackedAlarms.length > 0) {
      const totalMttaMs = ackedAlarms.reduce((sum, a) => {
        const responseMs = (a.ackTimeEpochMs ?? 0) - (a.activeTimeEpochMs ?? a.eventTimeEpochMs ?? 0);
        return sum + Math.max(0, responseMs);
      }, 0);
      avgMtta = totalMttaMs / ackedAlarms.length / 1000; // in seconds
    }
    return { totalHandled, avgMtta };
  }, [alarms]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ padding: 'var(--space-4)', overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
    >

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', background: 'var(--color-bg-card)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 'var(--space-2)' }}>Dashboard Filters</span>

        <select value={filterServer} onChange={e => setFilterServer(e.target.value)} style={{ background: 'var(--color-bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--color-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', outline: 'none' }}>
          <option value="ALL">All OPC Servers</option>
          {[...servers.values()].map(s => <option key={s.serverId} value={s.serverId}>{s.serverName || s.serverId}</option>)}
        </select>

        <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={{ background: 'var(--color-bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--color-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', outline: 'none' }}>
          <option value="ALL">All Areas</option>
          <option value="AREA_1">Area 1</option>
          <option value="AREA_2">Area 2</option>
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ background: 'var(--color-bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--color-border)', padding: '6px 12px', borderRadius: 'var(--radius-sm)', outline: 'none' }}>
          <option value="ALL">All Priorities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Operator Shift Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 'var(--space-4)' }}>
        <ChartCard title="Shift Operator Performance">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), #1e3a8a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px rgba(41,121,255,0.3)' }}>
                <User size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>Yawar Khan</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Shift ID: D-194 • Area 1, 2</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-cyan)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Time in Shift</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  <Clock size={14} color="var(--accent-cyan)" /> {shiftTime}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-success)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mean Time To Ack</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600, color: 'var(--color-success)', marginTop: 2 }}>
                  <CheckCircle size={14} /> {operatorMetrics.avgMtta > 0 ? `${operatorMetrics.avgMtta.toFixed(1)}s` : '—'}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-blue)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Alarms Handled</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  <ShieldAlert size={14} color="var(--accent-blue)" /> {operatorMetrics.totalHandled}
                </div>
              </div>
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--alarm-high)' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Overload Events</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  <Activity size={14} color="var(--alarm-high)" /> {stats.floodActive ? 1 : 0} (Target: 0)
                </div>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* Primary Critical KPIs */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'start' }}>
          <KpiCard label="Active Alarms" value={stats.totalActive} variant={stats.totalActive > 100 ? 'warning' : 'info'} sub={`${stats.alarmsPerTenMin.toFixed(1)} per 10 min`} />
          <KpiCard label="Critical Alarms" value={stats.totalCritical} variant={stats.totalCritical > 0 ? 'critical' : 'ok'} className="kpi-card--critical" />
          <KpiCard label="High Alarms" value={stats.totalHigh} variant={stats.totalHigh > 10 ? 'warning' : 'ok'} className="kpi-card--high" />
          <KpiCard label="Unacknowledged" value={stats.unacknowledged} variant={stats.unacknowledged > 20 ? 'warning' : 'ok'} sub="Requires operator action" />
        </div>
      </div>

      {/* Secondary KPI Row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <KpiCard label="Alarm Rate (10m)" value={`${stats.alarmsPerTenMin.toFixed(1)}`} variant={stats.floodActive ? 'critical' : stats.alarmsPerTenMin > 5 ? 'warning' : 'ok'} sub={stats.floodActive ? '⚠ FLOOD DETECTED' : 'ISA-18.2 Target < 1.0'} />
        <KpiCard label="Shelved" value={stats.shelved} variant="info" sub="ISA-18.2 shelved" />
        <KpiCard label="Suppressed" value={stats.suppressed} variant="info" sub="By design / programmatic" />
        <KpiCard label="Out of Service" value={stats.outOfService || 0} variant="warning" sub="Monitoring disabled" />
        <KpiCard label="OPC Servers" value={servers.size} variant="info" sub={`${[...servers.values()].filter(s => s.isConnected).length} connected`} />
      </div>

      {/* Standard ISA-18.2 & Alarm Health KPIs */}
      <ChartCard title="ISA-18.2 System Health & Bad Actors">
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)' }}>
          <KpiCard label="Health Score" value={`${alarmKpis['health-score']?.healthScore?.toFixed(1) || '100'}`} variant={(alarmKpis['health-score']?.healthScore || 100) < 80 ? 'warning' : 'ok'} sub="Target > 90" />
          <KpiCard label="Average Rate (10m)" value={`${alarmKpis['alarm-rate']?.alarmCount || 0}`} variant={(alarmKpis['alarm-rate']?.alarmCount || 0) > 10 ? 'warning' : 'ok'} sub="Target < 1/10m" />
          <KpiCard label="Standing Alarms" value={alarmKpis['standing-snapshot']?.standingCount || stats.totalActive} variant={(alarmKpis['standing-snapshot']?.standingCount || stats.totalActive) > 15 ? 'warning' : 'info'} sub="Currently Active" />
          <KpiCard label="Oldest Standing" value={alarmKpis['standing-snapshot']?.oldestStandingDurationMs ? `${(alarmKpis['standing-snapshot'].oldestStandingDurationMs / 3600000).toFixed(1)}h` : '0h'} variant="info" sub="Duration" />
          <KpiCard label="Chattering Alarms" value={alarmKpis['bad-actors-chattering']?.occurrences || 0} variant={(alarmKpis['bad-actors-chattering']?.occurrences || 0) > 0 ? 'critical' : 'ok'} sub="Target: 0" />
          <KpiCard label="Fleeting Alarms" value={alarmKpis['bad-actors-fleeting']?.occurrences || 0} variant={(alarmKpis['bad-actors-fleeting']?.occurrences || 0) > 0 ? 'critical' : 'ok'} sub="Target: 0" />
        </div>
      </ChartCard>

      {/* Loop Performance KPIs */}
      <ChartCard title="Loop Performance & Control KPIs">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-3)' }}>
          {Object.keys(loopKpis).length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: 'var(--space-4)', fontSize: '14px' }}>Awaiting loop metrics from Flink stream...</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
              {Object.values(loopKpis).sort((a, b) => b.iae - a.iae).slice(0, 8).map(kpi => (
                <div key={kpi.tagId} style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', borderLeft: `3px solid ${kpi.iae > 50 ? 'var(--alarm-high)' : 'var(--accent-blue)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{kpi.tagId}</strong>
                    <span style={{ fontSize: '11px', padding: '2px 6px', background: 'var(--color-bg-tertiary)', borderRadius: '4px' }}>{kpi.dominantMode}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>IAE:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{kpi.iae.toFixed(2)}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>ISE:</span> <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{kpi.ise.toFixed(2)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ChartCard>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
        <ChartCard title="Alarm Priority Distribution">
          <PriorityPieChart stats={stats} />
        </ChartCard>
        <ChartCard title="Alarm Rate (Last 24h)">
          <AlarmRateChart />
        </ChartCard>
        <ChartCard title="Avg Response Time (Last 24h)">
          <MttaChart />
        </ChartCard>
      </div>

      {/* Server Status Row */}
      <div>
        <ChartCard title="OPC Server Status">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
            {servers.size === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: 'var(--space-4)' }}>No OPC servers configured</p>
            ) : [...servers.values()].map(s => (
              <ServerStatusCard key={s.serverId} server={s} />
            ))}
          </div>
        </ChartCard>
      </div>
    </motion.div>
  );
};

// ---- KPI Card ----
interface KpiCardProps {
  label: string;
  value: number | string;
  variant?: 'critical' | 'warning' | 'ok' | 'info';
  sub?: string;
  className?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, variant = 'info', sub, className }) => (
  <motion.div
    className={`kpi-card ${className ?? ''}`}
    whileHover={{ scale: 1.02, y: -2 }}
    transition={{ type: 'spring', stiffness: 300 }}
  >
    <div className="kpi-label">{label}</div>
    <AnimatePresence mode="popLayout">
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={`kpi-value kpi-value--${variant}`}
      >
        {value}
      </motion.div>
    </AnimatePresence>
    {sub && <div className="kpi-sub">{sub}</div>}
  </motion.div>
);

// ---- Chart Wrapper ----
const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="kpi-card" style={{ borderRadius: 'var(--radius-lg)' }}>
    <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {title}
    </h3>
    {children}
  </div>
);

// ---- Priority Pie Chart ----
const PriorityPieChart: React.FC<{ stats: AlarmStats }> = ({ stats }) => {
  const option = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--color-bg-card)',
      borderColor: 'var(--color-border)',
      textStyle: { color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: 13 },
    },
    legend: {
      bottom: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 12 },
    },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: 'var(--color-bg-secondary)', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)' } },
      data: [
        { value: stats.totalCritical, name: 'Critical', itemStyle: { color: '#ff1744' } },
        { value: stats.totalHigh, name: 'High', itemStyle: { color: '#ff9100' } },
        { value: stats.totalMedium, name: 'Medium', itemStyle: { color: '#ffeb3b' } },
        { value: stats.totalLow, name: 'Low', itemStyle: { color: '#2196f3' } },
      ].filter(d => d.value > 0),
    }],
  }), [stats]);

  return <ReactECharts option={option} style={{ height: 220 }} theme="dark" />;
};

// ---- Alarm Rate Line Chart (real-time from alarm store) ----
const AlarmRateChart: React.FC = () => {
  const alarms = useAlarmStore(s => s.alarms);
  const lastUpdated = useAlarmStore(s => s.lastUpdated);

  const option = useMemo(() => {
    // Bin alarms by hour over the last 24 hours based on real eventTimeEpochMs
    const now = Date.now();
    const hourMs = 3_600_000;
    const bins = new Map<number, number>();

    // Initialize 24 hourly bins
    for (let i = 0; i < 24; i++) {
      const binStart = now - (23 - i) * hourMs;
      const hourKey = Math.floor(binStart / hourMs) * hourMs;
      bins.set(hourKey, 0);
    }

    // Count alarms per hourly bin
    const cutoff = now - 24 * hourMs;
    for (const alarm of alarms.values()) {
      const ts = alarm.eventTimeEpochMs;
      if (ts >= cutoff && ts <= now) {
        const hourKey = Math.floor(ts / hourMs) * hourMs;
        bins.set(hourKey, (bins.get(hourKey) ?? 0) + 1);
      }
    }

    const data = Array.from(bins.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, count]) => [ts, count]);

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: '#8a8a8a', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: 'Alarms/hour',
        nameTextStyle: { color: '#8a8a8a', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
        axisLabel: { color: '#8a8a8a' },
      },
      series: [{
        type: 'line',
        smooth: true,
        data,
        lineStyle: { color: '#3b82f6', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.3)' },
              { offset: 1, color: 'rgba(59,130,246,0)' },
            ]
          }
        },
        markLine: {
          data: [{ yAxis: 10, name: 'ISA-18.2 Flood', lineStyle: { color: '#ff1744', type: 'dashed' } }],
          label: { color: '#ff1744', fontSize: 11, position: 'insideStartTop' },
        },
      }],
    };
  }, [alarms, lastUpdated]);

  return <ReactECharts option={option} style={{ height: 220 }} theme="dark" />;
};

// ---- MTTA Trend Chart (real-time from alarm store) ----
const MttaChart: React.FC = () => {
  const alarms = useAlarmStore(s => s.alarms);
  const lastUpdated = useAlarmStore(s => s.lastUpdated);

  const option = useMemo(() => {
    // Compute average MTTA per hourly bin from acknowledged alarms
    const now = Date.now();
    const hourMs = 3_600_000;
    const cutoff = now - 24 * hourMs;

    // Bin: hourKey -> { totalResponseMs, count }
    const bins = new Map<number, { total: number; count: number }>();
    for (let i = 0; i < 24; i++) {
      const binStart = now - (23 - i) * hourMs;
      const hourKey = Math.floor(binStart / hourMs) * hourMs;
      bins.set(hourKey, { total: 0, count: 0 });
    }

    for (const alarm of alarms.values()) {
      if (!alarm.acknowledged || !alarm.ackTimeEpochMs || !alarm.activeTimeEpochMs) continue;
      const ts = alarm.ackTimeEpochMs;
      if (ts < cutoff || ts > now) continue;
      const hourKey = Math.floor(ts / hourMs) * hourMs;
      const bin = bins.get(hourKey);
      const responseMs = Math.max(0, alarm.ackTimeEpochMs - (alarm.activeTimeEpochMs || alarm.eventTimeEpochMs));
      if (bin) {
        bin.total += responseMs;
        bin.count += 1;
      }
    }

    const data = Array.from(bins.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, bin]) => [ts, bin.count > 0 ? Math.round(bin.total / bin.count / 1000 * 10) / 10 : 0]);

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: { color: '#8a8a8a', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: 'Seconds',
        nameTextStyle: { color: '#8a8a8a', fontSize: 11 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
        axisLabel: { color: '#8a8a8a' },
      },
      series: [{
        type: 'line',
        smooth: true,
        data,
        lineStyle: { color: '#00e676', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
              { offset: 0, color: 'rgba(0,230,118,0.3)' },
              { offset: 1, color: 'rgba(0,230,118,0)' },
            ]
          }
        },
        markLine: {
          data: [{ yAxis: 30, name: 'Target <30s', lineStyle: { color: '#ff9100', type: 'dashed' } }],
          label: { color: '#ff9100', fontSize: 11, position: 'insideStartTop' },
        },
      }],
    };
  }, [alarms, lastUpdated]);

  return <ReactECharts option={option} style={{ height: 220 }} theme="dark" />;
};

// ---- Server Status Card ----
interface ServerStatusCardProps {
  server: { serverId: string; serverName: string; isConnected: boolean; error: string | null };
}

const ServerStatusCard: React.FC<ServerStatusCardProps> = ({ server }) => (
  <div style={{
    background: 'var(--color-bg-tertiary)',
    border: `1px solid ${server.isConnected ? 'rgba(0,230,118,0.2)' : 'rgba(255,23,68,0.2)'}`,
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  }}>
    <span className={`connection-dot connection-dot--${server.isConnected ? 'connected' : 'disconnected'}`} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {server.serverName || server.serverId}
      </div>
      <div style={{ fontSize: '11px', color: server.isConnected ? 'var(--color-success)' : 'var(--alarm-critical)', marginTop: 2 }}>
        {server.isConnected ? 'CONNECTED' : server.error ?? 'DISCONNECTED'}
      </div>
    </div>
  </div>
);
