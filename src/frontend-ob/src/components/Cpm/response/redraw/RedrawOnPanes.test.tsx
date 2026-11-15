// CHG-198 (owner, 2026-11-15): on the System Response tabs. "Redraw from historian" sits in the charts note of an event whose stored
// charts are gone (never when they exist: they are the exact proof), disabled with its reason once the event is older than the
// historian keeps loop samples. A redraw shows the trends that can be made under one plain label; Model fit, Fit quality and
// Frequency each say in one plain line that they exist only with the stored charts.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EvidenceManifest } from '../../../../api/cpm/evidence';
import type { ResponseEventDetail } from '../../../../api/cpm/response';
import { EventPanes, type EventPanesProps } from '../EventPanes';
import { q, result, selfRegulating, T0S } from '../trends/trendFixtures';
import { redrawWindow } from './historianRead';
import { redrawArtifacts } from './redrawArtifacts';
import { historianPoints } from './redrawFixtures';
import type { Redrawn } from './useRedraw';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string; 'aria-describedby'?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant, 'aria-describedby': p['aria-describedby'] }, p.children),
}));

const DAY = 86_400_000;
const e = selfRegulating();
const manifest = (readiness: string, artifacts: unknown[] = []) =>
  ({ methodRunId: 'r1', etag: '"m"', readiness, count: artifacts.length, reconstructable: false, artifacts }) as unknown as EvidenceManifest;
const held = manifest('COMPLETE', [{ gate: 'G12', kind: 'accepted_samples', readiness: 'COMPLETE' }]);
const redrawn: Redrawn = { byKind: redrawArtifacts(historianPoints(e, () => 130), redrawWindow(e.result, 0)!, 'OP_TO_PV', e.metrics)!, points: 331 };

function draw(tab: EventPanesProps['tab'], over: { manifest?: EvidenceManifest; redrawn?: Redrawn; result?: ResponseEventDetail['result']; metrics?: typeof e.metrics } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventPanes tab={tab} timeZone="UTC" t0Ms={T0S * 1000} pvUnit="m3/h" redrawn={over.redrawn} eventName="15 Sept 12:00 · Input test · OP → PV · Candidate"
        detail={{ data: { result: over.result ?? e.result, metrics: over.metrics ?? e.metrics }, isError: false, isLoading: false } as unknown as EventPanesProps['detail']}
        manifest={{ data: over.manifest ?? manifest('EXPIRED'), isError: false } as unknown as EventPanesProps['manifest']}
        arts={{ byKind: {}, loading: false, errors: [], unavailable: [] }} />
    </QueryClientProvider>,
  );
}
const redrawButton = () => screen.queryByRole('button', { name: 'Redraw from historian' });

describe('Redraw from historian on the System Response tabs', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(T0S * 1000 + 2 * DAY); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('offers the redraw in the charts note when the charts were removed or never kept, as a secondary button', () => {
    for (const readiness of ['EXPIRED', 'NONE']) {
      draw('response', { manifest: manifest(readiness) });
      const note = screen.getByRole('note');
      const button = within(note).getByRole('button', { name: 'Redraw from historian' });
      expect(button.getAttribute('data-variant')).toBe('normal');
      expect((button as HTMLButtonElement).disabled).toBe(false);
      cleanup();
    }
  });

  it('never offers it while the stored charts exist, nor on another tab', () => {
    draw('response', { manifest: held });
    expect(redrawButton()).toBeNull();
    cleanup();
    draw('fit');
    expect(redrawButton()).toBeNull();
  });

  it('is disabled past the historian\'s keep, with the reason on screen and as its description', () => {
    vi.setSystemTime(T0S * 1000 + 91 * DAY);
    draw('response');
    const button = redrawButton()! as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const why = document.getElementById(button.getAttribute('aria-describedby')!);
    expect(why?.textContent).toBe('The historian keeps loop samples for 90 days; this event is older.');
  });

  it('opens the dialog with the loop and the event on its band', () => {
    draw('response');
    fireEvent.click(redrawButton()!);
    const d = screen.getByRole('dialog', { name: 'Redraw from historian' });
    expect(d.querySelector('.ui-dialog__subtitle')?.textContent).toBe('FIC1 · 15 Sept 12:00 · Input test · OP → PV · Candidate');
  });

  it('shows the redrawn trends under one plain label, Model fit as a plain line, and the quantities after them', () => {
    const { container } = draw('response', { redrawn });
    const label = 'Redrawn from the historian. The values are the engine\'s; samples the engine left out are not marked.';
    expect(screen.getAllByText(label)).toHaveLength(1);
    const trends = container.querySelector('[aria-label="Response trends"]')!;
    expect([...trends.querySelectorAll('h2')].map(h => h.textContent))
      .toEqual(['Measured response', 'Input', 'Dead time and time constant', 'Rise time and settling', 'Error from the setpoint']);
    expect(within(trends as HTMLElement).getByText('Model fit exists only with the stored charts.')).toBeTruthy();
    expect(redrawButton()).toBeNull();
    const order = [...container.querySelectorAll('h2')].map(h => h.textContent);
    expect(order[order.length - 1]).toBe('Reported quantities');
  });

  it('a redrawn interrupted event: the plain note, then the measured response and the input, no model fit line', () => {
    const { container } = draw('response', { redrawn, result: result({ evaluation_state: 'CENSORED', model_state: 'NONE' }) });
    expect(screen.getAllByRole('note').map(n => n.textContent)).toContain('This event was interrupted before the response finished, so no model was fitted.');
    expect([...container.querySelectorAll('[aria-label="Response trends"] h2')].map(h => h.textContent)).toEqual(['Measured response', 'Input']);
    expect(screen.queryByText('Model fit exists only with the stored charts.')).toBeNull();
  });

  it('Fit quality and Frequency say in one plain line that they exist only with the stored charts', () => {
    draw('fit', { redrawn });
    expect(screen.getByText('Fit quality exists only with the stored charts.')).toBeTruthy();
    cleanup();
    draw('frequency', { redrawn, metrics: [...e.metrics, q('gain_margin', 6, 'dB')] });
    expect(screen.getByText('The frequency response exists only with the stored charts.')).toBeTruthy();
    cleanup();
    draw('fit');
    expect(screen.queryByText('Fit quality exists only with the stored charts.')).toBeNull();
  });
});
