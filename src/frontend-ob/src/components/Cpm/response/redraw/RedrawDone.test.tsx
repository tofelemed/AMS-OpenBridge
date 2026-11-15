// CHG-200 (final test #1, the owner's ruling): on the System Response page itself, the redraw dialog stays open after the redraw
// lands in the page cache (the trends then show behind it): Reading → Drawing → Done with the time since the click, then it
// closes by itself. Before, the note that held the dialog went away the moment the redraw existed, so Done was never seen.
// Controller C4: once redrawn, the "charts are not available" note goes; the one "Redrawn from the historian" line says it.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as cpmApi from '../../../../api/cpmApi';
import type { EvidenceManifest } from '../../../../api/cpm/evidence';
import { EventPanes, type EventPanesProps } from '../EventPanes';
import { selfRegulating, T0S } from '../trends/trendFixtures';
import { historianPoints } from './redrawFixtures';
import { useRedrawn } from './useRedraw';

vi.mock('echarts-for-react', () => ({ default: () => React.createElement('div', { 'data-testid': 'echarts' }) }));
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled, 'data-variant': p.variant }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/building-blocks/circular-progress/circular-progress', () => ({
  ObcCircularProgress: () => React.createElement('span', { 'data-testid': 'spinner' }),
}));
vi.mock('../../../../api/cpmApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/cpmApi')>()),
  getRawCursor: vi.fn(),
}));

const e = selfRegulating();
const all = historianPoints(e, () => 130);
const manifest = { methodRunId: 'r1', etag: '"m"', readiness: 'NONE', count: 0, reconstructable: false, artifacts: [] } as unknown as EvidenceManifest;

/** The page as ResponseWorkspace builds it: the redraw is read from the page cache and handed to the panes. */
const Page: React.FC = () => {
  const redrawn = useRedrawn('e1');
  return (
    <EventPanes tab="response" timeZone="UTC" t0Ms={T0S * 1000} pvUnit="m3/h" redrawn={redrawn} eventName="15 Sept 12:00 · Input test · OP → PV · Candidate"
      detail={{ data: { result: e.result, metrics: e.metrics }, isError: false, isLoading: false } as unknown as EventPanesProps['detail']}
      manifest={{ data: manifest, isError: false } as unknown as EventPanesProps['manifest']}
      arts={{ byKind: {}, loading: false, errors: [], unavailable: [] }} />
  );
};
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const dialog = () => screen.queryByRole('dialog', { name: 'Redraw from historian' });

describe('Redraw from historian on the page: Done, then it closes', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime((T0S + 3_600) * 1000); vi.mocked(cpmApi.getRawCursor).mockReset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('shows Done once the redrawn trends are on the page, then closes by itself', async () => {
    vi.mocked(cpmApi.getRawCursor).mockResolvedValueOnce({ series: 's', count: all.length, cursor: null, nextCursor: null, hasMore: false, points: all } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={qc}><Page /></QueryClientProvider>);
    expect(screen.getByRole('note').textContent).toContain('Charts are not available for this event.');
    fireEvent.click(within(screen.getByRole('note')).getByRole('button', { name: 'Redraw from historian' }));
    fireEvent.click(within(dialog()!).getByRole('button', { name: 'Redraw' }));
    await flush();
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(50));   // react-query tells the page a moment later
    // the redraw is on the page behind the dialog, and the dialog says Done
    expect(container.querySelector('[aria-label="Response trends"]')).not.toBeNull();
    expect(dialog()).not.toBeNull();
    expect(within(dialog()!).getByRole('status').textContent).toMatch(/Done/);
    // each fact once: the note went, the one redrawn line says it
    expect(screen.queryByText('Charts are not available for this event.')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1_300));
    expect(dialog()).toBeNull();
    expect(container.querySelector('[aria-label="Response trends"]')).not.toBeNull();
  });
});
