'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAlarmStore } from './store/alarmStore';
import { useAuthStore } from './store/authStore';
import { useMqttStore } from './store/mqttStore';
import { HubConnectionState } from '@microsoft/signalr';

// OpenBridge Components
import { ObiDashboard } from '@oicl/openbridge-webcomponents-react/icons/icon-dashboard';
import { ObiAlarm } from '@oicl/openbridge-webcomponents-react/icons/icon-alarm';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiTime } from '@oicl/openbridge-webcomponents-react/icons/icon-time';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiChart } from '@oicl/openbridge-webcomponents-react/icons/icon-chart';
import { ObiEditGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-edit-google';
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { ObiPlaceholder } from '@oicl/openbridge-webcomponents-react/icons/icon-placeholder';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import CommandPalette from './components/CommandPalette';
import SessionTimeoutDialog from './components/shared/SessionTimeoutDialog';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { DialogProvider } from './components/shared/dialogService';
import { expiredReason, markApiActivity } from './auth/sessionClock';

// H1: route-level boundary — a crashed page (or failed lazy chunk) renders a
// recover screen instead of white-screening the whole app; keyed by pathname so
// navigating away automatically resets the error state.
const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  // resetKey (not `key`): a crashed page clears on navigation, but a HEALTHY app
  // shell is never remounted — keying by pathname here used to remount the whole
  // shell (topbar + sidebar) on every click, resetting the sidebar's scroll to top.
  return (
    <ErrorBoundary scope="route" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
};


// Lazy-loaded pages
const Dashboard        = React.lazy(() => import('./components/Dashboard/Dashboard'));
const AlarmConsole     = React.lazy(() => import('./components/AlarmConsole/AlarmConsole'));
const Analytics        = React.lazy(() => import('./components/Analytics/Analytics'));
const HistoricalViewer = React.lazy(() => import('./components/HistoricalViewer/HistoricalViewer'));
const IoTDBTrendViewer = React.lazy(() => import('./components/IoTDBTrend/IoTDBTrendViewer'));
const LiveEventsPage   = React.lazy(() => import('./components/LiveEvents/LiveEventsPage'));
const SoePanel         = React.lazy(() => import('./components/Soe/SoePanel'));
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
const CpmInvestigation = React.lazy(() => import('./components/Cpm/CpmInvestigation'));
const CpmPipeline      = React.lazy(() => import('./components/Cpm/CpmPipeline'));
const CpmGovernance    = React.lazy(() => import('./components/Cpm/CpmGovernance'));
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
  // F: persist the theme — a night-shift control room reverting to 'day' on every
  // reload is hostile. Mirrors the LiveEvents preference idiom.
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('ams-theme');
      if (t === 'day' || t === 'bright' || t === 'night') return t;
    } catch { /* ignore */ }
    return 'day';
  });

  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    document.documentElement.setAttribute('data-obc-theme', theme);
    try { localStorage.setItem('ams-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Restore an existing session (silent refresh via the httpOnly cookie) once on load.
  useEffect(() => {
    void useAuthStore.getState().bootstrap().finally(() => setReady(true));
  }, []);

  // H1: background failures used to vanish (or blank the tree via an uncaught
  // rejection). Surface them: one toast + a console entry with the real error.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error('[AMS] Unhandled promise rejection', e.reason);
      toast.error('A background operation failed. See the browser console for details.', {
        toastId: 'unhandled-rejection', // collapse repeats into one toast
      });
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  // Session-policy watchdog: every 60s check the dual clocks — absolute first,
  // then idle (same order as the server) — and end the session with a typed
  // reason. Activity = authenticated REST via apiFetch OR deliberate user
  // interaction (see below). SignalR/MQTT push traffic still does NOT count, so an
  // unattended console receiving live data alone still idles out.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const watchdogId = setInterval(() => {
      const reason = expiredReason();
      if (reason) void useAuthStore.getState().endSession(reason);
    }, 60_000);
    return () => clearInterval(watchdogId);
  }, [authStatus]);

  // A user actively working the console shouldn't be logged out just because their
  // clicks/keystrokes didn't happen to fire a REST call. Deliberate interaction —
  // pointerdown / keydown (NOT incidental mousemove) — marks activity too, throttled
  // so we touch localStorage at most ~2×/min. Combined with the in-window proactive
  // refresh, an active session stays alive; a truly unattended one still idles out.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let last = 0;
    const onInteract = () => {
      const now = Date.now();
      if (now - last < 30_000) return;
      last = now;
      markApiActivity();
    };
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract, { passive: true });
    window.addEventListener('wheel', onInteract, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
      window.removeEventListener('wheel', onInteract);
    };
  }, [authStatus]);

  // Connect to live services only while authenticated; tear down on logout.
  // H4: keyed on authStatus ONLY — this used to also key on accessToken, so
  // every ~1h token rotation ran the cleanup (killing SignalR AND the MQTT
  // socket) and the re-run only revived the alarm hub: MQTT stayed dead until
  // some component remounted, freezing the Live Events rail and open displays.
  // The hub reads the CURRENT token via its accessTokenFactory (alarmStore),
  // so rotation needs no transport teardown at all.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    let cancelled = false;
    void useAlarmStore
      .getState()
      .initialize(token)
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
      // FE-06: close the MQTT socket too — it used to outlive the session for the
      // tab's lifetime, so a signed-out console kept streaming live plant data.
      useMqttStore.getState().disconnect();
    };
  }, [authStatus]);

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
            theme={theme === 'night' ? 'dark' : 'light'}
          />
          {/* Why the session ended (idle/absolute) — survives the redirect to /login. */}
          <SessionTimeoutDialog />
          <DialogProvider>
          <RouteErrorBoundary>
          <Routes>
            {/* Login — standalone, no sidebar/topbar */}
            <Route
              path="/login"
              element={
                <React.Suspense fallback={<RouteFallback />}>
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
                      <React.Suspense fallback={<RouteFallback />}>
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
                    <React.Suspense fallback={<RouteFallback />}>
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
                    <React.Suspense fallback={<RouteFallback />}>
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
                    <React.Suspense fallback={<RouteFallback />}>
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
                  <React.Suspense fallback={<RouteFallback />}>
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
                      <Route path="/cpm/investigation" element={<RequirePermission permission="analytics.view"><CpmInvestigation /></RequirePermission>} />
                      <Route path="/cpm/pipeline"  element={<RequirePermission permission="analytics.view"><CpmPipeline /></RequirePermission>} />
                      <Route path="/cpm/governance" element={<RequirePermission permission="analytics.view"><CpmGovernance /></RequirePermission>} />
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
                      <Route path="/edge"       element={<RequirePermission permission="historian.view"><EdgeNodeMonitor /></RequirePermission>} />
                      {/* Administration — was reachable by ANY authenticated user via direct URL */}
                      <Route path="/admin/*"    element={<RequirePermission permission="admin.users.edit" anyOf={['admin.users.edit', 'admin.audit.view', 'rbac.manage', 'ingestion.view', 'ingestion.manage', 'asset.edit']}><Administration /></RequirePermission>} />
                      <Route path="*"           element={<Navigate to="/dashboard" replace />} />
                    </Routes>
                  </React.Suspense>
                </AppShell>
                </RequireAuth>
              }
            />
          </Routes>
          </RouteErrorBoundary>
          </DialogProvider>
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
      {/* ⌘K / Ctrl+K palette (Phase 7 F0.4) — searches nav, loops, calculations */}
      <CommandPalette navItems={navItems} />
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
                border: `1px solid ${criticalCount > 0 ? 'var(--alert-alarm-color)' : TB.border}`,
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
                  <span style={{ color: 'var(--alert-warning-color)' }}>
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
              border: `1px solid ${isConnected ? TB.successBorder : 'var(--alert-alarm-color)'}`,
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

      {/* Live Events Panel — toggled via top bar.
          FE-01: the panel must UNMOUNT when hidden, not just get a CSS class. While it
          is mounted it holds the plant-wide DDATA firehose subscription (ref-counted in
          mqttStore) — a permanently-mounted-but-hidden panel meant every logged-in
          client streamed the whole plant forever. Unmounting runs its effect cleanup,
          which drops the firehose ref and unsubscribes at the broker. */}
      {showLiveEvents && (
        <aside className="app-events">
          <LiveEventStream />
        </aside>
      )}

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
  // ── Analysis ──────────────────────────────────────────────
  { path: '/analytics',  label: 'Analytics',           Icon: ObiChart, group: 'Analysis', permission: 'analytics.view' },
  // ── Loop Performance (CPLM Phase 7) ───────────────────────
  { path: '/cpm',              label: 'Overview',           Icon: ObiDashboard, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/performance',  label: 'Performance',        Icon: ObiChart, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/explorer',     label: 'Loop Explorer',      Icon: ObiDatabase, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/historical',   label: 'Historical',         Icon: ObiHistoryGoogle, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/windows',      label: 'Window Inspector',   Icon: ObiTime, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/replay',       label: 'Evidence Replay',    Icon: ObiTrend, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/investigation', label: 'Investigation',     Icon: ObiEditGoogle, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/pipeline',     label: 'Pipeline Health',    Icon: ObiMonitoring, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/governance',   label: 'Governance',         Icon: ObiUser, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/calculations', label: 'Calculations',       Icon: ObiListAltCheckGoogle, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/registry',     label: 'Loop Registry',      Icon: ObiWrench, group: 'Loop Performance', permission: 'analytics.view' },
  { path: '/cpm/events',       label: 'Loop Events',        Icon: ObiNotification, group: 'Loop Performance', permission: 'analytics.view' },
  // ── HMI displays (runtime for everyone, Designer for authors) ──
  { path: '/displays',   label: 'HMI Displays',        Icon: ObiMonitoring, group: 'Design', permission: 'display.view' },
  { path: '/designer',   label: 'HMI Designer',        Icon: ObiEditGoogle, group: 'Design', permission: 'display.edit' },
  // ── Infrastructure (edge + system monitoring) ─────────────
  // SystemMonitor was removed in Phase 7 S6: its job table and latency metrics were
  // fabricated and its data endpoint never existed. /cpm/pipeline is the real one.
  { path: '/edge',       label: 'Edge Node Monitor',   Icon: ObiPlaceholder,  group: 'Infrastructure', permission: 'historian.view' },
  // ── Administration (ONE entry — the hub's own 7-tab bar handles the sections;
  //    a bare /admin lands on the first tab the user can see via the hub's index
  //    redirect). Visible to anyone holding ANY admin permission — matches the
  //    /admin/* route's anyOf guard, so an auditor or rbac-manager still sees it. ──
  { path: '/admin',      label: 'Administration',      Icon: ObiUser, group: 'Administration', permission: 'admin.users.edit', anyOf: ['admin.users.edit', 'admin.audit.view', 'rbac.manage'] },
  // ── Diagnostics (engineer/E2E tooling — moved out of the primary Historical nav) ──
  { path: '/iotdb-trend', label: 'IoTDB Trend Viewer',  Icon: ObiDatabase, group: 'Diagnostics', permission: 'historian.view' },
];

