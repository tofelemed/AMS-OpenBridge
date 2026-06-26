'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAlarmStore } from './store/alarmStore';

// OpenBridge Components
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

// Lazy-loaded pages
const Dashboard        = React.lazy(() => import('./components/Dashboard/Dashboard'));
const AlarmConsole     = React.lazy(() => import('./components/AlarmConsole/AlarmConsole'));
const Analytics        = React.lazy(() => import('./components/Analytics/Analytics'));
const HistoricalViewer = React.lazy(() => import('./components/HistoricalViewer/HistoricalViewer'));
const IoTDBTrendViewer = React.lazy(() => import('./components/IoTDBTrend/IoTDBTrendViewer'));
const LiveEventsPage   = React.lazy(() => import('./components/LiveEvents/LiveEventsPage'));
const SoePanel         = React.lazy(() => import('./components/Soe/SoePanel'));
const SystemMonitor    = React.lazy(() => import('./components/SystemMonitor/SystemMonitor'));
const EdgeNodeMonitor  = React.lazy(() => import('./components/EdgeNodeMonitor/EdgeNodeMonitor'));
const Administration   = React.lazy(() => import('./components/Administration/Administration'));

// Shared Components
import { LiveEventStream } from './components/shared/LiveEventStream';
import { FloodAlertBanner } from './components/shared/FloodAlertBanner';
import { LiveEventsContext } from './context/LiveEventsContext';

// Theme Context — Day and Bright only
type Theme = 'day' | 'bright';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'day', setTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

const TB = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA',
  text: '#1F2937', textSub: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5', successBorder: '#A7F3D0',
  critical: '#D64545', criticalBg: '#FEF2F2',
  radiusSm: '8px',
  shadow: '0 1px 3px rgba(0,0,0,0.07)',
} as const;

const LIVE_EVENTS_STORAGE_KEY = 'ams-show-live-events';

