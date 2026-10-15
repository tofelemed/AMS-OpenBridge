// v2.5 Task 2E.3 (spec §3.1-3.2; NR-031, R13) + the 2026-09-17 redesign: the workbench opens an
// IMMUTABLE selection - the method run named in the URL - and never asks for "latest"; a loop alone
// lands on its newest window that carries run identity (URL replaced, so back does not bounce);
// the gate strip, the window steppers and "Newest" all navigate within the loaded window list.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { GateEvidenceWorkspace } from './GateEvidenceWorkspace';
import { parseSelection, selectionSearch } from './selection';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});
vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/accordion-item/accordion-item', () => ({
  // CHG-050: the explain / evidence sections are accordion items — title as a heading, a toggle, content when open.
  ObcAccordionItem: (p: { title: string; open?: boolean; children?: React.ReactNode; onAccordionItemToggle?: (e: { detail: { open: boolean } }) => void }) =>
    React.createElement('div', null,
      React.createElement('h2', null, p.title),
      React.createElement('button', { onClick: () => p.onAccordionItemToggle?.({ detail: { open: !p.open } }) }, `Toggle ${p.title}`),
      p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));

const RUN = '9dca9bf0-c536-5e6d-90db-9df50e36099b';
const G3_FUSED = 'a3a3a3a3-0000-5000-8000-000000000003';
const identity = { bundleHash: 'profile:ef9abb', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: 'abc', jarSha256: 'def', datasetHash: 'ds', source: 'flink' };
const noEvidence = (id: string) => ({ methodRunId: id, etag: '"e"', readiness: 'NONE', count: 0, reconstructable: true, reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: id, endpoint: '/api/v1/cpm/analysis-runs' }, artifacts: [] });
const fusedRow = {
  loopId: 'FIC10302', windowKind: '24h', windowStart: '2026-09-16T08:00:00Z', windowEnd: '2026-09-17T08:00:00Z', sampleCount: 1977, diagnosis: 'INSUFFICIENT_DATA', severity: null, confidence: null,
  gates: [{ key: 'G0', status: 'PASS', reason: null, methodRunId: 'g0-run' }, { key: 'G3', status: 'NOT_EVALUATED', reason: null, methodRunId: G3_FUSED }, { key: 'G15', status: 'INSUFFICIENT', reason: null, methodRunId: 'g15-run' }],
  methodRunIds: { G0: 'g0-run', G3: G3_FUSED, G15: 'g15-run' }, bundleHash: 'profile:ef9abb', resultRevision: 1,
  observabilityFlags: ['NO_VP'], familyDisqualifiers: [], insufficientEvidenceReason: 'INSUFFICIENT_SAMPLES', methodEligibility: null, computedAt: '2026-09-17T08:01:00Z', jarSha256: 'def',
};

