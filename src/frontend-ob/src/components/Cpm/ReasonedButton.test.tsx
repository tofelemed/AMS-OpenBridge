// SME review #21 (CHG-057): an unavailable action says why on screen; empty states give a way forward.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReasonedButton } from './ReasonedButton';
import { EmptyState } from './shared';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; disabled?: boolean; 'aria-describedby'?: string; onClick?: () => void }) =>
    React.createElement('button', { disabled: p.disabled, 'aria-describedby': p['aria-describedby'], onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

describe('ReasonedButton', () => {
  it('shows the reason under a disabled action and ties it to the button', () => {
    render(<ReasonedButton disabled reason="Needs the cpm.manage permission">Acknowledge</ReasonedButton>);
    const why = screen.getByText('Needs the cpm.manage permission');
    expect(screen.getByRole('button', { name: 'Acknowledge' }).getAttribute('aria-describedby')).toBe(why.id);
  });
  it('says nothing while the action is available', () => {
    render(<ReasonedButton reason="Needs the cpm.manage permission">Acknowledge</ReasonedButton>);
    expect(screen.queryByText('Needs the cpm.manage permission')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('states what, why and where next', () => {
    render(<MemoryRouter><EmptyState title="No response events for this loop" copy="None qualified in the retained period."
      next={[{ label: 'Setpoint changes in Historical', to: '/cpm/historical?loop=FIC10401' }]} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'No response events for this loop' })).toBeTruthy();
    expect(screen.getByText('None qualified in the retained period.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Setpoint changes in Historical/ }).getAttribute('href')).toBe('/cpm/historical?loop=FIC10401');
  });
});
