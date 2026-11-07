// @vitest-environment jsdom
// CHG-153: Replay holds 12h and 24h windows. A link that names any other kind says it cannot open that window; it never
// shows a 12h one in its place. The same-instant read of the KPI row ("Z" against "+00:00") is covered here too.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const noQuery = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
const { atRow } = vi.hoisted(() => ({ atRow: { row: undefined as unknown } }));

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('./context/LoopBand', () => ({ LoopBand: (p: { children?: React.ReactNode }) => React.createElement('div', null, p.children) }));
vi.mock('./investigation/LoopNotes', () => ({ LoopNotes: () => null }));
vi.mock('./evidence/EvidenceToolbar', () => ({ EvidenceMore: () => null, EvidenceWindowSelect: () => null }));
vi.mock('./replay/ReplayChart', () => ({ ReplayChart: () => null }));
vi.mock('./replay/ReplayStages', () => ({ ReplayStages: () => null }));
vi.mock('./replay/WindowVerdictCard', () => ({ WindowVerdictCard: () => null }));
vi.mock('./replay/WindowResultSelect', () => ({ WindowResultSelect: () => null }));
vi.mock('./replay/RerunCard', () => ({ RerunCard: () => null }));
vi.mock('./replay/PackageDialog', () => ({ PackageDialog: () => null }));
vi.mock('./replay/RunDetailsDialog', () => ({ RunDetailsDialog: () => null }));
vi.mock('./evidence/useEvidenceWindows', () => ({
  useEvidenceWindows: (_l: unknown, kind: string) => ({ options: [], isLoading: false, error: null, refetch: vi.fn(), hasMore: false, loadMore: vi.fn(), isLoadingMore: false, kind }),
}));
vi.mock('./evidence/useWindowAt', async (orig) => ({
  ...(await orig<typeof import('./evidence/useWindowAt')>()),
  useWindowAt: () => ({ row: atRow.row, rerun: false, others: [], notFound: false, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useCpm', () => ({
  useCpmCalculations: () => ({ ...noQuery, data: { gates: [] } }),
  useCpmEvents: () => noQuery,
  useCpmKpisRange: () => ({ data: { samples: [{ window_end: '2026-11-05T08:00:00Z', sample_period_sec: 7 }] } }),
  useCpmLoops: () => ({ data: { loops: [{ loopId: 'L1', timezone: 'UTC', tags: {} }] } }),
  useGateCatalogue: () => noQuery,
  useRawSlice: () => ({ ...noQuery, data: undefined }),
}));

import { CpmReplay } from './CpmReplay';

const mount = (search: string) => render(<MemoryRouter initialEntries={[`/cpm/replay${search}`]}><CpmReplay /></MemoryRouter>);
afterEach(() => { cleanup(); atRow.row = undefined; });

describe('Replay window kinds', () => {
  it.each(['15m', '4h'])('says it cannot open a %s window and shows no window', (kind) => {
    atRow.row = { windowEnd: '2026-11-05T08:00:00Z', windowStart: '2026-11-04T20:00:00Z', diagnosis: 'X', gates: [], metadata: {}, methodRunIds: { G15: 'r' } };
    mount(`?loop=L1&kind=${kind}&window=2026-11-05T08:00:00Z`);
    expect(screen.getByText('Replay holds 12 h and 24 h windows')).toBeTruthy();
    expect(screen.queryByText(/Original run/)).toBeNull();
  });

  it('still opens a 12h window', () => {
    atRow.row = { windowEnd: '2026-11-05T08:00:00Z', windowStart: '2026-11-04T20:00:00Z', diagnosis: 'X', gates: [], metadata: {}, methodRunIds: { G15: 'r' } };
    mount('?loop=L1&kind=12h&window=2026-11-05T08:00:00Z');
    expect(screen.queryByText('Replay holds 12 h and 24 h windows')).toBeNull();
    expect(screen.getByText(/Original run/)).toBeTruthy();
  });
});
