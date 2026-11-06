/** An address with a row in redirects.ts. It renders its page when no row applies. */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { resolveRedirect } from './redirects';

export const LegacyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname, search } = useLocation();
  const to = resolveRedirect(pathname, search);
  return to ? <Navigate to={to} replace /> : <>{children}</>;
};
