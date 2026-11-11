// v2.5 Task 3D.1 (spec §5.6; NR-051): a deployment's word comes from the server's state - a partial ACK matrix never reads as
// active, a NACK shows its reason, a mixed-jar fleet is called out, and the active bundle per job is what each job acknowledged
// applying. CHG-169 (owner review): the selected deployment's panel body. Roll back left the card (it is offered once, at the
// Deployments tab's head); the shared jar sits in the matrix heading; the active bundle per job shows when a job differs; the
// rolled back deployment id reads short and whole on copy (it was cut through its hyphen).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeploymentDetail } from './DeploymentStatus';
import type { Deployment } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/icon-button/icon-button', () => ({
  ObcIconButton: (p: { children?: React.ReactNode; onClick?: () => void }) => React.createElement('button', { onClick: p.onClick }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google', () => ({ ObiContentCopyGoogle: () => null }));
afterEach(cleanup);

const HASH = 'a'.repeat(64);
const base = (over: Partial<Deployment>): Deployment => ({
  deploymentId: 'd1', bundleId: 'b1', contentHash: HASH, kind: 'ACTIVATE', rollbackOf: null, scheduledFor: null, state: 'PREPARING', error: null, epoch: 0,
  probeResults: null, createdBy: 'alice', createdAt: '2026-09-17T08:00:00Z', updatedAt: '2026-09-17T08:00:00Z',
  requiredMembers: ['AMS - CPLM Short Feature Engine', 'AMS - CPLM Long Diagnostics Engine', 'AMS - CPLM Gate Fusion Engine'],
  ackMatrix: [
    { jobName: 'AMS - CPLM Short Feature Engine', prepare: { status: 'ACK', bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: '2026-09-17T08:00:05Z' }, apply: null },
    { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: null, apply: null },
    { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: null, apply: null },
  ],
  active: false, semantics: 'ACTIVE_VERIFIED only after every required worker ACKed', ...over,
});

describe('DeploymentDetail', () => {
  it('a partial matrix never shows as active and names what is pending', () => {
    render(<DeploymentDetail deployment={base({ state: 'PARTIALLY_ACKNOWLEDGED', error: 'no acknowledgement within 5 min' })} />);
    expect(screen.getByTestId('deployment-status').getAttribute('data-state')).toBe('PARTIALLY_ACKNOWLEDGED');
    expect(screen.getAllByText('pending').length).toBe(5);              // two PREPARE + three APPLY cells
    expect(screen.getByText('1 of 3 PREPARE · 0 of 3 APPLY')).toBeTruthy();
    expect(screen.getAllByText('not yet applied')).toHaveLength(3);     // a job that has not applied this hash: its column shows
    expect(screen.queryByText(/Roll back/)).toBeNull();
    expect(screen.getByText('ACTIVE_VERIFIED only after every required worker ACKed')).toBeTruthy();
  });

  it('a NACK shows its reason and a mixed-jar fleet is called out, with a jar per cell', () => {
    render(<DeploymentDetail deployment={base({
      state: 'ACTIVATION_FAILED',
      ackMatrix: [
        { jobName: 'AMS - CPLM Short Feature Engine', prepare: { status: 'ACK', bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: { status: 'NACK', bundleHash: HASH, jarSha256: 'jar-B', reason: 'UNKNOWN_PROPERTY G4.activity_warn_ratioX', receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: null, apply: null },
      ],
    })} />);
    expect(screen.getByText('UNKNOWN_PROPERTY G4.activity_warn_ratioX')).toBeTruthy();
    expect(screen.getByText(/2 different jars/)).toBeTruthy();
    expect(screen.getByText('jar jar-B')).toBeTruthy();
  });

  it('active and verified: the shared jar in the heading, no repeated hash per job, the probe and the rolled back id', () => {
    const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'dabe186270133b84', reason: null, receivedAt: 't' };
    render(<DeploymentDetail deployment={base({ state: 'ACTIVE_VERIFIED', kind: 'ROLLBACK', active: true, rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab',
      probeResults: { pinnedResults: 648, checkedAt: '2026-09-25T18:37:00Z' }, observers: ['AMS - CPLM Instrument Context Engine'],
      ackMatrix: base({}).requiredMembers.map(jobName => ({ jobName, prepare: ack, apply: ack })) })} />);
    expect(screen.getByText(/· jar dabe1862/)).toBeTruthy();
    expect(screen.queryByText(HASH.slice(0, 12))).toBeNull();
    expect(screen.getAllByText('ACK')).toHaveLength(6);
    expect(screen.getByText(/648 result\(s\) pinned to this hash/)).toBeTruthy();
    expect(screen.getByText('617f2e13')).toBeTruthy();
    expect(screen.queryByText(/617f2e13-2ef/)).toBeNull();
    expect(screen.getByText(/Observers: AMS - CPLM Instrument Context Engine/)).toBeTruthy();
    expect(screen.getByText('Short Feature Engine')).toBeTruthy();
  });
});
