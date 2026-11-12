// Owner, 12 Nov 2026: the session-ended dialog is the Traverse dialog (no warning modal), short words, "Sign in".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAuthStore } from '../../store/authStore';
import { SessionTimeoutDialog } from './SessionTimeoutDialog';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(() => { cleanup(); useAuthStore.setState({ sessionEndReason: null } as never); });

describe('SessionTimeoutDialog', () => {
  it('shows nothing without a reason', () => {
    useAuthStore.setState({ sessionEndReason: null } as never);
    const { container } = render(<SessionTimeoutDialog />);
    expect(container.textContent).toBe('');
  });

  it('says the session ended in the Traverse dialog and Sign in dismisses it', () => {
    useAuthStore.setState({ sessionEndReason: 'expired' } as never);
    render(<SessionTimeoutDialog />);
    expect(screen.getByRole('dialog', { name: 'Session ended' })).toBeTruthy();
    expect(document.querySelector('.ui-dialog')).toBeTruthy();
    expect(screen.getByText('The session reached its time limit. Sign in to continue.')).toBeTruthy();
    fireEvent.click(screen.getByText('Sign in'));
    expect(useAuthStore.getState().sessionEndReason).toBeFalsy();
  });

  it('names an idle sign-out plainly', () => {
    useAuthStore.setState({ sessionEndReason: 'inactivity' } as never);
    render(<SessionTimeoutDialog />);
    expect(screen.getByRole('dialog', { name: 'Signed out' })).toBeTruthy();
  });
});
