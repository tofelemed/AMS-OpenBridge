// @vitest-environment jsdom
// Task 8: a gate opens in a dialog. Status, result and window first; Review and Window Inspector at the foot.
// CHG-156: short Prev / Next / Review labels, the result said once, no build or contract details.
// CHG-191 (owner review item 3): wide, two columns, one window line, no Gate role, no caps labels, the foot grouped.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';
import { PerformanceGateDialog } from './PerformanceGateDialog';
import { gateMark } from '../gateStatus';
import { fmtDateTime } from '../shared';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: ({ children, onClick, disabled, variant, className }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; className?: string }) =>
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className}>{children}</button>,
}));
const FROM = '2026-11-04T00:15:00Z';
const TO = '2026-11-04T12:15:00Z';
vi.mock('../../../hooks/useCpm', () => ({
  useLatestGates: () => ({
    isLoading: false, isError: false, error: null,
    data: {
      gates: [{ key: 'G5', status: 'WARN', reason: 'ACF peak 0.42 at 38 s', methodRunId: null }],
      metadata: { calculationVersion: '2.9' }, windowStart: '2026-11-04T00:15:00Z', windowEnd: '2026-11-04T12:15:00Z',
      observabilityFlags: ['INSTRUMENT_HEALTH_NOT_CONFIGURED'], sampleCount: 100,
    },
  }),
  useCpmCalculations: () => ({ data: { gates: [{ key: 'G5', question: 'Is there a regular oscillation?', observedInResults: true }] } }),
  useCpmLoop: () => ({ data: undefined }),
  useGateCatalogue: () => ({ data: { gates: [{ gate: 'G5', role: 'PRIMARY', definition: 'd' }] } }),
}));
afterEach(cleanup);

const ROW = {
  loopId: 'FIC10301', displayName: 'Feed flow', loopType: 'flow', windowEnd: '2026-11-04T12:15:00Z', diagnosis: 'CONFIRMED_OSCILLATION',
  confidence: 0.9, gates: { G4: 'PASS', G5: 'WARN', G6: 'PASS' },
  lastVerdict: { windowEnd: '2026-10-06T19:15:00Z', diagnosis: 'SUSPECTED_STICTION', confidence: 0.6, ageMs: 86_400_000 },
} as CpmHeatmapLoop;

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = (over: Partial<React.ComponentProps<typeof PerformanceGateDialog>> = {}) => {
  const onSelectGate = vi.fn();
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/cpm/performance']}>
      <PerformanceGateDialog row={ROW} gate="G5" windowKind="12h" gateKeys={['G4', 'G5', 'G6']} flags={[]}
        onSelectGate={onSelectGate} onClose={onClose} {...over} />
      <Where />
    </MemoryRouter>);
  return { onSelectGate, onClose };
};
const columns = () => screen.getByRole('dialog').querySelectorAll<HTMLElement>('.cpm-gate-dialog__cols > .cpm-gate-dialog__col');

