// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

// vite.config.ts injects this constant at build time; the test runner does not.
vi.stubGlobal('__APP_VERSION__', 'test');

afterEach(cleanup);

const open = () => render(<MemoryRouter><Login /></MemoryRouter>);

describe('Login wording (CD20)', () => {
  it('makes no compliance claim', () => {
    open();
    expect(document.body.textContent).not.toMatch(/IEC 62443|in compliance with|monitored/i);
  });

  it('keeps the authorized-use notice', () => {
    open();
    expect(screen.getByText(/Access is restricted to authorized operators\./)).toBeTruthy();
    expect(screen.getByText(/Authorized use only\./)).toBeTruthy();
  });

  it('labels the action "Sign in", not "Secure sign in"', () => {
    open();
    expect(document.body.textContent).toMatch(/Sign in/);
    expect(document.body.textContent).not.toMatch(/Secure sign in/);
  });
});
