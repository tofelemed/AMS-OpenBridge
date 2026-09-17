// v2.5 workbench (audit F6): the toolbar every other CPM page has - scope filter, loop search, then
// the window kind (fused / short / long) and the evaluated window newest-first with state and age,
// "Load older" paging and a jump-to-date - so the workbench opens from a loop, never from a typed URL.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EvidenceToolbar, type WindowKindOption } from './EvidenceToolbar';
import type { WindowOption } from './useEvidenceWindows';
import type { CpmScope } from '../plantScope';

vi.mock('../plantScope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../plantScope')>();
  return { ...actual, PlantScopeFilter: () => React.createElement('div', { 'data-testid': 'scope-filter' }) };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const scope = { site: '', area: '', unit: '', active: false, params: {}, matches: () => true, set: () => {} } as unknown as CpmScope;
const loops = [{ loopId: 'FIC10405', displayName: 'Hexane feed flow', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC' }] as never;
const kinds: WindowKindOption[] = [
  { kind: '24h', tier: 'fused', label: '24h — fused verdict' }, { kind: '12h', tier: 'fused', label: '12h — fused verdict' },
  { kind: '15m', tier: 'short', label: '15m — 15 min / 1 min slide' }, { kind: '4h', tier: 'long', label: '4h — long diagnostics' },
];
const win = (over: Partial<WindowOption>): WindowOption => ({
  windowEnd: '2026-09-17T08:00:00Z', windowStart: null, kind: '24h', tier: 'fused', label: 'ends 2026-09-17 08:00:00 · INSUFFICIENT DATA · 20 min ago', tone: 'muted', ageMs: 0,
  sampleCount: 1, methodRunIds: { G5: 'g5' }, hasRunIds: true, gates: [], flags: undefined, methodEligibility: null, purpose: null, ...over,
});

const base = (over: Partial<React.ComponentProps<typeof EvidenceToolbar>> = {}) => ({
  scope, loops, loopId: 'FIC10405', kind: '24h', kinds,
  windows: [win({}), win({ windowEnd: '2026-09-17T07:45:00Z', label: 'ends 2026-09-17 07:45:00 · WARN · 35 min ago', methodRunIds: { G5: 'g5b' } })],
  windowsLoading: false, windowsError: null, onRetryWindows: () => {}, currentMethodRunId: 'g5b',
  hasMore: true, onLoadMore: () => {}, loadingMore: false,
  onLoop: () => {}, onClearLoop: () => {}, onKind: () => {}, onWindow: () => {}, onJump: () => {},
  ...over,
});

describe('EvidenceToolbar', () => {
  it('renders the scope filter, the loop combobox and the window kind optgroups', () => {
    render(<EvidenceToolbar {...base()} />);
    expect(screen.getByTestId('scope-filter')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Control loop' })).toBeTruthy();
    const kindSelect = screen.getByLabelText('Window') as HTMLSelectElement;
    expect([...kindSelect.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Fused verdicts', 'Short features (G0–G4)', 'Long diagnostics (G5–G11)']);
    expect(kindSelect.value).toBe('24h');
  });

  it('lists the windows newest-first with the current one selected, and reports a chosen window', () => {
    const onWindow = vi.fn();
    render(<EvidenceToolbar {...base({ onWindow })} />);
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    const opts = [...sel.querySelectorAll('option')].map(o => o.textContent);
    expect(opts[0]).toContain('ends 2026-09-17 08:00:00');
    expect(sel.value).toBe('2026-09-17T07:45:00Z');
    fireEvent.change(sel, { target: { value: '2026-09-17T08:00:00Z' } });
    expect(onWindow).toHaveBeenCalledWith(expect.objectContaining({ windowEnd: '2026-09-17T08:00:00Z' }));
  });

  it('disables a window without run identity and explains the empty / loading / error states', () => {
    const { rerender } = render(<EvidenceToolbar {...base({ windows: [win({ hasRunIds: false, label: 'ends x · no run identity (pre-v2.5)' })] })} />);
    const opt = screen.getByLabelText('Evaluated window').querySelector('option[value="2026-09-17T08:00:00Z"]') as HTMLOptionElement;
    expect(opt.disabled).toBe(true);
    rerender(<EvidenceToolbar {...base({ windows: [], windowsLoading: true })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/Loading/);
    rerender(<EvidenceToolbar {...base({ windows: [], windowsError: new Error('boom') })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/could not be listed/);
    rerender(<EvidenceToolbar {...base({ windows: [] })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/No 24h windows/);
    rerender(<EvidenceToolbar {...base({ loopId: undefined, windows: [] })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/Pick a loop/);
  });

  it('pages older windows and jumps to a date', () => {
    const onLoadMore = vi.fn(), onJump = vi.fn(), onKind = vi.fn();
    render(<EvidenceToolbar {...base({ onLoadMore, onJump, onKind })} />);
    fireEvent.click(screen.getByRole('button', { name: /Load older/ }));
    expect(onLoadMore).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Jump to date'), { target: { value: '2026-09-10T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onJump).toHaveBeenCalledWith(new Date('2026-09-10T12:00').toISOString());
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '15m' } });
    expect(onKind).toHaveBeenCalledWith('15m');
  });
});
