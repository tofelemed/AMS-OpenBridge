import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fmtWhen } from '../blocks/whenText';
import type { HistoryWindow } from './useWindowKpis';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
import SelectedWindowPanel from './SelectedWindowPanel';

afterEach(cleanup);

const win: HistoryWindow = {
  windowStart: '2026-11-04T12:00:00Z', windowEnd: '2026-11-05T00:00:00Z', diagnosis: 'SUSPECTED_FINAL_ELEMENT_NONLINEARITY',
  confidence: 0.89, sampleCount: 8640, insufficientEvidenceReason: null, methodRunIds: { G15: 'run-1' }, gates: [],
  metrics: { good_error_pct: 0.62, auto_pct: 1, mae: 0.5, saturation_pct: 0.04 }, calculation: 'v7 · profile v3',
};
const base = { loopId: 'FIC10302', window: win, fellBack: false, noWindows: false, onWiden: () => {}, onFit: () => {}, onReplay: () => {}, onPackage: () => {}, packageReady: true };
const show = (over = {}) => render(<MemoryRouter><SelectedWindowPanel {...base} {...over} /></MemoryRouter>);

describe('SelectedWindowPanel', () => {
  it('shows four KPIs, Review this window → and Fit to this window on the right', () => {
    const onFit = vi.fn();
    show({ onFit });
    for (const label of ['In band', 'Time in normal mode', 'MAE', 'Saturation']) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('62 %')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review this window →' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fit to this window' }));
    expect(onFit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Evidence package ↗' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replay ↗' })).toBeTruthy();
  });

  it('states the period once, with fmtWhen', () => {
    show();
    const text = document.body.textContent ?? '';
    expect(text.split(fmtWhen(win.windowEnd)).length - 1).toBe(1);
    expect(text).toContain(fmtWhen(win.windowStart));
  });

  it('keeps a stored zero as 0, and labels a value that was never stored', () => {
    show({ window: { ...win, metrics: { good_error_pct: 0.62, saturation_pct: 0 } } });
    expect(screen.getByText('0 %')).toBeTruthy();                       // saturation was stored as 0
    expect(screen.getAllByText('Not stored').length).toBe(2);            // Time in normal mode and MAE were not
  });

  it('puts samples and calculation behind technical details, and says what the score is behind a ?', () => {
    show();
    expect(screen.getByText('Evidence score')).toBeTruthy();
    expect(screen.getByText('89')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'About score' })).toBeTruthy();
    expect(document.querySelector('details')?.textContent).toContain('8640');
  });

  it('gives the reason when a window has no run to review', () => {
    show({ window: { ...win, methodRunIds: {} } });
    expect((screen.getByRole('button', { name: 'Review this window →' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('before v2.5');
  });

  it('says nothing was evaluated, with a way out, when the range holds no window', () => {
    const onWiden = vi.fn();
    show({ window: undefined, noWindows: true, onWiden });
    fireEvent.click(screen.getByRole('button', { name: 'Widen to 30 days' }));
    expect(onWiden).toHaveBeenCalled();
  });

  it('says a linked window is not in the range and shows no other window in its place', () => {
    show({ window: undefined, fellBack: true });
    expect(screen.getByRole('status').textContent).toContain('not in the current range, so none is selected');
    expect(screen.queryByText('No window selected')).toBeNull();
    expect(document.body.textContent).not.toContain('newest evaluated window');
  });

  // CHG-153: a no-fault window is a result; only an excluded, short or unevaluated window has no verdict
  it('shows the score of a no-fault window when it has one', () => {
    show({ window: { ...win, diagnosis: 'NO_CALL', confidence: 0.4 } });
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.queryByText('Not stored')).toBeNull();
  });

  it('does not say a no-fault window has no verdict', () => {
    show({ window: { ...win, diagnosis: 'NO_CALL', confidence: null } });
    expect(screen.queryByText('No verdict in this window')).toBeNull();
    expect(screen.getByText('Not stored')).toBeTruthy();
    cleanup();
    show({ window: { ...win, diagnosis: 'INSUFFICIENT_DATA', confidence: null } });
    expect(screen.getByText('No verdict in this window')).toBeTruthy();
  });
});
