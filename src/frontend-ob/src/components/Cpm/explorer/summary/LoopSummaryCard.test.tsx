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
vi.mock('@oicl/openbridge-webcomponents-react/components/accordion-item/accordion-item', () => ({
  // the real item is a button with aria-expanded; the mock keeps that contract
  ObcAccordionItem: (p: { title: string; open?: boolean; children?: React.ReactNode; onAccordionItemToggle?: (e: { detail: { open: boolean } }) => void }) =>
    React.createElement('div', null,
      React.createElement('button', { 'aria-expanded': !!p.open, onClick: () => p.onAccordionItemToggle?.({ detail: { open: !p.open } }) }, p.title),
      p.children),
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

  it('keeps the basis, data and limitations behind one closed disclosure with a one-line summary', () => {
    renderCard(<div data-testid="readiness">readiness</div>, '1 plant fact(s)');
    const toggle = screen.getByRole('button', { name: 'Basis and limitations' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Basis')).toBeNull();
    expect(screen.queryByText('Data')).toBeNull();
    expect(screen.queryByTestId('readiness')).toBeNull();
    expect(screen.getByText(/8,640 samples · 1 plant fact\(s\)/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Basis and limitations' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Basis')).toBeTruthy();
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Limitations')).toBeTruthy();
    expect(screen.getByTestId('readiness')).toBeTruthy();
  });

  it('sends the why and the action to the Investigation, the proof to the Workbench', () => {
    renderCard();
    fireEvent.click(screen.getByText('Why and what to do › Investigation'));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/investigation?loop=FIC10405&profile=12h');
    cleanup();
    renderCard();
    fireEvent.click(screen.getByText('Calculation proof › Workbench'));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/evidence\?loop=FIC10405/);
  });
});
