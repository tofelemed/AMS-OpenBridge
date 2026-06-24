import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import { useAlarmStore } from './store/alarmStore';
import { Dashboard } from './components/Dashboard/Dashboard';
import { AlarmConsole } from './components/AlarmConsole/AlarmConsole';
import './styles/index.css';
import { OperatorControlCenter, type OperatorPipelineHealth } from './components/OperatorControlCenter/OperatorControlCenter';

const HistoricalViewer = React.lazy(() => import('./components/HistoricalViewer/HistoricalViewer'));
const SoePanel         = React.lazy(() => import('./components/Soe/SoePanel'));
const Analytics        = React.lazy(() => import('./components/Analytics/Analytics'));
const Administration   = React.lazy(() => import('./components/Administration/Administration'));

const SystemMonitor    = React.lazy(() => import('./components/SystemMonitor/SystemMonitor').then(m => ({ default: m.SystemMonitor })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeProtocol = useAlarmStore(s => s.activeProtocol);

  useEffect(() => {
    const connectLive = async (token: string) => {
      try {
        await useAlarmStore.getState().initialize(token);
      } catch (e) {
        console.warn('[AMS] Live initialization failed, continuing in degraded mode', e);
      } finally {
        setReady(true);
      }
    };

    console.info('[AMS] Connecting to live API with anonymous auth');
    void connectLive('anonymous-token');

    const refreshId = setInterval(() => {
      void useAlarmStore.getState().refreshActiveAlarms().catch(() => { /* background reconcile */ });
    }, 8_000);

    return () => {
      clearInterval(refreshId);
      void useAlarmStore.getState().disconnect();
    };
  }, []);



  if (error) return <ErrorScreen message={error} />;
  if (!ready) return <LoadingScreen />;

  return (
    <UiErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppShell>
            <React.Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/"           element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"  element={<Dashboard />} />
                <Route path="/system"     element={<SystemMonitor />} />
                <Route path="/alarms"     element={<AlarmConsole />} />
                <Route path="/historical" element={<HistoricalViewer />} />
                <Route path="/soe"        element={<SoePanel />} />
                <Route path="/analytics"  element={<Analytics />} />
                <Route path="/admin/*"    element={<Administration />} />
                <Route path="*"           element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </React.Suspense>
          </AppShell>
        </BrowserRouter>
        <ToastContainer
          position="bottom-right"
          theme="dark"
          autoClose={4000}
          hideProgressBar={false}
          closeOnClick
          pauseOnHover
          draggable
        />
      </QueryClientProvider>
    </UiErrorBoundary>
  );
};

type PipelineHealth = OperatorPipelineHealth & {
  cep: { rulesActive: boolean; status: string };
};

const ribbonClass = (status: string) =>
  status === 'Healthy' ? 'healthy' : status === 'Degraded' ? 'warn' : 'error';

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stats   = useAlarmStore(s => s.stats);
  const connSt  = useAlarmStore(s => s.connectionState);
  const [pipeline, setPipeline] = useState<PipelineHealth | null>(null);
  const [stallNotified, setStallNotified] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);

  const criticalCount = stats.totalCritical;
  const unackedCount  = stats.unacknowledged;

  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get<PipelineHealth>('/api/v1/health/pipeline');
        setPipeline(res.data);
        if (res.data.streampipes?.readinessState === 'IngestStalled' && !stallNotified) {
          toast.error(`Alarm ingest stalled — ${res.data.telemetryIngest?.state ?? 'check API feed'}`, { toastId: 'telemetry-stall' });
          setStallNotified(true);
        } else if (res.data.streampipes?.readinessState === 'WarmingUp') {
          setStallNotified(false);
        } else if ((res.data.opcConnections?.activeConnections ?? 0) > 0) {
          setStallNotified(false);
        }
      } catch {
        setPipeline(null);
      }
    };
    void load();
    const id = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(id);
  }, [stallNotified]);

  const telemetryStalled = pipeline?.telemetryIngest?.state === 'STALLED'
    || pipeline?.streampipes?.readinessState === 'IngestStalled'
    || ((pipeline?.opcConnections?.totalEnabled ?? 0) > 0 && (pipeline?.opcConnections?.activeConnections ?? 0) === 0
        && pipeline?.telemetryIngest?.state !== 'OK' && pipeline?.streampipes?.readinessState !== 'WarmingUp');
  const overallUnhealthy = telemetryStalled || pipeline?.kafka?.brokerHealth !== 'Healthy';
  const opcRate = pipeline?.kafka?.throughput ?? 0;
  const flinkHealthy = pipeline?.flink && (pipeline.flink.restartCount ?? 0) === 0;
  const ingestState = pipeline?.telemetryIngest?.state
    ?? pipeline?.streampipes?.readinessState
    ?? (pipeline?.streampipes?.reachable ? 'Healthy' : null);
  const spState = ingestState ?? (pipeline ? 'OK' : 'Unknown');
  const spHealthy = spState === 'Healthy' || spState === 'OK';
  const spWarming = spState === 'WarmingUp' || spState === 'IngestDelayed';
  const opcConnected = (pipeline?.opcConnections?.activeConnections ?? 0) > 0;
  const readinessScore = pipeline?.readiness?.overallScore;
  const readinessGate = pipeline?.readiness?.gateStatus ?? '—';

  return (
    <div className="app-shell">
      <div className={`status-ribbon${overallUnhealthy ? ' status-ribbon--alert' : ''}`}>
        <div className="ribbon-item" title={`Broker: ${pipeline?.kafka?.brokerHealth ?? 'Unknown'}, Lag: ${pipeline?.kafka?.lag ?? 0}`}>
          <div className={`ribbon-dot ${ribbonClass(pipeline?.kafka?.brokerHealth ?? 'Degraded')}`}></div>
          Kafka: {pipeline?.kafka?.brokerHealth ?? 'Unknown'}
          {pipeline?.kafka?.lag != null ? ` · Lag: ${pipeline.kafka.lag}` : ''}
        </div>
        <div className="ribbon-item" title={`In: ${pipeline?.flink?.recordsReceived ?? 0}, Out: ${pipeline?.flink?.recordsSent ?? 0}, raw-alarms: ${pipeline?.flink?.rawAlarmsProcessed ?? 0}`}>
          <div className={`ribbon-dot ${flinkHealthy ? 'healthy' : 'warn'}`}></div>
          Flink: {pipeline?.flink?.status ?? 'Unknown'}
          {(pipeline?.flink?.recordsReceived ?? 0) > 0
            ? ` · In ${pipeline!.flink!.recordsReceived} / Out ${pipeline!.flink!.recordsSent}`
            : pipeline?.flink?.checkpointLatencyMs
              ? ` · CP ${(pipeline.flink.checkpointLatencyMs / 1000).toFixed(1)}s`
              : ''}
        </div>
        <div className="ribbon-item" title={`raw-alarms lag: ${pipeline?.kafka?.lag ?? 0}, ~${(pipeline?.kafka?.throughput ?? 0).toFixed(1)} msg/min`}>
          <div className={`ribbon-dot ${(pipeline?.kafka?.lag ?? 0) < 1000 ? 'healthy' : 'warn'}`}></div>
          Kafka Lag: {pipeline?.kafka?.lag ?? 0}
          {(pipeline?.kafka?.throughput ?? 0) > 0 ? ` · ${pipeline!.kafka!.throughput.toFixed(0)}/min` : ''}
        </div>
        <div className="ribbon-item" title={`Telemetry: ${pipeline?.telemetryIngest?.totalEventsObserved ?? 0} events`}>
          <div className={`ribbon-dot ${spHealthy ? 'healthy' : spWarming ? 'warn' : 'error'}`}></div>
          Ingest: {spState}
          {pipeline?.telemetryIngest?.secondsSinceLastEvent != null
            ? ` · ${Math.round(pipeline.telemetryIngest.secondsSinceLastEvent)}s ago`
            : ''}
        </div>
        <div className="ribbon-item" title={`${pipeline?.opcConnections?.activeConnections ?? 0} connected`}>
          <div className={`ribbon-dot ${opcConnected ? 'healthy' : (pipeline?.opcConnections?.totalEnabled ?? 0) > 0 ? 'warn' : 'error'}`}></div>
          OPC: {pipeline?.opcConnections?.activeConnections ?? 0} Connected
        </div>
        <div className="ribbon-item" title="CEP correlation rules">
          <div className={`ribbon-dot ${pipeline?.cep?.rulesActive ? 'healthy' : 'warn'}`}></div>
          CEP: {pipeline?.cep?.status ?? '—'}
        </div>
        <div className="ribbon-item" title={`DB latency ${pipeline?.postgres?.queryLatencyMs?.toFixed(1) ?? 0}ms`}>
          <div className={`ribbon-dot ${pipeline?.postgres ? 'healthy' : 'error'}`}></div>
          Postgres: {pipeline?.postgres ? 'OK' : '—'}
        </div>
        <div className="ribbon-item" style={{ marginLeft: 'auto' }} title={`SignalR clients: ${pipeline?.signalr?.connectedClients ?? 0}`}>
          <div className={`ribbon-dot ${connSt === 'Connected' ? 'healthy' : connSt === 'Reconnecting' ? 'warn' : 'error'}`}></div>
          SignalR: {connSt}
        </div>
      </div>

      <header className="topbar" style={{ padding: '0 var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.02em' }}>
            AMS <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Alarm Management</span>
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {readinessScore != null && (
            <button
              type="button"
              onClick={() => setControlCenterOpen(true)}
              title={`${pipeline?.readiness?.recommendation ?? 'Live cutover readiness'} — click for drill-down`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: readinessGate === 'PASS' ? 'rgba(0,230,118,0.12)' : readinessGate === 'WARN' ? 'rgba(255,193,7,0.12)' : 'rgba(255,23,68,0.12)',
                border: `1px solid ${readinessGate === 'PASS' ? 'rgba(0,230,118,0.35)' : readinessGate === 'WARN' ? 'rgba(255,193,7,0.35)' : 'rgba(255,23,68,0.35)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                color: readinessGate === 'PASS' ? 'var(--color-success)' : readinessGate === 'WARN' ? '#ffc107' : 'var(--alarm-critical)',
              }}>
                {readinessScore}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>
                Readiness
              </span>
            </button>
          )}
          {criticalCount > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '4px 10px',
              background: 'var(--alarm-critical-bg)',
              border: '1px solid rgba(255,23,68,0.4)',
              borderRadius: 'var(--radius-sm)',
            }}>
              <span style={{ color: 'var(--alarm-critical)', fontWeight: 800, fontSize: '13px' }}>{criticalCount}</span>
              <span style={{ color: 'var(--alarm-critical)', fontSize: '10px', fontWeight: 700 }}>CRITICAL</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 10px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>{unackedCount}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>Unacked</span>
          </div>
          <span className={`connection-dot connection-dot--${
            connSt === 'Connected' ? 'connected'
            : connSt === 'Reconnecting' ? 'connecting'
            : 'disconnected'
          }`} title={`SignalR: ${connSt}`} />
          <UserMenu />
        </div>
      </header>

      <aside className="sidebar">
        <Sidebar unackedCount={unackedCount} />
      </aside>

      <main className="main-content">
        {children}
      </main>

      <aside className="live-events-panel">
        <LiveEventStream />
      </aside>

      <OperatorControlCenter
        open={controlCenterOpen}
        pipeline={pipeline}
        onClose={() => setControlCenterOpen(false)}
      />
    </div>
  );
};

import { LiveEventStream } from './components/shared/LiveEventStream';

const navItems = [
  { path: '/dashboard',  label: 'Dashboard',   icon: '⬛', group: 'Main' },
  { path: '/system',     label: 'Observability', icon: '👁️', group: 'Main' },
  { path: '/alarms',     label: 'Active Alarms',icon: '🔔', group: 'Main', badge: 'alarms' },
  { path: '/historical', label: 'History',      icon: '📋', group: 'Main' },
  { path: '/soe',        label: 'SOE Events',   icon: '⚡', group: 'Main' },
  { path: '/analytics',  label: 'Analytics',    icon: '📊', group: 'Analytics' },
  { path: '/admin/users',        label: 'Users',         icon: '👤', group: 'Administration' },
  { path: '/admin/alarm-feed',   label: 'Alarm Feed',    icon: '🔌', group: 'Administration' },
  { path: '/admin/alarm-rules',  label: 'Alarm Rules',   icon: '⚙', group: 'Administration' },
  { path: '/admin/notifications',label: 'Notifications', icon: '✉', group: 'Administration' },
  { path: '/admin/system',       label: 'System',        icon: '🖥', group: 'Administration' },
];

const Sidebar: React.FC<{ unackedCount: number }> = ({ unackedCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const groups = [...new Set(navItems.map(i => i.group))];

  return (
    <nav style={{ overflowY: 'auto', flex: 1 }}>
      {groups.map(group => (
        <div key={group} className="nav-group">
          <div className="nav-group__label">{group}</div>
          {navItems.filter(i => i.group === group).map(item => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge === 'alarms' && unackedCount > 0 && (
                  <span style={{
                    background: 'var(--alarm-critical)',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '10px',
                  }}>
                    {unackedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

const UserMenu: React.FC = () => (
  <button
    className="btn btn--ghost btn--icon"
    onClick={() => { (window as unknown as { kc?: { logout: () => void } }).kc?.logout(); }}
    title="Logout"
    style={{ fontSize: '16px' }}
  >
    👤
  </button>
);

const LoadingScreen: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 'var(--space-4)', background: 'var(--color-bg-primary)' }}>
    <div className="spinner" style={{ width: 40, height: 40 }} />
    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Connecting to AMS...</p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 'var(--space-4)', background: 'var(--color-bg-primary)' }}>
    <p style={{ color: 'var(--alarm-critical)', fontSize: '15px' }}>{message}</p>
    <button className="btn btn--primary" onClick={() => window.location.reload()}>Retry</button>
  </div>
);

class UiErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[AMS] UI runtime error', error);
  }

  render() {
    if (this.state.failed) {
      return <ErrorScreen message="UI failed to render. Please refresh to recover." />;
    }
    return this.props.children;
  }
}

export default App;
