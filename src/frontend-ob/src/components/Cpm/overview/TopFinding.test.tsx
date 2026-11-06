// @vitest-environment jsdom
/** Task 6: the top finding is one link to Investigation, in the page's window. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmRankedLoop } from '../../../api/cpmApi';
import { TopFinding } from './TopFinding';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));

afterEach(cleanup);

const finding = {
  rank: 1, loopId: 'LIC10501', displayName: 'Separator level', site: 'hdpe', diagnosis: 'CONFIRMED_OSCILLATION',
  priority: 'HIGH', severity: 'HIGH', criticality: 'medium', confidence: 1, metrics: {},
} as unknown as CpmRankedLoop;

describe('TopFinding', () => {
  it('makes the whole top finding one link to Investigation', () => {
    render(<MemoryRouter><TopFinding finding={finding} windowKind="12h" /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /LIC10501 · Oscillation confirmed/ }).getAttribute('href'))
      .toBe('/cpm/investigation?loop=LIC10501&profile=12h');
  });

  it('says so, with no link, when nothing is evaluated', () => {
    render(<MemoryRouter><TopFinding finding={undefined} windowKind="12h" /></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/No loop has a current finding/)).toBeTruthy();
  });

  it('does not repeat the heading or say the loop heads the queue', () => {
    const { container } = render(<MemoryRouter><TopFinding finding={finding} windowKind="12h" /></MemoryRouter>);
    expect(container.textContent).not.toMatch(/heads the queue/);
    expect(container.textContent).not.toMatch(/Review evidence/);
  });
});
