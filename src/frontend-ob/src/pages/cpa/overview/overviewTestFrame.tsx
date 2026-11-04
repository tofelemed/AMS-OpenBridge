/**
 * The Overview tests' stage: what each mocked data hook answers, and a router with a location probe.
 * Each test file's `vi.mock` calls hand their module to the fakes here, so the data hooks are the
 * only thing replaced and the page's own logic runs for real.
 */
import React from 'react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { vi } from 'vitest';
import type { TrendPanelProps } from '../../../ui/trend';
import { episode, fleetRow, KPIS, kpiLoops, NEWEST_END, NOW, ranked, SUMMARY, TREND } from './overviewFixtures';

const read = <T,>(data: T) => ({ data, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() });

function freshStage() {
  return {
    kpis: read<typeof KPIS | undefined>(KPIS),
    trend: read<typeof TREND | undefined>(TREND),
    summary: read<typeof SUMMARY | undefined>(SUMMARY),
    queue: read<{ loops: Array<ReturnType<typeof ranked>>; shelvedCount?: number } | undefined>({
      loops: [ranked({ loopId: 'FIC101' }), ranked({ loopId: 'TIC202', priority: 'LOW', diagnosis: 'CONFIRMED_OSCILLATION', ackState: 'ACKNOWLEDGED' })],
      shelvedCount: 0,
    }),
    fleet: {
      byLoop: new Map([['fic101', fleetRow({ loopId: 'FIC101' })], ['pic303', fleetRow({ loopId: 'PIC303', state: 'Stale', ageSeconds: 7200 })]]),
      newest: Date.parse(NEWEST_END) as number | null,
      loading: false,
    },
    outOfMode: 10 as number | null,
    list: read<ReturnType<typeof kpiLoops> | undefined>(kpiLoops()),
    loop: read<{ displayName: string; engineering: { pvUnit: string } } | undefined>({ displayName: 'Reactor feed', engineering: { pvUnit: 'kg/h' } }),
    events: read<{ events: Array<ReturnType<typeof episode>> } | undefined>({ events: [episode({ id: 41 })] }),
    samples: read({ points: [] as unknown[] }),
    page: { ...read<{ total: number; events: Array<ReturnType<typeof episode>> } | undefined>({ total: 1, events: [episode({ id: 41 })] }), dataUpdatedAt: NOW },
    calls: { list: vi.fn(), page: vi.fn(), samples: vi.fn() },
  };
}

export const stage = { current: freshStage() };
export const resetStage = () => { stage.current = freshStage(); };

export const fakeHooks = {
  useFleetKpis: () => stage.current.kpis,
  useFleetKpiTrend: (_scope: unknown, days: number) => { stage.current.calls.samples('trend', days); return stage.current.trend; },
  useFleetSummary: () => stage.current.summary,
  useFleetRankings: () => stage.current.queue,
  useCpmLoop: () => stage.current.loop,
  useCpmEvents: () => stage.current.events,
  useCpmTrend: (series: string, from: Date, to: Date, _w: number, _m: string, enabled: boolean) => {
    stage.current.calls.samples('window', series, from.getTime(), to.getTime(), enabled);
    return stage.current.samples;
  },
  useEventPage: (q: unknown) => { stage.current.calls.page(q); return stage.current.page; },
  useDebounced: <T,>(value: T) => value,
  useKpiList: (q: unknown, enabled: boolean) => {
    stage.current.calls.list(q, enabled);
    return enabled ? stage.current.list : read(undefined);
  },
  useOutOfModeCount: () => stage.current.outOfMode,
  useFleetRows: () => stage.current.fleet,
};

/** The context hook over the real URL, in a fixed site zone. */
export function useFakeContext(readRange: (q: URLSearchParams) => unknown) {
  const [params] = useSearchParams();
  const site = params.get('site') ?? '';
  return {
    scope: { site, area: '', unit: '', active: !!site, params: site ? { site } : {}, matches: () => true, set: () => undefined },
    range: readRange(params),
    window: ((k: string | null) => (k === '12h' || k === '24h' ? k : null))(params.get('window')),
    loop: params.get('loop') ?? '',
    zone: { id: 'Asia/Dubai', abbr: 'GST' },
    setRange: () => undefined,
  };
}

export const FakeButton: React.FC<{ children?: React.ReactNode; onClick?: () => void; disabled?: boolean }> = ({ children, onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
);

/** Records what the panel was asked to draw. A segment becomes a button, as a lane pick. */
export const FakeTrendPanel: React.FC<TrendPanelProps> = p => (
  <section data-testid={`trend-${p.heading}`} data-from={p.plotWindow?.from} data-to={p.plotWindow?.to}
    data-state={p.state?.kind ?? 'ready'} data-selected={p.selectedBandId ?? ''}>
    <h3>{p.heading}</h3>
    <div>{p.context}</div>
    <div>{p.toolbar}</div>
    <p>{p.state && 'message' in p.state ? p.state.message : ''}</p>
    {p.lanes?.flatMap(lane => lane.segments.map(s => (
      <button key={s.id} type="button" onClick={() => p.onSelectBand?.(s, lane)}>Pick {s.id}</button>
    )))}
  </section>
);

const Probe: React.FC = () => {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
};

export const Frame: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) => (
  <MemoryRouter initialEntries={[url]}>
    {children}
    <Probe />
  </MemoryRouter>
);

/** The current URL, parsed. */
export function here(probe: HTMLElement): URL {
  return new URL(probe.textContent ?? '', 'http://test');
}
