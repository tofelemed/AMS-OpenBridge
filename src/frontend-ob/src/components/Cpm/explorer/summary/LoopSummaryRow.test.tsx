// @vitest-environment jsdom
/** CHG-129: a stale or blocked loop cannot look fine without a click, and Open details holds the rest. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';

const hooks = vi.hoisted(() => ({ gates: vi.fn(), readiness: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../../../hooks/useCpm', () => ({ useLatestGates: hooks.gates, useCpmReadiness: hooks.readiness }));
vi.mock('../../health/useInstrumentHealth', () => ({ useInstrumentHealth: () => ({ data: undefined, isLoading: false, error: null }) }));
vi.mock('../../health/TransmitterHealthPanel', () => ({
  TransmitterHealthPanel: () => null,
  loopHealthSummary: () => ({ tone: 'muted', label: 'HEALTH NOT CONFIGURED' }),
}));
vi.mock('./LoopSummaryCard', () => ({ default: () => React.createElement('section', { 'data-testid': 'summary-card' }) }));
vi.mock('../ReadinessBar', () => ({ default: () => React.createElement('div', { 'data-testid': 'readiness' }), readinessLine: () => '' }));
vi.mock('../LoopWorkspace', () => ({ isNoVerdictYet: () => false }));
vi.mock('../readinessCauses', () => ({ readinessCauses: (d: unknown) => d ?? null }));

import { LoopSummaryRow } from './LoopSummaryRow';

const LOOP = { loopId: 'FIC00701', displayName: 'Flow controller FIC00701 (FCS0102)', loopType: 'FIC', criticality: 'medium', site: 'hdpe', area: 's200', unit: 'u2' } as CpmLoop;
const row = () => render(<MemoryRouter><LoopSummaryRow loop={LOOP} windowKind="12h" onTab={() => {}} /></MemoryRouter>);

beforeEach(() => {
  hooks.gates.mockReturnValue({ data: { diagnosis: 'INSUFFICIENT_DATA', windowEnd: new Date(Date.now() - 26 * 86_400_000).toISOString() }, isLoading: false, isError: false });
  hooks.readiness.mockReturnValue({ data: { blocking: 1, causes: [], notes: [] } });
});
afterEach(cleanup);

describe('LoopSummaryRow', () => {
  it('keeps the result, its age and the blocking count on screen', () => {
    const { container } = row();
    const text = container.querySelector('.cpm-band__result')?.textContent ?? '';
    expect(text).toMatch(/Loop summary/);
    expect(text).toMatch(/not enough data/i);
    expect(text).toMatch(/window ended 26 days ago/);
    expect(text).toMatch(/1 blocking/);
  });

  it('says so when the verdict could not be read', () => {
    hooks.gates.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('boom') });
    const { container } = row();
    expect(container.querySelector('.cpm-band__result')?.textContent).toMatch(/Verdict unavailable/);
  });

  it('holds the card, the readiness and the location behind Open details', () => {
    row();
    expect(screen.queryByTestId('summary-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    expect(screen.getByRole('dialog', { name: /Loop summary · FIC00701/ })).toBeTruthy();
    expect(screen.getByTestId('summary-card')).toBeTruthy();
    expect(screen.getByTestId('readiness')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Flow controller (FCS0102)');
  });
});
