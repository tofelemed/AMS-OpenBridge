'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcStatusIndicator } from '@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator';
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ObiCommandLocked } from '@oicl/openbridge-webcomponents-react/icons/icon-command-locked';
import { ObiError } from '@oicl/openbridge-webcomponents-react/icons/icon-error';
import { ObiVisibilityOnGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-visibility-on-google';
import { ObiVisibilityOffGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-visibility-off-google';
import { useAuthStore } from '../../store/authStore';
import { postLoginPath } from '../../productSlice';
import plantCover from '../../assets/plant-cover.jpg';
import './Login.css';

/**
 * Standalone login page (rendered outside the AppShell — no nav chrome).
 *
 * Split layout: the plant visual carries the left column, the credential column
 * on the right holds identity, the authorized-use notice, the two fields, and a
 * live status strip. Everything themes off `data-obc-theme` — see Login.css.
 *
 * Authenticates against the auth service; the access token lands in the auth
 * store and the refresh token in an httpOnly cookie.
 */

/** Site/console identity shown above the product name. Set per deployment. */
const SITE_LABEL = (import.meta.env.VITE_SITE_LABEL as string | undefined) || 'Plant Operations';

/** UTC stamp for the status strip: `2026-08-28 | 10:32:43 UTC`. */
const utcStamp = (): string => {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10)} | ${iso.slice(11, 19)} UTC`;
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [revealPassword, setRevealPassword] = useState(false);
  const [clock, setClock] = useState(utcStamp);
  const [online, setOnline] = useState(() => navigator.onLine);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submitting = status === 'authenticating';
  const redirectTo = postLoginPath(location.state?.from);

  // Browser autofill sets the input VALUE without firing React's onChange, so the
  // controlled state stayed empty and the Sign-in button stayed disabled until the
  // user touched a field. Poll the DOM a few times after mount to sync state from
  // whatever autofill/password-manager put there.
  useEffect(() => {
    const sync = () => {
      const u = usernameRef.current?.value;
      const p = passwordRef.current?.value;
      if (u != null && u !== username) setUsername(u);
      if (p != null && p !== password) setPassword(p);
    };
    const timers = [80, 250, 700].map((ms) => setTimeout(sync, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status strip: a ticking UTC clock and real connectivity, not decoration.
  useEffect(() => {
    const id = setInterval(() => setClock(utcStamp()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const doLogin = useCallback(async () => {
    // Read the LIVE DOM values (refs), not just state — the last-typed keystroke or
    // an autofill that hasn't synced to state yet is still the source of truth.
    const u = (usernameRef.current?.value ?? username).trim();
    const p = passwordRef.current?.value ?? password;
    if (!u || !p || submitting) return;
    try {
      await login(u, p);
      navigate(redirectTo, { replace: true });
    } catch {
      // Error message is surfaced from the store.
    }
  }, [username, password, submitting, login, navigate, redirectTo]);

  // Already signed in → bounce to the intended destination.
  if (status === 'authenticated') {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin();
  };

  return (
    <div className="login">
      <aside className="login__visual">
        <img className="login__visual-img" src={plantCover} alt="" aria-hidden="true" />
      </aside>

      <main className="login__panel">
        <form className="login__form" onSubmit={handleSubmit}>
          <div className="login__chip">{SITE_LABEL}</div>
          <h1 className="login__title">Traverse Edge</h1>
          <p className="login__subtitle">Alarm Management &amp; Operations Display</p>

          <p className="login__notice">
            <strong>Authorized use notice:</strong> Access is restricted to authorized
            operators. All sessions, including failed attempts, are logged and monitored in
            compliance with IEC 62443 security standards.
          </p>

          <div className="login__field">
            <label className="login__label" htmlFor="login-operator-id">
              Operator ID
            </label>
            <div className="login__control">
              <span className="login__control-icon">
                <ObiUser />
              </span>
              <input
                id="login-operator-id"
                ref={usernameRef}
                className="login__input"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="Enter assigned ID"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="login__field">
            <label className="login__label" htmlFor="login-password">
              Password
            </label>
            <div className="login__control">
              <span className="login__control-icon">
                <ObiCommandLocked />
              </span>
              <input
                id="login-password"
                ref={passwordRef}
                className="login__input login__input--revealable"
                type={revealPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
              <button
                type="button"
                className="login__reveal"
                onClick={() => setRevealPassword((v) => !v)}
                disabled={submitting}
                aria-label={revealPassword ? 'Hide password' : 'Show password'}
                aria-pressed={revealPassword}
              >
                {revealPassword ? <ObiVisibilityOffGoogle /> : <ObiVisibilityOnGoogle />}
              </button>
            </div>
          </div>

          <ObcButton
            className="login__submit"
            variant="raised"
            fullWidth
            showLeadingIcon
            onClick={() => void doLogin()}
            disabled={submitting}
          >
            <ObiCommandLocked slot="leading-icon" className="login__submit-icon" />
            {submitting ? 'Signing in…' : 'Secure sign in'}
          </ObcButton>

          {error && (
            <div className="login__error" role="alert">
              <span className="login__error-icon">
                <ObiError />
              </span>
              <span>{error}</span>
            </div>
          )}
        </form>

        <footer className="login__footer">
          <span className="login__meta">Build {__APP_VERSION__}</span>
          <span className="login__meta">
            <ObcStatusIndicator status={online ? 'running' : 'alarm'} />
            Network {online ? 'online' : 'offline'}
          </span>
          <span className="login__meta">{clock}</span>
        </footer>
      </main>
    </div>
  );
};

export default Login;
