// @vitest-environment jsdom
/** Calculations: the gate table in Summary's words, Inspect → into the gate dialog, the long metrics, and the links. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [] } }),
  useLatestGates: () => ({
    isLoading: false, isError: false,
    data: {
      loopId: 'L1', windowKind: '12h', windowEnd: '2026-11-05T10:15:00Z', diagnosis: 'NONE', confidence: null,
      observabilityFlags: [], familyDisqualifiers: [],
      gates: [
        { key: 'G0', name: 'Data sufficiency', status: 'PASS' },
        { key: 'G3', name: 'Base performance', status: 'WARN' },
        { key: 'G7', name: 'Stiction shape', status: 'WARN' },
      ],
      metrics: { acf_period_s: 42.5, freeze_fraction: 0.25 },
    },
  }),
}));
vi.mock('./summary/SummaryGateDetail', () => ({
  default: (p: { loop: CpmLoop; gate: string; windowKind: string; onClose: () => void }) =>
    <div role="dialog">{`${p.loop.loopId} ${p.gate} ${p.windowKind}`}<button type="button" onClick={p.onClose}>Close</button></div>,
}));

import { CalculationsTab } from './CalculationsTab';

afterEach(() => { cleanup(); nav.mockReset(); });

const LOOP = { loopId: 'L1', tags: {}, links: [] } as unknown as CpmLoop;
const tab = (kind = '12h') => render(<MemoryRouter><CalculationsTab loop={LOOP} pageWindowKind={kind} /></MemoryRouter>);

describe('CalculationsTab', () => {
  it('uses the gate words of the Summary tiles, never the status code', () => {
    tab();
    const g7 = screen.getByRole('row', { name: /G7/ });
    // a seen symptom is "Symptom seen", never "Warning" or the raw code
    expect(g7.textContent).toMatch(/Symptom seen/);
    expect(g7.textContent).not.toMatch(/Warning|SEEN/);
    expect(screen.getByRole('row', { name: /G0/ }).textContent).toMatch(/Pass/);
    expect(screen.getAllByRole('button', { name: 'Inspect →' })).toHaveLength(3);
  });

  it('opens a gate from Inspect → in the gate dialog, keeping the loop and the window', async () => {
    tab('24h');
    fireEvent.click(within(screen.getByRole('row', { name: /G3/ })).getByRole('button', { name: 'Inspect →' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('L1 G3 24h');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('carries the long metrics from Summary, with the missing ones as a dash', () => {
    tab();
    expect(screen.getByText('ACF period (s)')).toBeTruthy();
    expect(screen.getByText('42.5')).toBeTruthy();
    expect(screen.getByText('25.0%')).toBeTruthy();
    expect(screen.getByText('Triangularity')).toBeTruthy();
  });

  it('links to Short windows and the Full catalogue, and has no short-window select', () => {
    tab();
    fireEvent.click(screen.getByRole('button', { name: 'Short windows ↗' }));
    expect(String(nav.mock.calls[0][0])).toContain('/cpm/windows');
    fireEvent.click(screen.getByRole('button', { name: 'Full catalogue →' }));
    expect(String(nav.mock.calls[1][0])).toContain('/cpm/calculations');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('drops the headings that repeated the tab, and says the window once', () => {
    tab();
    for (const gone of ['Latest fused window', 'Gate outcomes', 'Short features (G0–G4)']) expect(screen.queryByText(gone)).toBeNull();
    expect(screen.getAllByText(/5 Nov/)).toHaveLength(1);
  });
});
