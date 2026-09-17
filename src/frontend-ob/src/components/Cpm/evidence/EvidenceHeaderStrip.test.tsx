// v2.5 workbench (audit F13): the header is one row of labelled facts - window, mode, evidence,
// age, run id - that never overlap, plus the window navigation; the reconstruction action appears
// only when the state offers it.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('states the window in the site zone with its samples, the mode, the evidence readiness, the age and the run id', () => {
    render(<EvidenceHeaderStrip selection={selection} run={run} entry={entry} loopName="Hexane feed flow" timeZone="UTC" readiness="COMPLETE"
      nav={{ newer: null, older: () => {}, newest: () => {}, atNewest: true, inList: true }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('FIC10405 · Hexane feed flow — G5 Oscillation (ACF)');
    const facts = screen.getByRole('list', { name: 'Run facts' }).textContent!;
    expect(facts).toMatch(/24h/);
    expect(facts).toMatch(/1,977 samples/);
    expect(facts).toMatch(/UTC/);
    expect(facts).toMatch(/FIXED/);
    expect(facts).toMatch(/COMPLETE/);
    expect(facts).toMatch(/computed 20(\.0)? min ago/);
    expect(screen.getByTitle(run.methodRunId)).toBeTruthy();
    expect(screen.queryByText(/LIVE/)).toBeNull();                         // LIVE is the norm; only another purpose is worth a pill
  });

  it('disables Newer at the newest window and both steppers when the run is not in the listed windows, saying why', () => {
    const { rerender } = render(<EvidenceHeaderStrip selection={selection} run={run} entry={entry} loopName={undefined} timeZone="UTC" readiness="COMPLETE"
      nav={{ newer: null, older: () => {}, newest: () => {}, atNewest: true, inList: true }} />);
    expect((screen.getByRole('button', { name: /Newer/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Newest/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Older/ }) as HTMLButtonElement).disabled).toBe(false);
    rerender(<EvidenceHeaderStrip selection={selection} run={run} entry={entry} loopName={undefined} timeZone="UTC" readiness="COMPLETE"
      nav={{ newer: null, older: null, newest: () => {}, atNewest: false, inList: false }} />);
    expect(screen.getByRole('button', { name: /Older/ }).parentElement!.getAttribute('title')).toMatch(/not in the listed/);
  });

  it('offers reconstruction only when asked to, and a SHADOW purpose is stated', () => {
    const onClick = vi.fn();
    render(<EvidenceHeaderStrip selection={selection} run={{ ...run, identity: { ...run.identity, purpose: 'SHADOW' } }} entry={entry} loopName={undefined} timeZone="UTC" readiness="NONE"
      nav={{ newer: null, older: null, newest: null, atNewest: false, inList: false }} reconstruct={{ onClick, busy: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconstruct evidence' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('SHADOW')).toBeTruthy();
  });
});
