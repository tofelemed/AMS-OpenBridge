// v2.5 Task 2E.3 (spec §3.1-3.2; NR-031, R13): the workbench opens an IMMUTABLE selection - the
// method run named in the URL - and never asks for "latest"; the selection is restored from the URL
// (back / forward keep it); a gate that is not the selected one is a navigation, never a silent swap.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fetchMod from '../../../api/apiFetch';
import { GateEvidenceWorkspace } from './GateEvidenceWorkspace';
import { parseSelection, selectionSearch } from './selection';

vi.mock('../../../api/apiFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/apiFetch')>();
  return { ...actual, apiJson: vi.fn(), apiFetch: vi.fn() };
});

const RUN = '9dca9bf0-c536-5e6d-90db-9df50e36099b';

function respond(url: string): unknown {
  if (url.endsWith(`/method-runs/${RUN}`)) {
    return {
      methodRunId: RUN, tier: 'short', gate: 'G3', loopId: 'FIC10302', site: 'hdpe', windowKind: '5m', gateResultId: null,
      support: { fromMs: 1789586400000, toMs: 1789586700000, sampleCount: 61 },
      identity: { bundleHash: 'profile:ef9abb', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: 'abc', jarSha256: 'def', datasetHash: 'ds', source: 'flink' },
      cell: null, verdictV2: null, result: { gate3_status: 'WARN' }, methodRunIds: { G0: 'g0-run', G3: RUN }, reconstruction: { supported: true, reason: '' }, computedAt: '2026-09-16T19:25:00Z',
    };
  }
  if (url.endsWith(`/method-runs/${RUN}/evidence`)) {
    return { methodRunId: RUN, etag: '"e"', readiness: 'NONE', count: 0, reconstructable: true, reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: RUN, endpoint: '/api/v1/cpm/analysis-runs' }, artifacts: [] };
  }
  if (url.endsWith('/method-runs/g0-run/evidence')) {
    return { methodRunId: 'g0-run', etag: '"g"', readiness: 'NONE', count: 0, reconstructable: true, reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: 'g0-run', endpoint: '' }, artifacts: [] };
  }
  if (url.endsWith('/gate-catalogue')) {
    return { count: 2, service: { version: '1', sourceCommit: 'x' }, gates: [
      { gate: 'G0', name: 'Data quality', tier: 'short', role: 'BLOCKING', definition: 'd0', preconditions: 'p', method: { id: 'G0.DATA_QUALITY', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: ['role_qualification'], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null },
      { gate: 'G3', name: 'Base performance', tier: 'short', role: 'PERFORMANCE', definition: 'Error against the objective', preconditions: 'PV and SP', method: { id: 'G3.BASE_PERFORMANCE', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: ['objective_error'], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null },
    ] };
  }
  if (url.includes('/loops')) return { loops: [{ loopId: 'FIC10302', displayName: 'Reactor feed flow', site: 'hdpe', timezone: 'Asia/Dubai', tags: {}, links: [], observabilityFlags: [] }] };
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

describe('GateEvidenceWorkspace', () => {
  beforeEach(() => {
    vi.mocked(fetchMod.apiJson).mockReset();
    vi.mocked(fetchMod.apiJson).mockImplementation(async (url: string) => respond(url));
  });
  afterEach(cleanup);

  it('renders the selected run from the URL and never requests the latest gates', async () => {
    renderAt(`?loop=FIC10302&methodRun=${RUN}&gate=G3`);
    await waitFor(() => expect(screen.getAllByText(/Base performance/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/FIXED/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/profile:ef9abb/).length).toBeGreaterThan(0);
    const urls = vi.mocked(fetchMod.apiJson).mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('/gates/latest'))).toBe(false);
    expect(urls.some(u => u.includes('/fleet/'))).toBe(false);
    expect(urls.some(u => u.endsWith(`/method-runs/${RUN}`))).toBe(true);
  });

  it('shows a stated evidence state with the reconstruction action when nothing is retained', async () => {
    renderAt(`?loop=FIC10302&methodRun=${RUN}&gate=G3`);
    await waitFor(() => expect(screen.getAllByText(/No evidence retained for this run/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Reconstruct evidence/).length).toBeGreaterThan(0);
  });

  it('parses and re-encodes the selection so the URL is the source of truth', () => {
    const sel = parseSelection(new URLSearchParams(`loop=FIC10302&methodRun=${RUN}&gate=G3&mode=FIXED`));
    expect(sel).toEqual({ loopId: 'FIC10302', methodRunId: RUN, gate: 'G3', mode: 'FIXED' });
    expect(selectionSearch(sel!)).toBe(`loop=FIC10302&methodRun=${RUN}&gate=G3&mode=FIXED`);
    expect(parseSelection(new URLSearchParams('loop=FIC10302'))).toBeNull();
  });
});