const readLiveEventsPreference = (): boolean => {
  try {
    const stored = localStorage.getItem(LIVE_EVENTS_STORAGE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
  } catch {
    // ignore storage errors
  }
  return true;
};

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
  const [error] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('day');

  useEffect(() => {
    document.documentElement.setAttribute('data-obc-theme', theme);
  }, [theme]);

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
      void useAlarmStore.getState().refreshActiveAlarms().catch(() => {});
    }, 8_000);

    return () => {
      clearInterval(refreshId);
      void useAlarmStore.getState().disconnect();
    };
  }, []);

  if (error) return <ErrorScreen message={error} />;
  if (!ready) return <LoadingScreen />;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastContainer
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
          />
          <AppShell>
            <React.Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                {/* Live Operations */}
                <Route path="/dashboard"    element={<Dashboard />} />
                <Route path="/alarms"       element={<AlarmConsole />} />
                <Route path="/live-events"  element={<LiveEventsPage />} />
                <Route path="/soe"          element={<SoePanel />} />
                {/* Historical */}
                <Route path="/historical" element={<HistoricalViewer />} />
                <Route path="/trend"      element={<IoTDBTrendViewer />} />
                {/* Analysis */}
                <Route path="/analytics"  element={<Analytics />} />
                {/* Infrastructure */}
                <Route path="/system"     element={<SystemMonitor />} />
                <Route path="/edge"       element={<EdgeNodeMonitor />} />
                {/* Administration */}
                <Route path="/admin/*"    element={<Administration />} />
                <Route path="*"           element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </React.Suspense>
          </AppShell>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
};

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stats = useAlarmStore(s => s.stats);
  const connSt = useAlarmStore(s => s.connectionState);
  const floodAlert = useAlarmStore(s => s.floodAlert);
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const [showLiveEvents, setShowLiveEvents] = useState(readLiveEventsPreference);

  // Full-height pages (with internal layout) — no padding wrapper needed
  const isFullHeightPage = location.pathname === '/alarms';

  const toggleLiveEvents = () => {
    setShowLiveEvents(prev => {
      const next = !prev;
      try {
        localStorage.setItem(LIVE_EVENTS_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const criticalCount = stats.totalCritical;
  const unackedCount = stats.unacknowledged;

  const isConnected = connSt === 'Connected';

  return (
    <LiveEventsContext.Provider value={{ showLiveEvents, toggleLiveEvents }}>
    <div className={`app-root${showLiveEvents ? '' : ' app-root--events-hidden'}`}>
      {/* Flood Alert Banner */}
      {floodAlert && <FloodAlertBanner alert={floodAlert} />}

      {/* Top Bar — custom brand header (no hamburger / no "Page" suffix) */}
      <div className="app-topbar">
        <div className="app-topbar__inner">
          <div className="app-topbar__brand">
            <div className="app-topbar__brand-title">Traverse AMS</div>
            <div className="app-topbar__brand-tagline">Lean Automation</div>
          </div>

          <div className="app-topbar__controls">
            {/* Critical / unacked summary (text only — no bell icons) */}
            {(criticalCount > 0 || unackedCount > 0) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '5px 12px', borderRadius: TB.radiusSm,
                background: criticalCount > 0 ? TB.criticalBg : TB.bg,
                border: `1px solid ${criticalCount > 0 ? '#FCA5A5' : TB.border}`,
                fontSize: '11.5px', fontWeight: 600,
              }}>
                {criticalCount > 0 && (
                  <span style={{ color: TB.critical }}>
                    {criticalCount} Critical
                  </span>
                )}
                {criticalCount > 0 && unackedCount > 0 && (
                  <span style={{ color: TB.textMuted }}>·</span>
                )}
                {unackedCount > 0 && (
                  <span style={{ color: '#B45309' }}>
                    {unackedCount} Unacked
                  </span>
                )}
              </div>
            )}

            {/* Live events toggle */}
            <button
              type="button"
              onClick={toggleLiveEvents}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', fontSize: '12.5px', fontWeight: 600,
                borderRadius: TB.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
                border: `1.5px solid ${showLiveEvents ? TB.blueMuted : TB.border}`,
                background: showLiveEvents ? TB.blueLight : TB.card,
                color: showLiveEvents ? TB.blue : TB.textSub,
                transition: 'all 130ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = TB.blueLight;
                e.currentTarget.style.color = TB.blue;
                e.currentTarget.style.borderColor = TB.blueMuted;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = showLiveEvents ? TB.blueLight : TB.card;
                e.currentTarget.style.color = showLiveEvents ? TB.blue : TB.textSub;
                e.currentTarget.style.borderColor = showLiveEvents ? TB.blueMuted : TB.border;
              }}
            >
              {showLiveEvents ? 'Hide Events' : 'Show Events'}
            </button>

            {/* Theme: Day | Bright */}
            <div style={{
              display: 'inline-flex', alignItems: 'center',
              background: TB.bg, border: `1px solid ${TB.border}`,
              borderRadius: TB.radiusSm, padding: '3px', gap: '2px',
            }}>
              {(['day', 'bright'] as Theme[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  style={{
                    padding: '5px 14px', fontSize: '12px', fontWeight: 700,
                    borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
                    border: 'none', textTransform: 'capitalize',
                    background: theme === t ? TB.card : 'transparent',
                    color: theme === t ? TB.blue : TB.textMuted,
                    boxShadow: theme === t ? TB.shadow : 'none',
                    transition: 'all 130ms ease',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Connection status */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '6px 12px', borderRadius: TB.radiusSm,
              background: isConnected ? TB.successBg : TB.criticalBg,
              border: `1px solid ${isConnected ? TB.successBorder : '#FCA5A5'}`,
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: isConnected ? TB.success : TB.critical,
                boxShadow: `0 0 6px ${isConnected ? TB.success : TB.critical}`,
              }} />
              <span style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: isConnected ? TB.success : TB.critical,
              }}>
                {isConnected ? 'Live' : connSt}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <Sidebar unackedCount={unackedCount} />
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        {/* Full-height pages (AlarmConsole) manage their own layout.
            All other pages get a scrollable padded wrapper. */}
        {isFullHeightPage
          ? children
          : <div className="page-content">{children}</div>
        }
      </main>

      {/* Live Events Panel — toggled via top bar */}
      <aside className={`app-events${showLiveEvents ? '' : ' app-events--hidden'}`}>
        <LiveEventStream />
      </aside>

      {/* Re-open tab when panel is collapsed */}
      {!showLiveEvents && (
        <button
          type="button"
          className="live-events-expand-tab"
          onClick={toggleLiveEvents}
          aria-label="Show live events panel"
          style={{
            color: TB.blue,
            background: TB.blueLight,
            borderColor: TB.blueMuted,
          }}
        >
          Live Events ▸
        </button>
      )}
    </div>
    </LiveEventsContext.Provider>
  );
};

