'use client';

import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { FormField } from '../shared/Modal';
import { useAuthStore } from '../../store/authStore';

/**
 * Standalone login page (rendered outside the AppShell — no nav chrome).
 * Authenticates against the auth service; the access token lands in the auth
 * store and the refresh token in an httpOnly cookie.
 */
export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submitting = status === 'authenticating';
  const redirectTo = location.state?.from ?? '/dashboard';

  // Already signed in → bounce to the intended destination.
  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  const doLogin = async () => {
    if (!username.trim() || !password || submitting) return;
    try {
      await login(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch {
      // Error message is surfaced from the store.
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin();
  };

  return (
    <div style={page}>
      <form onSubmit={handleSubmit} className="ob-card" style={card}>
        <div style={brand}>
          <div style={brandTitle}>Traverse AMS</div>
          <div style={brandTagline}>Consolidated Alarm Management</div>
        </div>

        <FormField label="Username" required>
          <input
            className="ob-input"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
          />
        </FormField>

        <FormField label="Password" required>
          <input
            className="ob-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </FormField>

        {error && (
          <div role="alert" style={errorBox}>
            {error}
          </div>
        )}

        <ObcButton
          variant="raised"
          onClick={() => void doLogin()}
          disabled={submitting || !username.trim() || !password}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </ObcButton>
      </form>
    </div>
  );
};

const page: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  background: 'var(--surface-background-color)',
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: '360px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  padding: '32px',
};

const brand: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '8px',
};

const brandTitle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: 'var(--on-container-active-color)',
};

const brandTagline: React.CSSProperties = {
  fontSize: '13px',
  marginTop: '4px',
  color: 'var(--on-container-neutral-color)',
};

const errorBox: React.CSSProperties = {
  fontSize: '13px',
  padding: '8px 12px',
  borderRadius: 'var(--corner-radius, 4px)',
  color: 'var(--on-alert-alarm-color, var(--alert-alarm-border-color))',
  background: 'var(--alert-alarm-background-color, transparent)',
  border: '1px solid var(--alert-alarm-border-color)',
};

export default Login;
