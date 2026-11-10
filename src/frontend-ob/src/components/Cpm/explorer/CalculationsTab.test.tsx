// @vitest-environment jsdom
/** Calculations: one Window dropdown (fused and short) with Full catalogue → beside it, the gate table in Summary's words,
 *  Inspect → into the gate dialog, the long metrics; a short window shows its G0–G4 checks and metrics (CHG-158). */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';

const nav = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async orig => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => nav }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { type: 'button', onClick: p.onClick }, p.children),
}));
vi.mock('../../../hooks/useCpm', () => ({
  useCpmResolutions: () => ({ data: { fusion: { firesOn: ['12h', '24h'] }, windows: [
    { kind: '1m', tier: 'short', assigner: 'tumbling', sizeMs: 60_000, slideMs: null },
    { kind: '5m', tier: 'short', assigner: 'sliding', sizeMs: 300_000, slideMs: 60_000 },
    { kind: '12h', tier: 'long', assigner: 'sliding', sizeMs: 43_200_000, slideMs: 3_600_000 },
  ] } }),
  useCpmKpis: () => ({ isLoading: false, isError: false, data: { samples: [{
    window_start: '2026-11-05T10:10:00Z', window_end: '2026-11-05T10:15:00Z', sufficient_data: true,
    gate0_status: 'PASS', gate1_status: 'PASS', gate2_status: 'PASS', gate2r_status: 'PASS', gate3_status: 'WARN', gate4_status: 'PASS', mae: 1.234,
  }] } }),
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
const Where: React.FC = () => { const l = useLocation(); return <span data-testid="where">{l.search}</span>; };
const tab = (kind = '12h', url = '/cpm/explorer?loop=L1&tab=Calculations') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="*" element={<><CalculationsTab loop={LOOP} pageWindowKind={kind} /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const windowSelect = () => screen.getByRole('combobox', { name: 'Window' }) as HTMLSelectElement;

describe('CalculationsTab', () => {
  it('uses the gate words of the Summary tiles, never the status code', () => {
    tab();
    const g7 = screen.getByRole('row', { name: /G7/ });
    // a seen symptom is "Symptom seen", never "Warning" or the raw code
    expect(g7.textContent).toMatch(/Symptom seen/);
    expect(g7.textContent).not.toMatch(/Warning|SEEN/);
    expect(screen.getByRole('row', { name: /G0/ }).textContent).toMatch(/Pass/);
    // CHG-158 (owner's image): compact rows, the gate's name opens it; no Inspect column
    expect(screen.queryAllByRole('button', { name: 'Inspect →' })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'G7 · Stiction shape' })).toBeTruthy();
  });

  it('opens a gate from its name in the gate dialog, keeping the loop and the window', async () => {
    tab('24h');
    fireEvent.click(screen.getByRole('button', { name: 'G3 · Base performance' }));
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

  it('offers every window in one dropdown: the fused ones, then the short ones', () => {
    tab();
    expect(windowSelect().value).toBe('12h');
    expect([...windowSelect().querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Fused verdict (fires on 12h / 24h)', 'Short features (G0–G4)']);
    const options = [...windowSelect().querySelectorAll('option')].map(o => o.textContent ?? '');
    expect(options.slice(0, 2)).toEqual(['12h — fused G0–G15', '24h — fused G0–G15']);
    expect(options[2]).toMatch(/^1m — .*tumbling$/);
    expect(options[3]).toMatch(/^5m — .* slide$/);
    expect(options).toHaveLength(4);
  });

  it('moves the page window when a fused window is chosen, so the 12h / 24h switch agrees', () => {
    tab('12h', '/cpm/explorer?loop=L1&tab=Calculations&calcWindow=5m');
    fireEvent.change(windowSelect(), { target: { value: '24h' } });
    const q = new URLSearchParams(screen.getByTestId('where').textContent ?? '');
    expect(q.get('window')).toBe('24h');
    expect(q.get('calcWindow')).toBeNull();
  });

  it('shows a short window as its G0–G4 checks in small labels, then its metrics', () => {
    const { container } = tab();
    fireEvent.change(windowSelect(), { target: { value: '5m' } });
    expect(new URLSearchParams(screen.getByTestId('where').textContent ?? '').get('calcWindow')).toBe('5m');
    expect(windowSelect().value).toBe('5m');
    expect(screen.getByText('Latest 5m short window', { exact: false })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Per-window features' })).toBeTruthy();
    const labels = [...container.querySelectorAll('.cpm-short-gates .cpm-short-gate')];
    expect(labels.map(l => l.querySelector('strong')?.textContent)).toEqual(['G0', 'G1', 'G2', 'G2r', 'G3', 'G4']);
    expect(labels[4].textContent).toMatch(/Attention/);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('MAE')).toBeTruthy();
  });

  it('puts Full catalogue → beside the dropdown, on the chosen window', () => {
    const { container } = tab('24h');
    const button = within(container.querySelector('.cpm-panel-head') as HTMLElement).getByRole('button', { name: 'Full catalogue →' });
    fireEvent.click(button);
    expect(String(nav.mock.calls[0][0])).toBe('/cpm/calculations?loop=L1&kind=24h');
    expect(screen.getAllByRole('button', { name: 'Full catalogue →' })).toHaveLength(1);
  });

  it('keeps Short windows ↗ in the foot, on the chosen short window', () => {
    tab('12h', '/cpm/explorer?loop=L1&tab=Calculations&calcWindow=5m');
    fireEvent.click(screen.getByRole('button', { name: 'Short windows ↗' }));
    expect(String(nav.mock.calls[0][0])).toBe('/cpm/windows?loop=L1&profile=5m');
  });

  // CHG-158 (owner's image): the head names the window and what is shown; the window end is said once, in the eyebrow
  it('heads the fused view with its window and Gate outcomes, saying the end once', () => {
    tab();
    expect(screen.getByRole('heading', { name: 'Gate outcomes' })).toBeTruthy();
    expect(screen.getByText(/^Latest fused 12h window · ended 5 Nov/)).toBeTruthy();
    expect(screen.getAllByText(/5 Nov/)).toHaveLength(1);
  });
});
