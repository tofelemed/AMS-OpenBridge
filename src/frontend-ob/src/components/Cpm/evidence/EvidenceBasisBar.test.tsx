// Task 15 fix: the bar says nothing when no arrays exist and no reconstruction was asked for (the state panel says it),
// but a reconstruction that is still running, failed, or produced nothing is a data state and stays on screen.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EvidenceBasisBar } from './EvidenceBasisBar';
import type { EvidenceManifest, EvidenceReconstruction } from '../../../api/cpm/evidence';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
afterEach(cleanup);

const recon = (over: Partial<EvidenceReconstruction>): EvidenceReconstruction => ({
  analysisRunId: 'ar1', state: 'RUNNING', createdAt: '2026-10-15T08:00:00Z', source: 'iotdb', differing: 0, identical: 0,
  readiness: 'PENDING', sourceCommit: null, jarSha256: null, artifacts: [], ...over,
});
const manifest = (reconstructions: EvidenceReconstruction[]): EvidenceManifest => ({
  methodRunId: 'run', etag: '', readiness: 'NONE', count: 0, reconstructable: true,
  reconstruct: { purpose: 'EVIDENCE_RECONSTRUCTION', methodRunId: 'run', endpoint: '' }, artifacts: [], reconstructions,
});
const bar = (m: EvidenceManifest | undefined) =>
  render(<EvidenceBasisBar manifest={m} view={null} timeZone="UTC" onView={() => {}} />);

describe('EvidenceBasisBar with nothing held', () => {
  it('renders nothing when no arrays exist and no reconstruction was asked for', () => {
    bar(manifest([]));
    expect(screen.queryByRole('group', { name: 'Evidence basis' })).toBeNull();
  });

  it('still says a reconstruction is running', () => {
    bar(manifest([recon({})]));
    expect(screen.getByRole('group', { name: 'Evidence basis' }).textContent).toMatch(/still running/);
  });

  it('still says a reconstruction failed or produced nothing', () => {
    bar(manifest([recon({ readiness: 'FAILED', state: 'FAILED' })]));
    expect(screen.getByRole('group', { name: 'Evidence basis' }).textContent).toMatch(/the run failed/);
  });
});