describe('PerformanceGateDialog', () => {
  it('opens as a dialog named by the gate and its name, with the loop on the band', () => {
    show();
    const d = screen.getByRole('dialog', { name: 'G5 · Oscillation (ACF)' });
    expect(d.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC10301');
  });

  it('builds check status from gateMark so it agrees with the cell', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(gateMark('WARN', 'G5').word)).toBeTruthy();
  });

  it('shows the loop result, the reason and a last verdict labelled as last', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('ACF peak 0.42 at 38 s')).toBeTruthy();
    expect(within(d).getByText(/^last verdict /)).toBeTruthy();
    expect(within(d).queryByText(/current/i)).toBeNull();
  });

  it('offers Review and Window Inspector, carrying loop and profile', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Window Inspector ↗' }));
    expect(screen.getByTestId('where').textContent).toBe('/cpm/windows?loop=FIC10301&profile=12h');
  });

  it('Review goes to Investigation on the same loop and window kind', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Review →' }));
    expect(screen.getByTestId('where').textContent).toMatch(/^\/cpm\/investigation\?loop=FIC10301&profile=12h/);
  });

  it('walks to the previous and next gate with short labels, naming the gate on hover, and not past the ends', () => {
    const { onSelectGate } = show();
    const prev = screen.getByRole('button', { name: 'Prev' });
    expect(prev.closest('[title]')?.getAttribute('title')).toBe('Previous gate G4');
    expect(screen.getByRole('button', { name: 'Next' }).closest('[title]')?.getAttribute('title')).toBe('Next gate G6');
    fireEvent.click(prev);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSelectGate.mock.calls).toEqual([['G4'], ['G6']]);
    cleanup();
    show({ gate: 'G4' });
    expect(screen.queryByRole('button', { name: 'Prev' })).toBeNull();
  });

  it('says the result once when the last verdict is that same result', () => {
    show({ row: { ...ROW, lastVerdict: { diagnosis: 'CONFIRMED_OSCILLATION', confidence: 0.9, ageMs: 86_400_000 } } as CpmHeatmapLoop });
    const d = screen.getByRole('dialog');
    expect(within(d).queryByText(/last verdict/)).toBeNull();
    expect(within(d).getAllByText(/evidence score/)).toHaveLength(1);
  });

  it('shows no build or contract details', () => {
    show();
    const d = screen.getByRole('dialog');
    for (const gone of [/Calculation v/, /^Contract$/, /^Source$/, /^Emitted$/]) expect(within(d).queryByText(gone)).toBeNull();
  });

  it('CHG-191: says the window once, on one line, with both times as the app prints them', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(`12h window · ${fmtDateTime(FROM)} → ${fmtDateTime(TO)}`)).toBeTruthy();
    for (const gone of ['Assessment', 'Window from', 'Window to', 'Window & attribution']) expect(within(d).queryByText(gone)).toBeNull();
    expect(within(d).queryByText(/Latest 12h window/)).toBeNull();
    expect(d.textContent!.split(fmtDateTime(TO)).length - 1).toBe(1);
  });

  it('CHG-191: has no Gate role row, but keeps the role\'s effect on the verdict', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(within(d).queryByText('Gate role')).toBeNull();
    expect(within(d).queryByText('PRIMARY')).toBeNull();
    expect(within(d).getByRole('heading', { name: 'Effect on the verdict' })).toBeTruthy();
    expect(within(d).getByText('Contributes primary evidence to family qualification.')).toBeTruthy();
  });

  it('CHG-191: one normal heading per part and no caps labels', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(d.querySelector('.cpm-eyebrow')).toBeNull();
    for (const gone of [/^Diagnostic evidence$/i, /^Purpose$/i, /^Fusion behaviour$/i, /^Observability$/i]) expect(within(d).queryByText(gone)).toBeNull();
    expect(within(d).getAllByRole('heading', { level: 3 }).map(h => h.textContent))
      .toEqual(['What this gate asks', 'Effect on the verdict', 'Flags on this window']);   // CHG-200: the gate name is in the title
  });

  it('CHG-191: is wide with two columns: the result on the left; purpose, effect and flags on the right; nothing behind a disclosure', () => {
    show();
    const d = screen.getByRole('dialog');
    expect(d.className).toContain('ui-dialog--wide');
    expect(d.querySelector('details')).toBeNull();
    const [left, right] = Array.from(columns());
    expect(columns()).toHaveLength(2);
    for (const fact of ['12h window', 'Check status', 'Loop result', 'Reason', 'Samples', '100']) expect(left.textContent).toContain(fact);
    for (const fact of ['What this gate asks', 'Is there a regular oscillation?', 'Effect on the verdict', 'Flags on this window']) expect(right.textContent).toContain(fact);
    expect(right.textContent).not.toContain('Check status');
  });

  it('CHG-191: groups the foot: Prev / Next, then the "↗" links, then Review, the one primary', () => {
    show();
    const foot = screen.getByRole('dialog').querySelector('.ui-dialog__foot') as HTMLElement;
    const buttons = within(foot).getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual(['Prev', 'Next', 'Workbench ↗', 'Replay ↗', 'Loop ↗', 'Window Inspector ↗', 'Review →']);
    for (const l of buttons.filter(b => b.textContent!.endsWith('↗'))) {
      expect(l.className).toContain('ui-link');
      expect(l.closest('.cpm-gate-actions__links')).toBeTruthy();
    }
    expect(buttons.filter(b => b.getAttribute('data-variant') === 'raised').map(b => b.textContent)).toEqual(['Review →']);
    expect(screen.getByRole('button', { name: 'Review →' }).closest('.cpm-gate-actions__primary')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Prev' }).closest('.cpm-gate-actions__steps')).toBeTruthy();
  });

  it('says on screen why the Workbench link cannot open a run stored before runs were kept', () => {
    show();
    expect((screen.getByRole('button', { name: 'Workbench ↗' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('dialog').textContent).toMatch(/stored before analysis runs were kept/);
  });
});