// Navigation items — grouped by data source and function
const navItems = [
  // ── Live Operations (SignalR + MQTT real-time) ──────────────
  { path: '/dashboard',    label: 'Dashboard',          icon: '📊', group: 'Live Operations',  badge: undefined as string | undefined },
  { path: '/alarms',       label: 'Active Alarms',       icon: '🔔', group: 'Live Operations',  badge: 'alarms' },
  { path: '/live-events',  label: 'Live Events',         icon: '📡', group: 'Live Operations' },
  { path: '/soe',          label: 'Sequence of Events',  icon: '⏱',  group: 'Live Operations' },
  // ── Historical (PostgreSQL + IoTDB) ───────────────────────
  { path: '/historical', label: 'Alarm History',       icon: '📜', group: 'Historical' },
  { path: '/trend',      label: 'IoTDB Trend Viewer',  icon: '📈', group: 'Historical' },
  // ── Analysis ──────────────────────────────────────────────
  { path: '/analytics',  label: 'Analytics',           icon: '🔬', group: 'Analysis' },
  // ── Infrastructure (edge + system monitoring) ─────────────
  { path: '/system',     label: 'System Monitor',      icon: '⚙',  group: 'Infrastructure' },
  { path: '/edge',       label: 'Edge Node Monitor',   icon: '⬡',  group: 'Infrastructure' },
  // ── Administration ────────────────────────────────────────
  { path: '/admin/users',         label: 'User Management',  icon: '👤', group: 'Administration' },
  { path: '/admin/alarm-feed',    label: 'Alarm Feed',       icon: '📡', group: 'Administration' },
  { path: '/admin/alarm-rules',   label: 'Alarm Rules',      icon: '📋', group: 'Administration' },
  { path: '/admin/notifications', label: 'Notifications',    icon: '🔔', group: 'Administration' },
  { path: '/admin/audit',         label: 'Audit Log',        icon: '📒', group: 'Administration' },
  { path: '/admin/system',        label: 'System Settings',  icon: '🔧', group: 'Administration' },
];

const Sidebar: React.FC<{ unackedCount: number }> = ({ unackedCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const groups = [...new Set(navItems.map(i => i.group))];

  return (
    <nav style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
      {groups.map(group => (
        <div key={group} className="nav-section">
          <div className="nav-section__title">{group}</div>
          {navItems.filter(i => i.group === group).map(item => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span style={{ fontSize: '14px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge === 'alarms' && unackedCount > 0 && (
                  <span className="nav-item__badge">{unackedCount}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

const LoadingScreen: React.FC = () => (
  <div className="loading-screen">
    <div className="spinner" />
    <p style={{ color: 'var(--on-container-neutral-color)', fontSize: '14px' }}>
      Connecting to AMS...
    </p>
  </div>
);

const ErrorScreen: React.FC<{ message: string }> = ({ message }) => (
  <div className="loading-screen">
    <p style={{ color: 'var(--alert-alarm-border-color)', fontSize: '15px' }}>{message}</p>
    <ObcButton variant="normal" onClick={() => window.location.reload()}>
      Retry
    </ObcButton>
  </div>
);

export default App;
