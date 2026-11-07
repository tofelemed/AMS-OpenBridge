// @vitest-environment jsdom
// CHG-141: links only. A tick box could not be saved, so there is none.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { row } from '../evidence/windowFixtures';
import { NextChecks } from './NextChecksPanel';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const END = '2026-11-05T10:15:00Z';
const Where: React.FC = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}</output>; };
const checks = (diagnosis: string, handlers: Partial<React.ComponentProps<typeof NextChecks>> = {}) => {
  const h = { onSignals: vi.fn(), onGate: vi.fn(), onDialog: vi.fn(), ...handlers };
  render(<MemoryRouter><NextChecks matrix={row(END, { diagnosis })} loopId="FIC10401" windowKind="12h" {...h} /><Where /></MemoryRouter>);
  return h;
};

describe('NextChecks', () => {
  it('shows links and no tick boxes', () => {
    checks('CONFIRMED_OSCILLATION');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/reviewed$/)).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Next checks' })).toBeTruthy();
  });

  it('runs each kind of link', () => {
    const h = checks('CONFIRMED_OSCILLATION');
    fireEvent.click(screen.getByRole('button', { name: 'Signals ↗' }));
    expect(h.onSignals).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'G15 ↗' }));
    expect(h.onGate).toHaveBeenCalledWith('G15');
    fireEvent.click(screen.getByRole('button', { name: 'Hypotheses ↗' }));
    expect(h.onDialog).toHaveBeenCalledWith({ kind: 'hypotheses' });
  });

  it('opens the mode dialog, and goes to another page', () => {
    const h = checks('EXCLUDED_MODE');
    fireEvent.click(screen.getByRole('button', { name: 'Mode context ↗' }));
    expect(h.onDialog).toHaveBeenCalledWith({ kind: 'mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Historical ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/historical');
  });
});
