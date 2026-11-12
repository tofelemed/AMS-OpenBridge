'use client';

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAlarmStore } from './store/alarmStore';
import { useAuthStore } from './store/authStore';
import { useMqttStore } from './store/mqttStore';
import { HubConnectionState } from '@microsoft/signalr';

import { ThemeProvider, useTheme } from './theme/ThemeContext';

// Legacy pages still import this from here (UI-012).
export { useTheme };

import { AppRoutes } from './app/AppRoutes';
import { LoadingScreen, RequireAuth, RequirePermission, RouteFallback } from './app/guards';
import { LegacyShell } from './app/LegacyShell';
import { AppShell } from './ui/shell/AppShell';
import SessionTimeoutDialog from './components/shared/SessionTimeoutDialog';
import ErrorBoundary from './components/shared/ErrorBoundary';
import ConnectivityBanner from './components/shared/ConnectivityBanner';
import { reportApiError, reportApiSuccess } from './api/apiHealth';
import { DialogProvider } from './components/shared/dialogService';
import { expiredReason, markApiActivity } from './auth/sessionClock';
import { CPA_SLICE_ONLY, HOME_PATH } from './productSlice';

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


// HMI Designer and the standalone viewer run outside the shell routes.
const DesignerPage     = React.lazy(() => import('./components/Designer/DesignerPage'));
const DisplayViewer    = React.lazy(() => import('./components/Designer/DisplayViewer'));
const ImportPage       = React.lazy(() => import('./components/Designer/ImportPage'));
const Login            = React.lazy(() => import('./components/Login/Login'));

/** The slice runs the Traverse shell. A full build keeps the old one. */
const ShellFor = CPA_SLICE_ONLY ? AppShell : LegacyShell;

/**
 * Every query and mutation failure now passes through one place.
 *
 * Two gaps this closes. First, no API failure was ever logged or counted — each
 * one was visible to the operator and invisible to us. Second, when the gateway
 * is down every panel fails separately, so the screen filled with identical
 * error cards and none of them said "the API is unreachable". `apiHealth`
 * classifies the failure (transport vs 5xx vs a correct 4xx) and the
 * ConnectivityBanner states it once. Panel-level errors are untouched: they name
 * WHICH read failed, which is the thing this product must not hide.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // CHG-176: a read that handles its own failure quietly (the Designer's lazy loop-registry check) logs nothing.
      if (query.meta?.quietOnError) return;
      console.error('[query]', query.queryKey, error);
      reportApiError(error);
    },
    onSuccess: () => reportApiSuccess(),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      console.error('[mutation]', mutation.options.mutationKey ?? '(unkeyed)', error);
      reportApiError(error);
    },
    onSuccess: () => reportApiSuccess(),
  }),
});

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const authStatus = useAuthStore((s) => s.status);

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
    if (!CPA_SLICE_ONLY) {
      void useAlarmStore
        .getState()
        .initialize(token)
        .catch((e) => console.warn('[AMS] Live initialization failed, degraded mode', e));
    }

    const refreshId = setInterval(() => {
      if (cancelled || CPA_SLICE_ONLY) return;
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
    <ThemeProvider>
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
            theme="light"
          />
          {/* Why the session ended (idle/absolute) — survives the redirect to /login. */}
          <SessionTimeoutDialog />
          <DialogProvider>
          <ConnectivityBanner />
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
                CPA_SLICE_ONLY ? (
                  <RequireAuth><Navigate to={HOME_PATH} replace /></RequireAuth>
                ) : (
                <RequireAuth>
                  <RequirePermission permission="display.edit">
                    <ShellFor>
                      <React.Suspense fallback={<RouteFallback />}>
                        <ImportPage />
                      </React.Suspense>
                    </ShellFor>
                  </RequirePermission>
                </RequireAuth>
                )
              }
            />
            {/* The Designer runs full-viewport, OUTSIDE the app shell.
                Inside the shell it only got ~1420px of a 1920px screen (sidebar + events rail), which
                is why its 31-control toolbar overflowed and a 1920px artboard could never be seen at
                100%. It is an authoring workspace, not a page — same treatment as the runtime viewer. */}
            <Route
              path="/designer/:id"
              element={
                CPA_SLICE_ONLY ? (
                  <RequireAuth><Navigate to={HOME_PATH} replace /></RequireAuth>
                ) : (
                <RequireAuth>
                  <RequirePermission permission="display.edit">
                    <React.Suspense fallback={<RouteFallback />}>
                      <DesignerPage />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
                )
              }
            />
            {/* Standalone runtime viewer — no sidebar/topbar, but NOT anonymous: Phase K requires a
                session (display-service now enforces display.view on reads). */}
            <Route
              path="/display/:id"
              element={
                CPA_SLICE_ONLY ? (
                  <RequireAuth><Navigate to={HOME_PATH} replace /></RequireAuth>
                ) : (
                <RequireAuth>
                  <RequirePermission permission="display.view">
                    <React.Suspense fallback={<RouteFallback />}>
                      <DisplayViewer />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
                )
              }
            />
            {/* Phase 4 — personal (operator-owned) views render through the same runtime viewer. */}
            <Route
              path="/my-view/:id"
              element={
                CPA_SLICE_ONLY ? (
                  <RequireAuth><Navigate to={HOME_PATH} replace /></RequireAuth>
                ) : (
                <RequireAuth>
                  <RequirePermission permission="display.view">
                    <React.Suspense fallback={<RouteFallback />}>
                      <DisplayViewer source="personal-view" />
                    </React.Suspense>
                  </RequirePermission>
                </RequireAuth>
                )
              }
            />
            {/* Everything else runs inside the app shell (auth-gated) */}
            <Route
              path="/*"
              element={
                <RequireAuth>
                <ShellFor>
                  <React.Suspense fallback={<RouteFallback />}>
                    <AppRoutes />
                  </React.Suspense>
                </ShellFor>
                </RequireAuth>
              }
            />
          </Routes>
          </RouteErrorBoundary>
          </DialogProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
