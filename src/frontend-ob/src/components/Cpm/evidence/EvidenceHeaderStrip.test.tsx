// v2.5 workbench (audit F13): the header is one row of labelled facts - window, mode, evidence,
// age, run id - that never overlap, plus the window navigation; the reconstruction action appears
// only when the state offers it.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EvidenceHeaderStrip } from './EvidenceHeaderStrip';
import type { MethodRun } from '../../../api/cpm/evidence';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const run: MethodRun = {
  methodRunId: '4ccaf304-0e8d-54df-94ef-83f4130ee28d', tier: 'fusion', gate: 'G5', loopId: 'FIC10405', site: 'hdpe', windowKind: '24h', gateResultId: 1,
  support: { fromMs: Date.UTC(2026, 8, 16, 7, 45), toMs: Date.UTC(2026, 8, 17, 7, 45), sampleCount: 1977 },
  identity: { bundleHash: 'profile:ffa30188e0775f18', contextRevision: 0, resultRevision: 1, purpose: 'LIVE', analysisRunId: null, sourceCommit: '3535c78aa45a', jarSha256: '4ea1da78ead8', datasetHash: 'ds', source: 'flink' },
  cell: { key: 'G5', name: 'Oscillation (ACF)', tier: 'long', status: 'WARN', reason: 'BANDWIDTH' }, verdictV2: null, result: null, methodRunIds: {},
  reconstruction: { supported: true, reason: '' }, computedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
};
const selection = { loopId: 'FIC10405', methodRunId: run.methodRunId, gate: 'G5', mode: 'FIXED' as const };
const entry = { gate: 'G5', name: 'Oscillation (ACF)', tier: 'long', role: 'PRIMARY', definition: 'Dominant period from the ACF.', preconditions: 'p', method: { id: 'G5.ACF_OSCILLATION', version: '3.0.0', state: 'INSTALLED' }, artifactKinds: [], propertyIds: [], capabilityState: 'INSTALLED', capabilityReason: null };

describe('EvidenceHeaderStrip', () => {
  const strip = (r = run) => <EvidenceHeaderStrip selection={selection} run={r} entry={entry} loopName="Hexane feed flow" readiness="COMPLETE" />;

  it('states the samples, the mode, the evidence readiness, the age and the run id', () => {
    render(strip());
    const facts = screen.getByRole('list', { name: 'Run facts' }).textContent!;
    expect(facts).toMatch(/1,977 samples/);
    expect(facts).toMatch(/FIXED/);
    expect(facts).toMatch(/COMPLETE/);
    expect(facts).toMatch(/computed 20(\.0)? min ago/);
    expect(screen.getByTitle(run.methodRunId)).toBeTruthy();
    expect(screen.queryByText(/LIVE/)).toBeNull();                         // LIVE is the norm; only another purpose is worth a pill
  });

  it('leaves the window to the dropdown in the band', () => {
    render(strip());
    expect(screen.getByRole('list', { name: 'Run facts' }).textContent).not.toMatch(/2026-09-16/);
  });

  it('states a SHADOW purpose', () => {
    render(strip({ ...run, identity: { ...run.identity, purpose: 'SHADOW' } }));
    expect(screen.getByText('SHADOW')).toBeTruthy();
  });
});
