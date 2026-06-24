'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAlarmStore } from './store/alarmStore';

// OpenBridge Components
import { ObcTopBar } from '@oicl/openbridge-webcomponents-react/components/top-bar/top-bar';
import { ObcAlertButton } from '@oicl/openbridge-webcomponents-react/components/alert-button/alert-button';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

// Lazy-loaded pages
const Dashboard = React.lazy(() => import('./components/Dashboard/Dashboard'));
const AlarmConsole = React.lazy(() => import('./components/AlarmConsole/AlarmConsole'));
const Analytics = React.lazy(() => import('./components/Analytics/Analytics'));
const HistoricalViewer = React.lazy(() => import('./components/HistoricalViewer/HistoricalViewer'));
const SoePanel = React.lazy(() => import('./components/Soe/SoePanel'));
const SystemMonitor = React.lazy(() => import('./components/SystemMonitor/SystemMonitor'));
const Administration = React.lazy(() => import('./components/Administration/Administration'));

// Shared Components
import { LiveEventStream } from './components/shared/LiveEventStream';
import { FloodAlertBanner } from './components/shared/FloodAlertBanner';
import { LiveEventsContext } from './context/LiveEventsContext';

// Theme Context
type Theme = 'day' | 'dusk' | 'night' | 'bright';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'day', setTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

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
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/alarms" element={<AlarmConsole />} />
                <Route path="/historical" element={<HistoricalViewer />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/soe" element={<SoePanel />} />
                <Route path="/system" element={<SystemMonitor />} />
                <Route path="/admin/*" element={<Administration />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
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

  const handleThemeChange = () => {
    const themes: Theme[] = ['day', 'dusk', 'night', 'bright'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <LiveEventsContext.Provider value={{ showLiveEvents, toggleLiveEvents }}>
    <div className={`app-root${showLiveEvents ? '' : ' app-root--events-hidden'}`}>
      {/* Flood Alert Banner */}
      {floodAlert && <FloodAlertBanner alert={floodAlert} />}

      {/* OpenBridge Top Bar */}
      <div className="app-topbar">
        <div className="app-topbar__inner">
          <ObcTopBar
            appTitle="AMS"
            pageTitle="Alarm Management System"
            showDivider={true}
          >
            <div slot="alerts" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {criticalCount > 0 && (
                <ObcAlertButton
                  alert-type="alarm"
                  count={criticalCount}
                  acknowledged={false}
                />
              )}
              {unackedCount > 0 && (
                <ObcAlertButton
                  alert-type="warning"
                  count={unackedCount}
                  acknowledged={false}
                />
              )}
            </div>
          </ObcTopBar>

          <div className="app-topbar__controls">
            <ObcButton
              variant={showLiveEvents ? 'normal' : 'flat'}
              size="small"
              onClick={toggleLiveEvents}
            >
              {showLiveEvents ? 'Hide Events' : 'Show Events'}
            </ObcButton>

            <ObcButton
              variant="flat"
              size="small"
              onClick={handleThemeChange}
            >
              {theme.toUpperCase()}
            </ObcButton>

            <div className={`app-topbar__status${connSt === 'Connected' ? ' app-topbar__status--live' : ''}`}>
              <div className="app-topbar__status-dot" />
              <span>{connSt === 'Connected' ? 'LIVE' : connSt}</span>
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
        >
          Live Events ▸
        </button>
      )}
    </div>
    </LiveEventsContext.Provider>
  );
};

// Navigation items
const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '📊', group: 'Operations' },
  { path: '/alarms', label: 'Active Alarms', icon: '🔔', group: 'Operations', badge: 'alarms' },
  { path: '/historical', label: 'Historical Viewer', icon: '📜', group: 'Operations' },
  { path: '/soe', label: 'Sequence of Events', icon: '⏱️', group: 'Operations' },
  { path: '/analytics', label: 'Analytics', icon: '📈', group: 'Analysis' },
  { path: '/system', label: 'System Monitor', icon: '⚙️', group: 'Infrastructure' },
  { path: '/admin/users', label: 'User Management', icon: '👤', group: 'Administration' },
  { path: '/admin/alarm-feed', label: 'Alarm Feed', icon: '📡', group: 'Administration' },
  { path: '/admin/alarm-rules', label: 'Alarm Rules', icon: '📋', group: 'Administration' },
  { path: '/admin/notifications', label: 'Notifications', icon: '🔔', group: 'Administration' },
  { path: '/admin/audit', label: 'Audit Log', icon: '📒', group: 'Administration' },
  { path: '/admin/system', label: 'System Settings', icon: '🔧', group: 'Administration' },
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
