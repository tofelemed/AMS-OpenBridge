// @vitest-environment jsdom
/**
 * The assessment in the band, on Summary only: the result, one fact line, Review evidence →, and a quiet Open details.
 * A stale or blocked loop cannot look fine without a click (CHG-129).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';

const hooks = vi.hoisted(() => ({ gates: vi.fn(), readiness: vi.fn(), events: vi.fn(), kpis: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../../../hooks/useCpm', () => ({
  useLatestGates: hooks.gates, useCpmReadiness: hooks.readiness, useCpmEvents: hooks.events,
}));
vi.mock('./useLoopKpis', () => ({ useLoopKpis: hooks.kpis }));
vi.mock('../../health/useInstrumentHealth', () => ({ useInstrumentHealth: () => ({ data: undefined, isLoading: false, error: null }) }));
vi.mock('../../health/TransmitterHealthPanel', () => ({
  TransmitterHealthPanel: () => null,
  loopHealthSummary: () => ({ tone: 'muted', label: 'HEALTH NOT CONFIGURED' }),
}));
vi.mock('./LoopSummaryCard', () => ({
  default: () => React.createElement('section', { 'data-testid': 'summary-card' }),
  workbenchExit: (loopId: string) => ({ href: `/cpm/evidence?loop=${loopId}&methodRun=r1&gate=G15&mode=FIXED`, title: '' }),
}));
vi.mock('../ReadinessBar', () => ({ default: () => React.createElement('div', { 'data-testid': 'readiness' }), readinessLine: () => '' }));
vi.mock('../LoopWorkspace', () => ({ isNoVerdictYet: () => false }));
vi.mock('../readinessCauses', () => ({ readinessCauses: (d: unknown) => d ?? null }));

import { LoopSummaryRow } from './LoopSummaryRow';

const LOOP = { loopId: 'FIC00701', displayName: 'Flow controller FIC00701 (FCS0102)', loopType: 'FIC', criticality: 'medium', site: 'hdpe', area: 's200', unit: 'u2' } as CpmLoop;
const Probe: React.FC = () => { const l = useLocation(); return <div data-testid="location">{l.pathname}{l.search}</div>; };
const row = () => render(
  <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC00701']}>
    <Routes><Route path="*" element={<><div className="band"><LoopSummaryRow loop={LOOP} windowKind="12h" onTab={() => {}} /></div><Probe /></>} /></Routes>
  </MemoryRouter>);
const band = (c: HTMLElement) => c.querySelector('.cpm-band__result')?.textContent ?? '';

beforeEach(() => {
  hooks.gates.mockReturnValue({
    data: { diagnosis: 'SUSPECTED_OSCILLATION', confidence: 1, windowEnd: new Date(Date.now() - 30 * 60_000).toISOString(), gates: [] },
    isLoading: false, isError: false,
  });
  hooks.readiness.mockReturnValue({ data: { blocking: 0, causes: [], notes: [] } });
  hooks.events.mockReturnValue({ data: { events: [{ window_kind: '12h', closed_at: null, opened_at: new Date(Date.now() - 11 * 3_600_000).toISOString() }] } });
  hooks.kpis.mockReturnValue({ data: { current: { values: { good_error_pct: 0.13 } } } });
});
afterEach(cleanup);

describe('LoopSummaryRow', () => {
  it('shows the assessment in the band: result, one fact line, Review evidence →, Open details', () => {
    const { container } = row();
    const text = band(container);
    expect(text).toMatch(/Latest 12h · /);
    expect(text).toMatch(/Oscillation/i);
    expect(text).toContain('13 % in band · persisting 11 h · evidence score 100');
    expect(text).not.toMatch(/Loop summary/);
    expect(screen.getByRole('button', { name: 'Review evidence →' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open details' })).toBeTruthy();
  });

  it('opens the Workbench from Review evidence →', () => {
    row();
    fireEvent.click(screen.getByRole('button', { name: 'Review evidence →' }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/evidence?loop=FIC00701&methodRun=r1&gate=G15&mode=FIXED');
  });

  it('leaves persistence out, never as 0, when no episode of this window kind is open', () => {
    hooks.events.mockReturnValue({ data: { events: [{ window_kind: '24h', closed_at: null, opened_at: new Date().toISOString() }] } });
    const { container } = row();
    expect(band(container)).toContain('13 % in band · evidence score 100');
    expect(band(container)).not.toMatch(/persisting/);
  });

  it('keeps the age and the blocking count in the band', () => {
    hooks.gates.mockReturnValue({ data: { diagnosis: 'INSUFFICIENT_DATA', windowEnd: new Date(Date.now() - 26 * 86_400_000).toISOString(), gates: [] }, isLoading: false, isError: false });
    hooks.readiness.mockReturnValue({ data: { blocking: 1, causes: [], notes: [] } });
    const { container } = row();
    expect(band(container)).toMatch(/not enough data/i);
    expect(band(container)).toMatch(/window ended 26 days ago/);
    expect(band(container)).toMatch(/1 blocking/);
  });

  it('says so when the verdict could not be read', () => {
    hooks.gates.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('boom') });
    const { container } = row();
    expect(band(container)).toMatch(/Verdict unavailable/);
  });

  it('holds the card, the readiness and the location behind Open details', () => {
    row();
    expect(screen.queryByTestId('summary-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    expect(screen.getByRole('dialog', { name: /Loop summary · FIC00701/ })).toBeTruthy();
    expect(screen.getByTestId('summary-card')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('Flow controller (FCS0102)');
  });
});
