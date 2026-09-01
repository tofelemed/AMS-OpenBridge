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
import plantCoverWebp from '../../assets/plant-cover.webp';
import plantCoverJpg from '../../assets/plant-cover.jpg';
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
  const [capsLock, setCapsLock] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

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

  // A rejected sign-in rendered its message at the bottom of the form with focus
  // still in the password field — announced by role="alert", but a keyboard or
  // screen-magnifier user had no idea where it went. Move to it once, on arrival.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

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
        {/* WebP first: the source render is a 2 MB PNG, which is the wrong
            container for a photographic image and a real cost on a plant
            network. 128 KB WebP / 203 KB JPEG fallback, same pixels. */}
        <picture>
          <source srcSet={plantCoverWebp} type="image/webp" />
          <img className="login__visual-img" src={plantCoverJpg} alt="" aria-hidden="true" />
        </picture>
        {/*
          The visual was pure wallpaper. It now carries the DEPLOYMENT identity —
          which console this is — while the panel opposite carries the PRODUCT
          identity. That removes the duplicated site chip from the form column and
          gives a wall-mounted or projected login something readable across a
          control room. aria-hidden: the same words are in the form's heading
          block, so a screen reader should not hear them twice.
        */}
        <div className="login__visual-caption" aria-hidden="true">
          <span className="login__visual-site">{SITE_LABEL}</span>
          <span className="login__visual-system">
            Traverse control-loop performance
          </span>
        </div>
      </aside>

      <main className="login__panel">
        <form className="login__form" onSubmit={handleSubmit}>
          <h1 className="login__title">Traverse Edge</h1>
          <p className="login__subtitle"> Control Loop Performance Management</p>

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
                aria-describedby={capsLock ? 'login-capslock' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                // Caps Lock is the commonest cause of a "wrong password" that is
                // not one, and a masked field gives no clue. Read the modifier
                // from the event rather than tracking keydown/keyup state.
                onKeyDown={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                onBlur={() => setCapsLock(false)}
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
            {capsLock && (
              <p className="login__hint" id="login-capslock" role="status">
                Caps Lock is on.
              </p>
            )}
          </div>

          {/*
            Enter did not submit this form. HTML blocks implicit submission when a
            form has two or more fields that block it and NO submit button — and
            obc-button renders its <button> inside a shadow root, so the form has
            none in its own tree. An operator typing their password and pressing
            Enter got nothing. This hidden native submit restores it; the visible
            OpenBridge button stays the affordance.
          */}
          <button type="submit" className="login__submit-fallback" tabIndex={-1} aria-hidden="true">
            Sign in
          </button>

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
            <div className="login__error" role="alert" ref={errorRef} tabIndex={-1}>
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
