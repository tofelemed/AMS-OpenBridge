/** Route guards and route-level fallbacks, moved out of App.tsx. */
import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { HOME_PATH } from '../productSlice';
import { useAuthStore } from '../store/authStore';
import { DataState } from '../ui/DataState';

/** RD13, G06: what a refused route shows. The way out appears only if the role can use it. */
export const RestrictedRoute: React.FC = () => {
  const canGoHome = useAuthStore(s => s.hasPermission('analytics.view'));
  return (
    <DataState
      kind="restricted"
      reason="Your role does not include this page. An administrator can change your role."
      action={canGoHome ? <Link className="ui-link" to={HOME_PATH}>Go to Overview</Link> : undefined}
    />
  );
};

// Redirects to /login unless a session is active. Assumes bootstrap() has run
// (App gates render on `ready`), so status is 'authenticated' or 'unauthenticated'.
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

// Phase K: route-level authorization. Authentication alone is not enough.
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
  const allowed = anyOf ? anyOf.some(p => hasPermission(p)) : hasPermission(permission);
  // RD13: the check is unchanged. A refused route now says so instead of redirecting silently.
  if (!allowed) return <RestrictedRoute />;
  return <>{children}</>;
};

// Shown ONLY while the session bootstrap / auth handshake is genuinely in flight.
export const LoadingScreen: React.FC = () => (
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
export const RouteFallback: React.FC = () => (
  <div className="loading-screen" style={{ minHeight: '200px' }}>
    <div className="spinner" />
    <p style={{ color: 'var(--on-container-neutral-color)', fontSize: '13px' }}>
      Loading…
    </p>
  </div>
);
