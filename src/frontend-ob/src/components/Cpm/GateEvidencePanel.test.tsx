// @vitest-environment jsdom
// CHG-191 (owner review item 3): the gate dialog's shared evidence parts. One heading per part and no caps label; the ways on
// are links (they end in ↗) for the dialog's foot; a definition still loading says so instead of "unavailable".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidenceAbout, EvidenceLinks, EvidenceState, type GateEvidence } from './GateEvidencePanel';
import { ApiError } from '../../api/apiFetch';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled, variant, className }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; className?: string }) =>
    <button type="button" onClick={onClick} disabled={disabled} data-variant={variant} className={className}>{children}</button>,
}));
afterEach(cleanup);

const MATRIX = { windowStart: '2026-11-14T07:00:00Z', windowEnd: '2026-11-14T19:00:00Z', sampleCount: 8641, observabilityFlags: ['INSTRUMENT_HEALTH_NOT_CONFIGURED'], gates: [{ key: 'G8', status: 'PASS', methodRunId: 'run-8' }] };
const ev = (over: Partial<GateEvidence> = {}): GateEvidence => ({
  gates: { isLoading: false, isError: false, error: null, data: MATRIX },
  matrix: MATRIX,
  inputs: undefined,
  cell: MATRIX.gates[0],
  def: { key: 'G8', name: 'Horch oddness', tier: 'long', question: 'Does the cross-correlation show the odd symmetry of stiction?', observedInResults: true },
  defLoading: false,
  role: 'SUPPORTING',
  noWindowYet: false,
  fetchFailed: false,
  ...over,
} as unknown as GateEvidence);

describe('EvidenceAbout', () => {
  it('has one normal heading per part and no caps label', () => {
    const { container } = render(<EvidenceAbout ev={ev()} gateKey="G8" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual(['What this gate asks', 'Effect on the verdict', 'Flags on this window']);
    expect(container.querySelector('.cpm-eyebrow')).toBeNull();
    for (const gone of [/^Purpose$/i, /^Fusion behaviour$/i, /^Observability$/i, /^Gate role$/]) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.getByText('Contributes supporting evidence to family qualification.')).toBeTruthy();
  });

  it('puts a definition under the question, under the same heading', () => {
    render(<EvidenceAbout ev={ev()} gateKey="G8" definition="Cross-correlation non-reciprocity." />);
    const part = screen.getByRole('heading', { name: 'What this gate asks' }).parentElement!;
    expect(part.textContent).toContain('Does the cross-correlation show the odd symmetry of stiction?');
    expect(part.textContent).toContain('Cross-correlation non-reciprocity.');
  });

  it('says Loading… while the definitions load, and "Definition unavailable." only once they have', () => {
    render(<EvidenceAbout ev={ev({ def: undefined, defLoading: true })} gateKey="G8" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText('Definition unavailable.')).toBeNull();
    cleanup();
    render(<EvidenceAbout ev={ev({ def: undefined, defLoading: false })} gateKey="G8" />);
    expect(screen.getByText('Definition unavailable.')).toBeTruthy();
  });

  it('leaves out the flags part when the window has none', () => {
    render(<EvidenceAbout ev={ev({ matrix: { ...MATRIX, observabilityFlags: [] } as unknown as GateEvidence['matrix'] })} gateKey="G8" />);
    expect(screen.queryByRole('heading', { name: 'Flags on this window' })).toBeNull();
  });
});

describe('EvidenceLinks', () => {
  const links = (props: Partial<React.ComponentProps<typeof EvidenceLinks>> = {}) => render(
    <MemoryRouter><EvidenceLinks ev={ev()} loopId="FIC10401" gateKey="G8" windowKind="12h" {...props} /></MemoryRouter>);

  it('offers Workbench, Replay and Loop as links that open another page', () => {
    links();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Workbench ↗', 'Replay ↗', 'Loop ↗']);
    for (const b of buttons) expect(b.className).toContain('ui-link');
  });

  it('leaves the Workbench out where the dialog\'s primary opens it', () => {
    links({ withWorkbench: false });
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Replay ↗', 'Loop ↗']);
  });
});

describe('EvidenceState', () => {
  it('says when the loop has no window of that kind yet', () => {
    const notFound = new ApiError(404, 'Not found');
    render(<EvidenceState ev={ev({ noWindowYet: true, gates: { isError: true, error: notFound } as unknown as GateEvidence['gates'] })} windowKind="12h" />);
    expect(screen.getByRole('status').textContent).toBe('This loop has not completed a 12h evaluation window.');
  });
});
