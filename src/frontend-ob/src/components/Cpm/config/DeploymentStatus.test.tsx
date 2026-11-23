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
    expect(screen.getByText('0 of 3 ready')).toBeTruthy();
    const text = screen.getByTestId('deployment-status').textContent ?? '';
    expect(text).not.toMatch(/PREPARE|APPLY|ACK|pending|Epoch|Short Feature|ACTIVE_VERIFIED only/);
    expect(screen.queryByText(/Roll back/)).toBeNull();
  });

  it('a refusal shows its reason and a mixed fleet is called out in words, with no jar (CHG-184)', () => {
    render(<DeploymentDetail deployment={base({
      state: 'PREPARING',
      ackMatrix: [
        { jobName: 'AMS - CPLM Short Feature Engine', prepare: { status: 'ACK', bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: { status: 'NACK', bundleHash: HASH, jarSha256: 'jar-B', reason: 'UNKNOWN_PROPERTY G4.activity_warn_ratioX', receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: null, apply: null },
      ],
    })} />);
    expect(screen.getByText(/^Setting not known: /)).toBeTruthy();
    const note = screen.getByText('Different software versions are running.');
    expect(note.getAttribute('role')).toBe('alert');
    expect(screen.queryByText(/jar/)).toBeNull();
  });

  it('active and verified: no jar, no hash and no rolled back deployment id; the probe and the observers (CHG-184)', () => {
    const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'dabe186270133b84', reason: null, receivedAt: 't' };
    render(<DeploymentDetail deployment={base({ state: 'ACTIVE_VERIFIED', kind: 'ROLLBACK', active: true, rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab',
      probeResults: { pinnedResults: 648, checkedAt: '2026-09-25T18:37:00Z' }, observers: ['AMS - CPLM Instrument Context Engine'],
      ackMatrix: base({}).requiredMembers.map(jobName => ({ jobName, prepare: ack, apply: ack })) })} />);
    const text = screen.getByTestId('deployment-status').textContent ?? '';
    expect(text).not.toMatch(/dabe1862|617f2e13|aaaaaaaa|jar|Rolls back/);
    expect(screen.getByText('3 of 3 ready')).toBeTruthy();
    expect(screen.getByText('Results on it').nextSibling?.textContent).toMatch(/^648/);
    expect(text).not.toMatch(/Observers|ACK|PREPARE|APPLY/);
  });

  // CHG-193 (final review M8): that a deployment is a rollback is a fact again, as a word; never the rolled back id
  it('says whether the deployment is a rollback, as Yes or No, with no id', () => {
    render(<DeploymentDetail deployment={base({ kind: 'ROLLBACK', rollbackOf: '617f2e13-2ef0-4c5d-9a1b-0123456789ab' })} />);
    expect(screen.getByText('Rollback').nextSibling?.textContent).toBe('Yes');
    expect(screen.getByText('Takes effect').nextSibling?.textContent).toMatch(/^immediately/);
    expect(screen.getByTestId('deployment-status').textContent).not.toMatch(/617f2e13/);
    cleanup();
    render(<DeploymentDetail deployment={base({})} />);
    expect(screen.getByText('Rollback').nextSibling?.textContent).toBe('No');
  });

  it('says nothing about workers; a refusal reads in words with the raw reason only in its title', () => {
    const ack = (reason: string | null, status: 'ACK' | 'NACK' = 'NACK') => ({ status, bundleHash: HASH, jarSha256: 'jar-A', reason, receivedAt: 't' });
    render(<DeploymentDetail deployment={base({
      state: 'ACTIVATION_FAILED',
      ackMatrix: [
        { jobName: 'AMS - CPLM Short Feature Engine', prepare: ack('UNKNOWN_PROPERTY G4.activity_warn_ratioX'), apply: null },
        { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: ack('CATALOGUE_HASH_MISMATCH'), apply: null },
        { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: ack('boom'), apply: null },
      ],
    })} />);
    const view = screen.getByTestId('deployment-status');
    expect(view.textContent).not.toMatch(/Worker|UNKNOWN_PROPERTY|CATALOGUE|boom/i);
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText(/^Setting not known: /)).toBeTruthy();
    expect(screen.getByText('Different settings list')).toBeTruthy();
    expect(screen.getByText('Refused')).toBeTruthy();
    expect(screen.getByText(/^Setting not known: /).getAttribute('title')).toBe('UNKNOWN_PROPERTY G4.activity_warn_ratioX');
  });

  it('a mixed fleet reads in words without "Worker"', () => {
    const a = (jar: string) => ({ status: 'ACK' as const, bundleHash: HASH, jarSha256: jar, reason: null, receivedAt: 't' });
    render(<DeploymentDetail deployment={base({ ackMatrix: [
      { jobName: 'x', prepare: a('jar-A'), apply: null }, { jobName: 'y', prepare: a('jar-B'), apply: null }] })} />);
    expect(screen.getByText('Different software versions are running.')).toBeTruthy();
    expect(screen.getByTestId('deployment-status').textContent).not.toMatch(/Worker/i);
  });

  it('a settled deployment keeps the mixed-software note as a neutral line, not an alert', () => {
    const a = (jar: string) => ({ status: 'ACK' as const, bundleHash: HASH, jarSha256: jar, reason: null, receivedAt: 't' });
    for (const state of ['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK', 'PARTIALLY_ACKNOWLEDGED', 'ACTIVATION_FAILED'] as const) {
      cleanup();
      render(<DeploymentDetail deployment={base({ state, ackMatrix: [{ jobName: 'x', prepare: a('jar-A'), apply: null }, { jobName: 'y', prepare: a('jar-B'), apply: null }] })} />);
      const note = screen.getByText('At this deployment, parts ran different software versions');
      expect(note.getAttribute('role')).toBeNull();
      expect(screen.queryByText('Different software versions are running.')).toBeNull();
    }
  });
});