// Collapsed nav groups persist across navigation and reload, so an operator who
// closes the sections they don't use keeps them closed. Stored as the list of
// COLLAPSED group names (default: nothing collapsed → same as before).
const NAV_COLLAPSED_KEY = 'ams-nav-collapsed-groups';
function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

const Sidebar: React.FC<{ unackedCount: number }> = ({ unackedCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  // `anyOf` (e.g. the single Administration entry) shows when the user holds ANY
  // of the listed permissions; otherwise fall back to the single `permission`.
  const visibleNavItems = navItems.filter(i => {
    const anyOf = (i as { anyOf?: string[] }).anyOf;
    if (anyOf) return anyOf.some(p => hasPermission(p));
    return !i.permission || hasPermission(i.permission);
  });
  const groups = [...new Set(visibleNavItems.map(i => i.group))];

  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsedGroups);

  // F: exact, or a real path-segment boundary — the old startsWith kept '/cpm'
  // active on every '/cpm/*' page, double-highlighting the sidebar.
  const isActivePath = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
  const activeGroup = visibleNavItems.find(i => isActivePath(i.path))?.group;

  const toggleGroup = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      try { localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <nav style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
      {groups.map(group => {
        // The group holding the current page is always shown, even if the user
        // collapsed it — so navigation (e.g. via ⌘K) never lands on a hidden item.
        const open = !collapsed.has(group) || group === activeGroup;
        const groupItems = visibleNavItems.filter(i => i.group === group);
        return (
          <div key={group} className="nav-section">
            <button
              type="button"
              className="nav-section__title nav-section__title--toggle"
              onClick={() => toggleGroup(group)}
              aria-expanded={open}
            >
              <span>{group}</span>
              <span className="nav-section__chevron">
                {open ? <ObiChevronDownGoogle /> : <ObiChevronRightGoogle />}
              </span>
            </button>
            {open && groupItems.map(item => {
              const isActive = isActivePath(item.path);
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
        );
      })}
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
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />;
  }
  return <>{children}</>;
};

// Phase K — route-level authorization. Authentication alone is not enough: an Operator who types a
// Designer URL must be REDIRECTED, not shown a partially-rendered editor. (Note this also closes the
// pre-existing gap where /admin/users was merely hidden from the nav but still directly reachable.)
export const RequirePermission: React.FC<{
  permission: string;
  /** F: any-of gate — the route opens if the user holds ANY of these (the umbrella
   *  /admin/* guard uses it so an auditor/rbac-manager isn't bounced by the
   *  users.edit requirement; the hub's per-tab guards then do the fine gating). */
  anyOf?: string[];
  children: React.ReactNode;
}> = ({ permission, anyOf, children }) => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const location = useLocation();
  const allowed = anyOf ? anyOf.some(p => hasPermission(p)) : hasPermission(permission);
  if (!allowed) {
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

// Shown ONLY while the session bootstrap / auth handshake is genuinely in flight.
const LoadingScreen: React.FC = () => (
  <div className="loading-screen">
    <div className="spinner" />
    <p style={{ color: 'var(--on-container-neutral-color)', fontSize: '14px' }}>
      Connecting to AMS...
    </p>
  </div>
);

// FE-05 / UX: lazy route chunks used to fall back to the full "Connecting to AMS..."
// screen, so EVERY first visit to a page flashed a scary connection message for what
// is just a code-split download. Route transitions get this quiet, honest fallback
// instead; the connection wording stays reserved for the real auth bootstrap above.
const RouteFallback: React.FC = () => (
  <div className="loading-screen" style={{ minHeight: '200px' }}>
    <div className="spinner" />
    <p style={{ color: 'var(--on-container-neutral-color)', fontSize: '13px' }}>
      Loading…
    </p>
  </div>
);

export default App;
