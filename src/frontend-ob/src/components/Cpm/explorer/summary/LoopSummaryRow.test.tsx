// @vitest-environment jsdom
/**
 * The assessment in the band, on Summary only: the result and its age, one fact line, Review evidence → and Open details.
 * A stale or blocked loop cannot look fine without a click (CHG-129); the window end is said once (CHG-158).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';

const hooks = vi.hoisted(() => ({ gates: vi.fn(), readiness: vi.fn(), events: vi.fn(), kpis: vi.fn() }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; variant?: string }) =>
    React.createElement('button', { type: 'button', onClick: p.onClick, 'data-variant': p.variant }, p.children),
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
  const headline = (c: HTMLElement) => c.querySelector('.cpm-band__headline')?.textContent ?? '';
  const facts = (c: HTMLElement) => c.querySelector('.cpm-band__facts')?.textContent ?? '';

  // CHG-158 (owner review): the result and its age on one line, the facts under it, two outlined buttons at the end
  it('shows the result on one line and the facts under it, then Review evidence → and Open details', () => {
    const { container } = row();
    expect(headline(container)).toMatch(/Oscillation/i);
    expect(facts(container)).toContain('13 % in band · persisting 11 h · evidence score 100');
    expect(band(container)).not.toMatch(/Loop summary|Latest/);
    for (const name of ['Review evidence →', 'Open details'])
      expect(screen.getByRole('button', { name }).getAttribute('data-variant')).toBe('normal');
  });

  it('says when a recent window ended once, without the window kind the page switch already shows', () => {
    const { container } = row();
    expect(facts(container)).toMatch(/^window ended [0-9]{1,2} [A-Z][a-z]{2} · [0-9]{2}:[0-9]{2} · 13 % in band/);
    expect(band(container).match(/window ended/g)).toHaveLength(1);
    expect(band(container)).not.toMatch(/12h|UTC/);
    expect(container.querySelector('.cpm-band__tag')).toBeNull();
  });

  it('flags an old window by its age only, with the time on hover', () => {
    hooks.gates.mockReturnValue({ data: { diagnosis: 'INSUFFICIENT_DATA', windowEnd: new Date(Date.now() - 26 * 86_400_000).toISOString(), gates: [] }, isLoading: false, isError: false });
    const { container } = row();
    const tag = container.querySelector('.cpm-band__headline .cpm-band__tag')!;
    expect(tag.textContent).toBe('window ended 26 days ago');
    expect(tag.getAttribute('title')).toMatch(/^The latest 12h window ended [0-9]{1,2} [A-Z][a-z]{2} · [0-9]{2}:[0-9]{2}$/);
    expect(band(container).match(/window ended/g)).toHaveLength(1);
  });

  it('opens the Workbench from Review evidence →', () => {
    row();
    fireEvent.click(screen.getByRole('button', { name: 'Review evidence →' }));
    expect(screen.getByTestId('location').textContent).toBe('/cpm/evidence?loop=FIC00701&methodRun=r1&gate=G15&mode=FIXED');
  });

  it('leaves persistence out, never as 0, when no episode of this window kind is open', () => {
    hooks.events.mockReturnValue({ data: { events: [{ window_kind: '24h', closed_at: null, opened_at: new Date().toISOString() }] } });
    const { container } = row();
    expect(facts(container)).toContain('13 % in band · evidence score 100');
    expect(band(container)).not.toMatch(/persisting/);
  });

  it('keeps the age and the blocking count on the result line', () => {
    hooks.gates.mockReturnValue({ data: { diagnosis: 'INSUFFICIENT_DATA', windowEnd: new Date(Date.now() - 26 * 86_400_000).toISOString(), gates: [] }, isLoading: false, isError: false });
    hooks.readiness.mockReturnValue({ data: { blocking: 1, causes: [], notes: [] } });
    const { container } = row();
    expect(headline(container)).toMatch(/not enough data/i);
    expect(headline(container)).toMatch(/window ended 26 days ago/);
    expect(headline(container)).toMatch(/1 blocking/);
  });

  it('says so when the verdict could not be read', () => {
    hooks.gates.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('boom') });
    const { container } = row();
    expect(headline(container)).toMatch(/Verdict unavailable/);
  });

  // CHG-158: the name, location, type, criticality and instrument health are not repeated in the dialog
  it('holds the card and the readiness behind Open details, without repeating who the loop is', () => {
    row();
    expect(screen.queryByTestId('summary-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    const d = screen.getByRole('dialog', { name: 'Loop summary' });
    expect(screen.getByTestId('summary-card')).toBeTruthy();
    for (const gone of [/Flow controller/, /criticality/i, /hdpe|s200/, /Instrument health/i, /FIC00701/])
      expect(d.textContent).not.toMatch(gone);
    expect(screen.queryByRole('button', { name: /Instrument health/i })).toBeNull();
  });
});
