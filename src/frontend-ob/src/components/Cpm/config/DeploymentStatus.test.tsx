// v2.5 Task 3D.1 (spec §5.6; NR-051): a deployment's word comes from the server's state - a partial ACK matrix never reads as
// active, a NACK shows its reason, a mixed fleet is called out, and the active bundle per job is what each job acknowledged
// applying. CHG-169 (owner review): the selected deployment's panel body. Roll back left the card (it is offered once, at the
// Deployments tab's head); the active bundle per job shows when a job differs. CHG-184: no jar, hash or deployment id.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeploymentDetail } from './DeploymentStatus';
import type { Deployment } from '../../../api/cpm/config';

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

  it('a NACK shows its reason and a mixed fleet is called out as different software releases, with no jar (CHG-184)', () => {
    render(<DeploymentDetail deployment={base({
      state: 'ACTIVATION_FAILED',
      ackMatrix: [
        { jobName: 'AMS - CPLM Short Feature Engine', prepare: { status: 'ACK', bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: { status: 'NACK', bundleHash: HASH, jarSha256: 'jar-B', reason: 'UNKNOWN_PROPERTY G4.activity_warn_ratioX', receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: null, apply: null },
      ],
    })} />);
    expect(screen.getByText('UNKNOWN_PROPERTY G4.activity_warn_ratioX')).toBeTruthy();
    expect(screen.getByText(/2 different software releases/)).toBeTruthy();
    expect(screen.queryByText(/jar/)).toBeNull();
  });

  it('active and verified: no jar, no hash and no rolled back deployment id; the probe and the observers (CHG-184)', () => {
    const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'dabe186270133b84', reason: null, receivedAt: 't' };
    render(<DeploymentDetail deployment={base({ state: 'ACTIVE_VERIFIED', kind: 'ROLLBACK', active: true, rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab',
      probeResults: { pinnedResults: 648, checkedAt: '2026-09-25T18:37:00Z' }, observers: ['AMS - CPLM Instrument Context Engine'],
      ackMatrix: base({}).requiredMembers.map(jobName => ({ jobName, prepare: ack, apply: ack })) })} />);
    const text = screen.getByTestId('deployment-status').textContent ?? '';
    expect(text).not.toMatch(/dabe1862|617f2e13|aaaaaaaa|jar|Rolls back/);
    expect(screen.getAllByText('ACK')).toHaveLength(6);
    expect(screen.getByText(/648 result\(s\) pinned to this bundle/)).toBeTruthy();
    expect(screen.getByText(/Observers: AMS - CPLM Instrument Context Engine/)).toBeTruthy();
    expect(screen.getByText('Short Feature Engine')).toBeTruthy();
  });

  // CHG-193 (final review M8): that a deployment is a rollback is a fact again, as a word; never the rolled back id
  it('says whether the deployment is a rollback, as Yes or No, with no id', () => {
    render(<DeploymentDetail deployment={base({ kind: 'ROLLBACK', rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab' })} />);
    expect(screen.getByText('Rollback').nextSibling?.textContent).toBe('Yes');
    expect(screen.getByTestId('deployment-status').textContent).not.toMatch(/617f2e13/);
    cleanup();
    render(<DeploymentDetail deployment={base({})} />);
    expect(screen.getByText('Rollback').nextSibling?.textContent).toBe('No');
  });
});
