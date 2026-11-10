// CHG-098 (SME review 2 #20/#21): the loop summary is compact — diagnosis once, severity, the main reason on one
// line and the next check on top; basis, not checked, data and limitations behind ONE closed "Basis and
// limitations" disclosure; the why and the action are the Investigation's, the calculation proof the Workbench's.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LoopSummaryCard } from './LoopSummaryCard';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; title?: string }) =>
    React.createElement('button', { onClick: p.onClick, title: p.title }, p.children),
}));
afterEach(cleanup);

const loop = { loopId: 'FIC10405', displayName: 'Hexane feed', site: 'hdpe', area: 'a', unit: 'u', criticality: 'high', tags: { PV: 'x', OP: 'y' }, links: [] } as unknown as CpmLoop;

const matrix = {
  loopId: 'FIC10405', windowKind: '12h', windowStart: new Date(Date.now() - 12 * 3600_000).toISOString(), windowEnd: new Date().toISOString(),
  sampleCount: 8640, diagnosis: 'CONFIRMED_OSCILLATION', severity: 'HIGH', confidence: 0.89, gates: [],
  observabilityFlags: ['NO_STEP_TEST', 'QUALITY_UNKNOWN'], familyDisqualifiers: [], hasPeerLinks: false, insufficientEvidenceReason: null, metrics: {},
  narrative: { selectedFamily: 'stiction', statusReason: 'selected_family=stiction G14_cap=0.89', recommendation: 'Run a valve travel test on FV10405.' },
  verdictV2: { legacy: false, observations: {}, hypotheses: {}, leadingHypothesis: 'STICTION', confirmation: { state: 'NOT_ASSESSED', reason: null }, scoreSemantics: '', resultRevision: 1 },
} as unknown as CpmGateMatrix;

const Where: React.FC = () => { const l = useLocation(); return <span data-testid="where">{l.pathname}{l.search}</span>; };

const renderCard = (more?: React.ReactNode, moreLine?: string) => render(
  <MemoryRouter initialEntries={['/cpm/explorer?loop=FIC10405']}>
    <Routes><Route path="*" element={<><LoopSummaryCard loop={loop} matrix={matrix} windowKind="12h" more={more} moreLine={moreLine} /><Where /></>} /></Routes>
  </MemoryRouter>,
);

describe('LoopSummaryCard', () => {
  it('shows the condition, severity, main reason and next check on top', () => {
    renderCard();
    expect(screen.getAllByText('Oscillation confirmed')).toHaveLength(1);
    expect(screen.getByText('Severity high')).toBeTruthy();
    expect(screen.getByText('Main reason')).toBeTruthy();
    expect(screen.getByText(/Valve stiction/)).toBeTruthy();
    // the short form of the evidence score; the cap explanation is the Investigation's note
    expect(screen.getByText(/evidence score 89/)).toBeTruthy();
    expect(screen.queryByText(/capped at/)).toBeNull();
    expect(screen.getByText('Run a valve travel test on FV10405.')).toBeTruthy();
  });

  // CHG-158 (owner review): the dialog title names the summary; criticality is on Loop model & setup
  it('repeats neither the dialog title nor the loop criticality', () => {
    renderCard();
    expect(screen.queryByText(/Loop summary/)).toBeNull();
    expect(screen.queryByText(/criticality/i)).toBeNull();
  });

  it('gives the last verdict and its window once, without the age again', () => {
    const none = { ...matrix, diagnosis: 'INSUFFICIENT_DATA', severity: null, confidence: null,
      lastVerdict: { diagnosis: 'CONFIRMED_OSCILLATION', windowEnd: '2026-11-06T22:45:00Z', confidence: 1, ageMs: 3 * 86_400_000 } } as unknown as CpmGateMatrix;
    render(<MemoryRouter><LoopSummaryCard loop={loop} matrix={none} windowKind="12h" /></MemoryRouter>);
    const line = screen.getByText(/^Last verdict:/).closest('p')!;
    expect(line.textContent).toMatch(/^Last verdict: Oscillation confirmed · window ending [0-9]{1,2} [A-Z][a-z]{2} [0-9]{2}:[0-9]{2}/);
    expect(line.textContent).not.toMatch(/ago|newest window/);
  });

  it('puts the age of an old window beside the condition', () => {
    const old = { ...matrix, windowEnd: new Date(Date.now() - 3 * 86_400_000).toISOString() } as unknown as CpmGateMatrix;
    render(<MemoryRouter><LoopSummaryCard loop={loop} matrix={old} windowKind="12h" /></MemoryRouter>);
    const head = screen.getByRole('heading', { name: 'Oscillation confirmed' }).parentElement!;
    expect(head.querySelector('.cpm-band__tag')?.textContent).toBe('window ended 3 days ago');
  });

  it('keeps the basis, data and limitations behind one closed disclosure with a one-line summary', () => {
    renderCard(<div data-testid="readiness">readiness</div>, '1 plant fact(s)');
    const toggle = screen.getByText('Basis and limitations').closest('summary')!;
    expect(toggle.closest('details')!.open).toBe(false);
    expect(screen.queryByText('Basis')).toBeNull();
    expect(screen.queryByText('Data')).toBeNull();
    expect(screen.queryByTestId('readiness')).toBeNull();
    expect(toggle.textContent).toMatch(/8,640 samples · 1 plant fact\(s\)/);
    fireEvent.click(toggle);
    expect(toggle.closest('details')!.open).toBe(true);
    expect(screen.getByText('Basis')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Limitations')).toBeTruthy();
    expect(screen.getByTestId('readiness')).toBeTruthy();
  });

  it('sends the why and the action to the Investigation, the proof to the Workbench', () => {
    renderCard();
    fireEvent.click(screen.getByText('Why and what to do → Investigation'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=FIC10405&profile=12h');
    cleanup();
    renderCard();
    fireEvent.click(screen.getByText('Calculation proof → Workbench'));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/evidence\?loop=FIC10405/);
  });
});
