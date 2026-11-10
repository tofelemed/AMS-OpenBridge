// CHG-130: the Evidence controls in the band. The evaluated window is a dropdown newest-first with state and age; under More sit
// the window kind (fused / short / long), "Load older" paging and a jump-to-date.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EvidenceMore, EvidenceWindowSelect, type WindowKindOption } from './EvidenceToolbar';
import type { WindowOption } from './useEvidenceWindows';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const kinds: WindowKindOption[] = [
  { kind: '24h', tier: 'fused', label: '24h — fused verdict' }, { kind: '12h', tier: 'fused', label: '12h — fused verdict' },
  { kind: '15m', tier: 'short', label: '15m — 15 min / 1 min slide' }, { kind: '4h', tier: 'long', label: '4h — long diagnostics' },
];
const win = (over: Partial<WindowOption>): WindowOption => ({
  windowEnd: '2026-09-17T08:00:00Z', windowStart: null, kind: '24h', tier: 'fused', label: 'ends 2026-09-17 08:00:00 · INSUFFICIENT DATA · 20 min ago', tone: 'muted', ageMs: 0,
  sampleCount: 1, methodRunIds: { G5: 'g5' }, hasRunIds: true, gates: [], flags: undefined, methodEligibility: null, purpose: null, ...over,
});

const base = (over: Partial<React.ComponentProps<typeof EvidenceWindowSelect>> = {}) => ({
  loopId: 'FIC10405', kind: '24h',
  windows: [win({}), win({ windowEnd: '2026-09-17T07:45:00Z', label: 'ends 2026-09-17 07:45:00 · WARN · 35 min ago', methodRunIds: { G5: 'g5b' } })],
  windowsLoading: false, windowsError: null, currentMethodRunId: 'g5b', onWindow: () => {},
  ...over,
});

const more = (over: Partial<React.ComponentProps<typeof EvidenceMore>> = {}) => {
  render(<EvidenceMore loopId="FIC10405" kind="24h" kinds={kinds} windowsError={null} onRetryWindows={() => {}} hasMore
    onLoadMore={() => {}} loadingMore={false} onKind={() => {}} onJump={() => {}} {...over} />);
  fireEvent.click(screen.getByRole('button', { name: /More/ }));
};

describe('EvidenceWindowSelect', () => {
  // CHG-160: the open window had no run of its own (pre-v2.5), so it was listed twice: once as the placeholder, once in the list
  it('selects the open window by its end when no run matches, and lists it once', () => {
    render(<EvidenceWindowSelect {...base({ currentMethodRunId: undefined, currentEnd: '2026-09-17T08:00:00Z' })} />);
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    expect(sel.value).toBe('2026-09-17T08:00:00Z');
    expect(sel.querySelectorAll('option')).toHaveLength(2);
  });

  it('lists the windows newest-first with the current one selected, and reports a chosen window', () => {
    const onWindow = vi.fn();
    render(<EvidenceWindowSelect {...base({ onWindow })} />);
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    const opts = [...sel.querySelectorAll('option')].map(o => o.textContent);
    expect(opts[0]).toContain('ends 2026-09-17 08:00:00');
    expect(sel.value).toBe('2026-09-17T07:45:00Z');
    fireEvent.change(sel, { target: { value: '2026-09-17T08:00:00Z' } });
    expect(onWindow).toHaveBeenCalledWith(expect.objectContaining({ windowEnd: '2026-09-17T08:00:00Z' }));
  });

  // CHG-160 (owner review): a window that cannot be opened is left out; a history-only one stays, disabled, because it says how to open it
  it('leaves out a window that cannot be opened, keeps a history-only one disabled, and explains the empty / loading / error states', () => {
    const { rerender } = render(<EvidenceWindowSelect {...base({ windows: [
      win({ hasRunIds: false, windowEnd: '2026-09-17T08:00:00Z', label: 'pre-v2.5' }),
      win({ hasRunIds: false, historyOnly: true, windowEnd: '2026-09-17T07:45:00Z', label: 'history' }),
    ], currentMethodRunId: undefined })} />);
    const select = screen.getByLabelText('Evaluated window');
    expect(select.querySelector('option[value="2026-09-17T08:00:00Z"]')).toBeNull();
    expect((select.querySelector('option[value="2026-09-17T07:45:00Z"]') as HTMLOptionElement).disabled).toBe(true);
    rerender(<EvidenceWindowSelect {...base({ windows: [], windowsLoading: true })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/Loading/);
    rerender(<EvidenceWindowSelect {...base({ windows: [], windowsError: new Error('boom') })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/could not be listed/);
    rerender(<EvidenceWindowSelect {...base({ windows: [] })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/No 24h windows/);
    rerender(<EvidenceWindowSelect {...base({ loopId: undefined, windows: [] })} />);
    expect(screen.getByLabelText('Evaluated window').textContent).toMatch(/Pick a loop/);
  });
});

describe('EvidenceWindowSelect for a run the list does not hold', () => {
  const runWindow = '12h · 10 Oct 17:00 → 11 Oct 05:00 · UTC';

  it('still says which window is open, even with no listed windows', () => {
    render(<EvidenceWindowSelect {...base({ windows: [], currentMethodRunId: 'evaluated', runWindow })} />);
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    expect(sel.selectedOptions[0].textContent).toBe(runWindow);
    expect(sel.disabled).toBe(false);
  });

  it('never offers an empty list instead of the open window', () => {
    render(<EvidenceWindowSelect {...base({ currentMethodRunId: 'evaluated', runWindow })} />);
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    expect(sel.selectedOptions[0].textContent).toBe(runWindow);
    expect(sel.textContent).not.toContain('Choose a window');
  });
});

describe('EvidenceMore', () => {
  it('opens on the window kind optgroups', () => {
    more();
    const kindSelect = screen.getByLabelText('Window') as HTMLSelectElement;
    expect([...kindSelect.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Fused verdicts', 'Short features (G0–G4)', 'Long diagnostics (G5–G11)']);
    expect(kindSelect.value).toBe('24h');
  });

  it('pages older windows and jumps to a date', () => {
    const onLoadMore = vi.fn(), onJump = vi.fn(), onKind = vi.fn();
    more({ onLoadMore, onJump, onKind });
    fireEvent.click(screen.getByRole('button', { name: /Load older/ }));
    expect(onLoadMore).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Jump to date'), { target: { value: '2026-09-10T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onJump).toHaveBeenCalledWith(new Date('2026-09-10T12:00').toISOString());
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: '15m' } });
    expect(onKind).toHaveBeenCalledWith('15m');
  });
});
