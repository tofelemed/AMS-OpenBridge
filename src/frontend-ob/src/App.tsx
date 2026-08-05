'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAlarmStore } from './store/alarmStore';
import { useAuthStore } from './store/authStore';
import { HubConnectionState } from '@microsoft/signalr';

// OpenBridge Components
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiDashboard } from '@oicl/openbridge-webcomponents-react/icons/icon-dashboard';
import { ObiAlarm } from '@oicl/openbridge-webcomponents-react/icons/icon-alarm';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiTime } from '@oicl/openbridge-webcomponents-react/icons/icon-time';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiChart } from '@oicl/openbridge-webcomponents-react/icons/icon-chart';
import { ObiEditGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-edit-google';
import { ObiSettingsIec } from '@oicl/openbridge-webcomponents-react/icons/icon-settings-iec';
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { ObiPlaceholder } from '@oicl/openbridge-webcomponents-react/icons/icon-placeholder';


// Lazy-loaded pages
const Dashboard        = React.lazy(() => import('./components/Dashboard/Dashboard'));
const AlarmConsole     = React.lazy(() => import('./components/AlarmConsole/AlarmConsole'));
const Analytics        = React.lazy(() => import('./components/Analytics/Analytics'));
const HistoricalViewer = React.lazy(() => import('./components/HistoricalViewer/HistoricalViewer'));
const IoTDBTrendViewer = React.lazy(() => import('./components/IoTDBTrend/IoTDBTrendViewer'));
const LiveEventsPage   = React.lazy(() => import('./components/LiveEvents/LiveEventsPage'));
const SoePanel         = React.lazy(() => import('./components/Soe/SoePanel'));
const SystemMonitor    = React.lazy(() => import('./components/SystemMonitor/SystemMonitor'));
// CPLM Phase 7 — Loop Performance screens (built slice by slice; see
// docs/cplm-intake/phase7-frontend-checklist.md)
const CpmLoopRegistry  = React.lazy(() => import('./components/Cpm/LoopRegistry'));
const CpmEvents        = React.lazy(() => import('./components/Cpm/CpmEvents'));
const CpmOverview      = React.lazy(() => import('./components/Cpm/CpmOverview'));
const CpmPerformance   = React.lazy(() => import('./components/Cpm/CpmPerformance'));
const CpmExplorer      = React.lazy(() => import('./components/Cpm/CpmExplorer'));
const CpmCalculations  = React.lazy(() => import('./components/Cpm/CpmCalculations'));
const CpmHistorical    = React.lazy(() => import('./components/Cpm/CpmHistorical'));
const CpmWindows       = React.lazy(() => import('./components/Cpm/CpmWindows'));
const CpmReplay        = React.lazy(() => import('./components/Cpm/CpmReplay'));
const EdgeNodeMonitor  = React.lazy(() => import('./components/EdgeNodeMonitor/EdgeNodeMonitor'));
const Administration   = React.lazy(() => import('./components/Administration/Administration'));
// HMI Designer (Phase 2)
const DisplayList      = React.lazy(() => import('./components/Designer/DisplayList'));
const DesignerPage     = React.lazy(() => import('./components/Designer/DesignerPage'));
// Standalone runtime viewer (Phase B) — rendered chrome-free, outside the AppShell.
const DisplayViewer    = React.lazy(() => import('./components/Designer/DisplayViewer'));
const ImportPage       = React.lazy(() => import('./components/Designer/ImportPage'));
// Dedicated trend view (Phase J) — deep-linkable /trend?tags=a,b,c
const TrendPage        = React.lazy(() => import('./components/Designer/TrendPage'));
// Published-HMI launcher (Phase K) — the Operator/Viewer entry point into the runtime viewer.
const DisplayLauncher  = React.lazy(() => import('./components/Designer/DisplayLauncher'));
// Login (Phase auth) — standalone, outside the AppShell.
const Login            = React.lazy(() => import('./components/Login/Login'));

// Shared Components
import { LiveEventStream } from './components/shared/LiveEventStream';
import { FloodAlertBanner } from './components/shared/FloodAlertBanner';
import { LiveEventsContext } from './context/LiveEventsContext';

// Theme Context — Day, Bright, Night (Phase H: night = control-room high-contrast)
type Theme = 'day' | 'bright' | 'night';
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'day', setTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

// Shell palette. These are applied via inline style={{}}, which beats every stylesheet — so when they
// were raw hex the app shell could never follow the day/night theme. They are now OpenBridge tokens
// (valid inside an inline style value), so the shell re-themes with everything else.
const TB = {
  blue: 'var(--selected-enabled-background-color)',
  blueLight: 'var(--container-section-color)',
  blueMuted: 'var(--border-divider-color)',
  bg: 'var(--container-backdrop-color)',
  card: 'var(--container-background-color)',
  border: 'var(--border-divider-color)',
  text: 'var(--element-active-color)',
  textSub: 'var(--element-neutral-color)',
  textMuted: 'var(--element-inactive-color)',
  success: 'var(--alert-running-color)',
  successBg: 'var(--container-section-color)',
  successBorder: 'var(--alert-running-color)',
  critical: 'var(--alert-alarm-color)',
  criticalBg: 'var(--container-section-color)',
  radiusSm: 'var(--border-radius-br-8)',
  shadow: 'var(--shadow-flat)',
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

  const authStatus = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    document.documentElement.setAttribute('data-obc-theme', theme);
  }, [theme]);

  // Restore an existing session (silent refresh via the httpOnly cookie) once on load.
  useEffect(() => {
    void useAuthStore.getState().bootstrap().finally(() => setReady(true));
  }, []);

  // Connect to live services only while authenticated; tear down on logout.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !accessToken) return;

    let cancelled = false;
    void useAlarmStore
      .getState()
      .initialize(accessToken)
      .catch((e) => console.warn('[AMS] Live initialization failed, degraded mode', e));

    const refreshId = setInterval(() => {
      if (cancelled) return;
      const { connectionState } = useAlarmStore.getState();
      // SignalR pushes live updates; polling is a fallback when the hub is down.
      if (connectionState === HubConnectionState.Connected) return;
      void useAlarmStore.getState().refreshActiveAlarms().catch(() => {});
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(refreshId);
      void useAlarmStore.getState().disconnect();
    };
  }, [authStatus, accessToken]);

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
          <Routes>
            {/* Login — standalone, no sidebar/topbar */}
            <Route
              path="/login"
              element={
                <React.Suspense fallback={<LoadingScreen />}>
                  <Login />
                </React.Suspense>
              }
            />
            {/* /designer/import must be declared at THIS tier, not nested inside the /* shell branch
                below. React Router ranks a literal segment ("import") above a dynamic one (":id")
                when comparing siblings within the SAME <Routes> — but /designer/:id lives here at the
                top level while /designer/import was nested one level down inside /*, so :id was
                winning the outer match before the inner route was ever even considered. Visiting
                /designer/import rendered the CANVAS EDITOR with id="import", which 404'd on every
                /api/displays/import* call. Keep it inside the app shell (sidebar/topbar) — it's a
                form/upload page, not the full-screen canvas editor. */}
            <Route
              path="/designer/import"
              element={
                <RequireAuth>
                  <RequirePermission permission="display.edit">
                    <AppShell>
                      <React.Suspense fallback={<LoadingScreen />}>
                        <ImportPage />
                      </React.Suspense>
                    </AppShell>
                  </RequirePermission>
                </RequireAuth>
              }
            />
            {/* The Designer runs full-viewport, OUTSIDE the app shell.
                Inside the shell it only got ~1420px of a 1920px screen (sidebar + events rail), which
                is why its 31-control toolbar overflowed and a 1920px artboard could never be seen at
                100%. It is an authoring workspace, not a page — same treatment as the runtime viewer. */}
            <Route
              path="/designer/:id"
              element={
                <RequireAuth>
                  <RequirePermission permission="display.edit">
                    <React.Suspense fallback={<LoadingScreen />}>
                      <DesignerPage />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
              }
            />
            {/* Standalone runtime viewer — no sidebar/topbar, but NOT anonymous: Phase K requires a
                session (display-service now enforces display.view on reads). */}
            <Route
              path="/display/:id"
              element={
                <RequireAuth>
                  <RequirePermission permission="display.view">
                    <React.Suspense fallback={<LoadingScreen />}>
                      <DisplayViewer />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
              }
            />
            {/* Phase 4 — personal (operator-owned) views render through the same runtime viewer. */}
            <Route
              path="/my-view/:id"
              element={
                <RequireAuth>
                  <RequirePermission permission="display.view">
                    <React.Suspense fallback={<LoadingScreen />}>
                      <DisplayViewer source="personal-view" />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
              }
            />
            {/* Everything else runs inside the app shell (auth-gated) */}
            <Route
              path="/*"
              element={
                <RequireAuth>
                <AppShell>
                  <React.Suspense fallback={<LoadingScreen />}>
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      {/* EVERY route carries the permission its APIs require, so a direct URL can never
                          render a page the role's token would only get 401/403 from. The service is still
                          the boundary that actually holds — this just stops us rendering a dead page. */}
                      {/* Live Operations */}
                      <Route path="/dashboard"    element={<RequirePermission permission="alarm.view"><Dashboard /></RequirePermission>} />
                      <Route path="/alarms"       element={<RequirePermission permission="alarm.view"><AlarmConsole /></RequirePermission>} />
                      <Route path="/live-events"  element={<RequirePermission permission="alarm.view"><LiveEventsPage /></RequirePermission>} />
                      <Route path="/soe"          element={<RequirePermission permission="soe.view"><SoePanel /></RequirePermission>} />
                      {/* Historical */}
                      <Route path="/historical"   element={<RequirePermission permission="alarm.view"><HistoricalViewer /></RequirePermission>} />
                      {/* Legacy IoTDB explorer — moved off /trend, which is now the Phase J trend view */}
                      <Route path="/iotdb-trend"  element={<RequirePermission permission="historian.view"><IoTDBTrendViewer /></RequirePermission>} />
                      {/* Analysis */}
                      <Route path="/analytics"    element={<RequirePermission permission="analytics.view"><Analytics /></RequirePermission>} />

                      {/* ── Loop Performance (CPLM) ─────────────────── */}
                      <Route path="/cpm"             element={<RequirePermission permission="analytics.view"><CpmOverview /></RequirePermission>} />
                      <Route path="/cpm/performance" element={<RequirePermission permission="analytics.view"><CpmPerformance /></RequirePermission>} />
                      <Route path="/cpm/explorer"     element={<RequirePermission permission="analytics.view"><CpmExplorer /></RequirePermission>} />
                      <Route path="/cpm/calculations" element={<RequirePermission permission="analytics.view"><CpmCalculations /></RequirePermission>} />
                      <Route path="/cpm/historical" element={<RequirePermission permission="analytics.view"><CpmHistorical /></RequirePermission>} />
                      <Route path="/cpm/windows"   element={<RequirePermission permission="analytics.view"><CpmWindows /></RequirePermission>} />
                      <Route path="/cpm/replay"    element={<RequirePermission permission="analytics.view"><CpmReplay /></RequirePermission>} />
                      <Route path="/cpm/registry"  element={<RequirePermission permission="analytics.view"><CpmLoopRegistry /></RequirePermission>} />
                      <Route path="/cpm/events"    element={<RequirePermission permission="analytics.view"><CpmEvents /></RequirePermission>} />
                      {/* Published-HMI launcher — every role with display.view */}
                      <Route path="/displays"       element={<RequirePermission permission="display.view"><DisplayLauncher /></RequirePermission>} />
                      {/* HMI Designer — authoring, Admin/Engineer only */}
                      <Route path="/designer"       element={<RequirePermission permission="display.edit"><DisplayList /></RequirePermission>} />
                      {/* /designer/import and /designer/:id are both standalone routes declared above,
                          outside this shell's nested <Routes> — see the top-level block for why. */}
                      {/* Dedicated trend view (Phase J) — needs history + binding resolution */}
                      <Route path="/trend"          element={<RequirePermission permission="historian.view"><TrendPage /></RequirePermission>} />
                      {/* Infrastructure */}
                      <Route path="/system"     element={<RequirePermission permission="historian.view"><SystemMonitor /></RequirePermission>} />
                      <Route path="/edge"       element={<RequirePermission permission="historian.view"><EdgeNodeMonitor /></RequirePermission>} />
                      {/* Administration — was reachable by ANY authenticated user via direct URL */}
                      <Route path="/admin/*"    element={<RequirePermission permission="admin.users.edit"><Administration /></RequirePermission>} />
                      <Route path="*"           element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </React.Suspense>
                </AppShell>
                </RequireAuth>
              }
            />
          </Routes>
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
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const [showLiveEvents, setShowLiveEvents] = useState(readLiveEventsPreference);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // Full-height pages manage their own internal scroll regions.
  // (/designer/:id is no longer here — it renders outside the shell entirely.)
  const isFullHeightPage =
    location.pathname === '/alarms' ||
    location.pathname === '/live-events';

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
              {(['day', 'bright', 'night'] as Theme[]).map(t => (
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

            {/* User + sign out */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              paddingLeft: '10px', borderLeft: `1px solid ${TB.border}`,
            }}>
              {user && (
                <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: TB.text }}>
                    {user.full_name || user.username}
                  </div>
                  <div style={{ fontSize: '10.5px', fontWeight: 600, color: TB.textMuted }}>
                    {user.role}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleLogout()}
                style={{
                  padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                  borderRadius: TB.radiusSm, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${TB.border}`, background: TB.card, color: TB.textSub,
                }}
              >
                Sign out
              </button>
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
  // `permission` must match the route guard for the same path (see the Routes block) — a nav entry that
  // is visible but redirects on click is worse than no entry at all.
  { path: '/dashboard',    label: 'Dashboard',          Icon: ObiDashboard, group: 'Live Operations',  badge: undefined as string | undefined, permission: 'alarm.view' },
  { path: '/alarms',       label: 'Active Alarms',       Icon: ObiAlarm, group: 'Live Operations',  badge: 'alarms', permission: 'alarm.view' },
  { path: '/live-events',  label: 'Live Events',         Icon: ObiMonitoring, group: 'Live Operations', permission: 'alarm.view' },
  { path: '/soe',          label: 'Sequence of Events',  Icon: ObiTime,  group: 'Live Operations', permission: 'soe.view' },
  // ── Historical (PostgreSQL + IoTDB) ───────────────────────
  { path: '/historical', label: 'Alarm History',       Icon: ObiHistoryGoogle, group: 'Historical', permission: 'alarm.view' },
  { path: '/trend',       label: 'Trend',               Icon: ObiTrend, group: 'Historical', permission: 'historian.view' },
  { path: '/iotdb-trend', label: 'IoTDB Trend Viewer',  Icon: ObiDatabase, group: 'Historical', permission: 'historian.view' },
  // ── Analysis ──────────────────────────────────────────────
  { path: '/analytics',  label: 'Analytics',           Icon: ObiChart, group: 'Analysis', permission: 'analytics.view' },
  // ── Loop Performance (CPLM Phase 7) ───────────────────────
  { path: '/cpm',              label: 'Overview',           Icon: ObiDashboard, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/performance',  label: 'Performance',        Icon: ObiChart, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/explorer',     label: 'Loop Explorer',      Icon: ObiDatabase, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/historical',   label: 'Historical',         Icon: ObiHistoryGoogle, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/windows',      label: 'Window Inspector',   Icon: ObiTime, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/replay',       label: 'Evidence Replay',    Icon: ObiTrend, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/calculations', label: 'Calculations',       Icon: ObiListAltCheckGoogle, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/registry',     label: 'Loop Registry',      Icon: ObiWrench, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/events',       label: 'Loop Events',        Icon: ObiNotification, group: 'Loop Performance', permission: 'analytics.view' },
  // ── HMI displays (runtime for everyone, Designer for authors) ──
  { path: '/displays',   label: 'HMI Displays',        Icon: ObiMonitoring, group: 'Design', permission: 'display.view' },
  { path: '/designer',   label: 'HMI Designer',        Icon: ObiEditGoogle, group: 'Design', permission: 'display.edit' },
  // ── Infrastructure (edge + system monitoring) ─────────────
  { path: '/system',     label: 'System Monitor',      Icon: ObiSettingsIec,  group: 'Infrastructure', permission: 'historian.view' },
  { path: '/edge',       label: 'Edge Node Monitor',   Icon: ObiPlaceholder,  group: 'Infrastructure', permission: 'historian.view' },
  // ── Administration (admin only — the whole section, not just User Management) ──
  { path: '/admin/users',         label: 'User Management',  Icon: ObiUser, group: 'Administration', permission: 'admin.users.edit' },
  { path: '/admin/alarm-feed',    label: 'Alarm Feed',       Icon: ObiMonitoring, group: 'Administration', permission: 'admin.users.edit' },
  { path: '/admin/alarm-rules',   label: 'Alarm Rules',      Icon: ObiListAltCheckGoogle, group: 'Administration', permission: 'admin.users.edit' },
  { path: '/admin/notifications', label: 'Notifications',    Icon: ObiNotification, group: 'Administration', permission: 'admin.users.edit' },
  { path: '/admin/audit',         label: 'Audit Log',        Icon: ObiListAltCheckGoogle, group: 'Administration', permission: 'admin.audit.view' },
  { path: '/admin/system',        label: 'System Settings',  Icon: ObiWrench, group: 'Administration', permission: 'admin.users.edit' },
];

const Sidebar: React.FC<{ unackedCount: number }> = ({ unackedCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const visibleNavItems = navItems.filter(i => !i.permission || hasPermission(i.permission));
  const groups = [...new Set(visibleNavItems.map(i => i.group))];

  return (
    <nav style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
      {groups.map(group => (
        <div key={group} className="nav-section">
          <div className="nav-section__title">{group}</div>
          {visibleNavItems.filter(i => i.group === group).map(item => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <button
                key={item.path}
                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                {/* OpenBridge icons, not emoji: emoji render differently per-OS, ignore the theme, and
                    are not part of the design system. Where OpenBridge has no matching icon we use
                    ObiPlaceholder rather than inventing one. */}
                <span className="nav-item__icon"><item.Icon /></span>
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

// Redirects to /login unless a session is active. Assumes bootstrap() has run
// (App gates render on `ready`), so status is 'authenticated' or 'unauthenticated'.
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();

  if (status === 'idle' || status === 'authenticating') {
    return <LoadingScreen />;
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
};

// Phase K — route-level authorization. Authentication alone is not enough: an Operator who types a
// Designer URL must be REDIRECTED, not shown a partially-rendered editor. (Note this also closes the
// pre-existing gap where /admin/users was merely hidden from the nav but still directly reachable.)
export const RequirePermission: React.FC<{ permission: string; children: React.ReactNode }> = ({
  permission,
  children,
}) => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const location = useLocation();
  if (!hasPermission(permission)) {
    // Land somewhere the role CAN use — the published-display launcher. If they can't use that either,
    // say so rather than bouncing between two forbidden routes forever.
    if (!hasPermission('display.view') || location.pathname === '/displays') {
      return (
        <div className="app-forbidden" data-testid="forbidden">
          <h2>Not authorized</h2>
          <p>Your role does not have the <code>{permission}</code> permission.</p>
        </div>
      );
    }
    return <Navigate to="/displays" replace />;
  }
  return <>{children}</>;
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