function respond(url: string): unknown {
  if (url.endsWith(`/method-runs/${RUN}`)) {
    return { methodRunId: RUN, tier: 'short', gate: 'G3', loopId: 'FIC10302', site: 'hdpe', windowKind: '5m', gateResultId: null,
      support: { fromMs: 1789586400000, toMs: 1789586700000, sampleCount: 61 }, identity, cell: null, verdictV2: null, result: { gate3_status: 'WARN' },
      methodRunIds: { G0: 'g0-run', G3: RUN }, reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-16T12:05:00Z' };
  }
  if (url.endsWith(`/method-runs/${G3_FUSED}`) || url.endsWith('/method-runs/g15-run') || url.endsWith('/method-runs/g0-run')) {
    const gate = url.endsWith('/g15-run') ? 'G15' : url.endsWith('/g0-run') ? 'G0' : 'G3';
    const status = gate === 'G15' ? 'INSUFFICIENT' : gate === 'G0' ? 'PASS' : 'NOT_EVALUATED';
    return { methodRunId: url.slice(url.lastIndexOf('/') + 1), tier: 'fusion', gate, loopId: 'FIC10302', site: 'hdpe', windowKind: '24h', gateResultId: 7,
      support: { fromMs: Date.parse(fusedRow.windowStart), toMs: Date.parse(fusedRow.windowEnd), sampleCount: 1977 }, identity,
      cell: { key: gate, name: gate, tier: 'fusion', status, reason: null }, verdictV2: null, result: null, methodRunIds: fusedRow.methodRunIds,
      reconstruction: { supported: true, reason: '' }, computedAt: fusedRow.computedAt };
  }
  if (url.endsWith('/method-runs/evidence/batch')) {
    return { count: 4, manifests: Object.fromEntries([RUN, G3_FUSED, 'g15-run', 'g0-run', 'g1-run', 'g11-run'].map(id => [id, noEvidence(id)])) };
  }
  // CHG-099: the accepted reconstruction names the run it rebuilds; its state is read (and refreshed) while it runs
  if (url.endsWith('/analysis-runs')) return { analysisRunId: 'ar-1', loopId: 'FIC10302', purpose: 'EVIDENCE_RECONSTRUCTION', jobId: 'job-1', source: 'iotdb', gate: 'G3', reconstructs: RUN };
  if (url.endsWith('/analysis-runs/ar-1')) return { analysisRunId: 'ar-1', state: 'SUBMITTED' };
  if (/\/method-runs\/[^/]+\/evidence$/.test(url)) return noEvidence(url.split('/').slice(-2)[0]);
  if (url.includes('/gates?')) {
    const q = new URL('http://x' + url).searchParams;
    if (q.get('projection') !== 'summary' || q.get('includeInsufficient') !== 'true') throw new Error(`the picker must ask for summary rows incl. insufficient: ${url}`);
    return { loopId: 'FIC10302', windowKind: q.get('windowKind'), count: 1, projection: 'summary', windows: q.get('windowKind') === '24h' ? [fusedRow] : [] };
  }
  if (url.includes('/kpis?')) return { loopId: 'FIC10302', resolution: '5m', tier: 'short', count: 0, nextBefore: null, samples: [] };
  if (url.endsWith('/resolutions')) return { shortWindows: ['1m', '5m', '15m'], longWindows: ['4h', '12h', '24h'], windows: [], fusion: { firesOn: ['12h', '24h'], produces: '', note: '' }, gates: [], note: '' };
  if (url.endsWith('/gate-catalogue')) {
    return { count: 3, service: { version: '1', sourceCommit: 'x' }, gates: [
      { gate: 'G0', name: 'Data quality', tier: 'short', role: 'BLOCKING', definition: 'd0', preconditions: 'p', method: { id: 'G0.DATA_QUALITY', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null },
      { gate: 'G3', name: 'Base performance', tier: 'short', role: 'PERFORMANCE', definition: 'Error against the objective', preconditions: 'PV and SP', method: { id: 'G3.OBJECTIVE_ERROR', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null },
      { gate: 'G15', name: 'Decision', tier: 'fusion', role: 'FUSION', definition: 'The verdict', preconditions: 'p', method: { id: 'G15.FUSION', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null },
    ] };
  }
  if (url.includes('/loops')) return { loops: [{ loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', area: 'a', unit: 'u', loopType: 'FIC', timezone: 'Asia/Dubai', tags: {}, links: [], observabilityFlags: [] }] };
  throw new Error(`unexpected request ${url}`);
}

const LocationProbe: React.FC = () => { const l = useLocation(); return <div data-testid="loc">{l.pathname + l.search}</div>; };

function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/cpm/evidence${search}`]}>
        <Routes><Route path="/cpm/evidence" element={<><GateEvidenceWorkspace /><LocationProbe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const urls = () => vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0]));

describe('GateEvidenceWorkspace', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => respond(url));
    vi.mocked(fetchMod.apiFetch).mockReset();
    vi.mocked(fetchMod.apiFetch).mockImplementation(async () => ({ ok: true, status: 200, json: async () => [], arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as Response);
    try { localStorage.removeItem('ams-evidence-explain-collapsed'); } catch { /* jsdom */ }
  });
  afterEach(cleanup);

  it('renders the selected run from the URL and never requests the latest gates', async () => {
    renderAt(`?loop=FIC10302&methodRun=${RUN}&gate=G3`);
    await waitFor(() => expect(screen.getAllByText(/Base performance/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/FIXED/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Identity' }));   // CHG-050: collapsed by default
    expect(screen.getAllByText(/profile:ef9abb/).length).toBeGreaterThan(0);
    expect(urls().some(u => u.includes('/gates/latest'))).toBe(false);
    expect(urls().some(u => u.includes('/fleet/'))).toBe(false);
    expect(urls().some(u => u.endsWith(`/method-runs/${RUN}`))).toBe(true);
  });

  it('shows a stated evidence state with the reconstruction action when nothing is retained', async () => {
    renderAt(`?loop=FIC10302&methodRun=${RUN}&gate=G3`);
    await waitFor(() => expect(screen.getAllByText(/Evidence not retained for this run/).length).toBeGreaterThan(0));   // NOT_RETAINED: policy, not a wait
    expect(screen.getAllByText(/Reconstruct evidence/).length).toBeGreaterThan(0);
  });

  // 2026-10-03 (Marun): the plant reconstructs a window in ~20 s, but the workspace refetched the manifest once
  // (too early) and then held it for 30 s, so the charts only appeared on a reselect. While a reconstruction is
  // pending the manifest is polled; the hook stops by itself once readiness is COMPLETE.
  it('polls the manifest every 10 s once a reconstruction was accepted', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderAt(`?loop=FIC10302&methodRun=${RUN}&gate=G3`);
      await waitFor(() => expect(screen.getAllByText(/Reconstruct evidence/).length).toBeGreaterThan(0));
      // the hook coalesces manifest reads into the batch endpoint; a poll is one more batch (or single) read
      const manifestGets = () => urls().filter(u => u.endsWith('/method-runs/evidence/batch') || u.endsWith(`/method-runs/${RUN}/evidence`)).length;
      fireEvent.click(screen.getAllByText(/Reconstruct evidence/)[0]);
      await waitFor(() => expect(screen.getAllByText(/Reconstruction accepted/).length).toBeGreaterThan(0));
      await vi.advanceTimersByTimeAsync(1_000);
      const afterAccept = manifestGets();                      // the one invalidation refetch
      await vi.advanceTimersByTimeAsync(10_500);
      expect(manifestGets()).toBeGreaterThan(afterAccept);    // a poll fired
      await vi.advanceTimersByTimeAsync(10_500);
      expect(manifestGets()).toBeGreaterThan(afterAccept + 1); // and keeps firing while nothing arrived
    } finally { vi.useRealTimers(); }
  });

  it('parses and re-encodes the selection so the URL is the source of truth', () => {
    const sel = parseSelection(new URLSearchParams(`loop=FIC10302&methodRun=${RUN}&gate=G3&mode=FIXED`));
    expect(sel).toEqual({ loopId: 'FIC10302', methodRunId: RUN, gate: 'G3', mode: 'FIXED' });
    expect(selectionSearch(sel!)).toBe(`loop=FIC10302&methodRun=${RUN}&gate=G3&mode=FIXED`);
    expect(parseSelection(new URLSearchParams('loop=FIC10302'))).toBeNull();
  });

  it('a loop with kind=24h lists its 24h windows (CHG-089: 12h is the default) and lands on the newest run with identity (URL replaced), without /gates/latest', async () => {
    renderAt('?loop=FIC10302&kind=24h');
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('methodRun=g15-run'));
    expect(screen.getByTestId('loc').textContent).toContain('gate=G15');
    expect(urls().some(u => u.includes('/gates?') && u.includes('projection=summary') && u.includes('includeInsufficient=true'))).toBe(true);
    expect(urls().some(u => u.includes('/gates/latest'))).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: /Change/ }));   // CHG-050: the pickers fold to one line
    const sel = screen.getByLabelText('Evaluated window') as HTMLSelectElement;
    await waitFor(() => expect(sel.value).toBe('2026-09-17T08:00:00Z'));
    expect(sel.options[sel.selectedIndex].textContent).toMatch(/Not evaluated: not enough data \(too few samples\)/);
  });

  it('the gate strip opens another gate of the same window and the explain panel collapses (remembered)', async () => {
    renderAt(`?loop=FIC10302&methodRun=g15-run&gate=G15`);
    await waitFor(() => expect(screen.getByRole('button', { name: /^G0 Data quality/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^G0 Data quality/ }));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toContain('methodRun=g0-run&gate=G0'));
    fireEvent.click(screen.getByRole('button', { name: 'Hide explain' }));
    expect(screen.getByRole('button', { name: 'Show explain' })).toBeTruthy();
    expect(localStorage.getItem('ams-evidence-explain-collapsed')).toBe('true');
  });

  it('a short-tier gate on a fused row is stated as evaluated on the short windows, with the link', async () => {
    renderAt(`?loop=FIC10302&methodRun=${G3_FUSED}&gate=G3`);
    await waitFor(() => expect(screen.getAllByText(/Evaluated on the 1m–60m windows/).length).toBeGreaterThan(0));
    expect(screen.getByRole('link', { name: /Open the 15m windows of FIC10302/ }).getAttribute('href')).toBe('/cpm/evidence?loop=FIC10302&kind=15m');
  });
});
