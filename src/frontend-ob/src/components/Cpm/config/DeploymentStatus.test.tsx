// v2.5 Task 3D.1 (spec §5.6; NR-051): a deployment's word comes from the server's state - a partial
// ACK matrix never reads as active, a NACK shows its reason, a mixed-jar fleet is called out, and
// the active bundle per job is what each job acknowledged applying.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DeploymentStatus } from './DeploymentStatus';
import type { Deployment } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
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

describe('DeploymentStatus', () => {
  it('a partial matrix never shows as active and names what is pending', () => {
    render(<DeploymentStatus deployment={base({ state: 'PARTIALLY_ACKNOWLEDGED', error: 'no acknowledgement from AMS - CPLM Long Diagnostics Engine, AMS - CPLM Gate Fusion Engine within 5 min' })} canRollback rollbackPending={false} onRollback={() => {}} />);
    const el = screen.getByTestId('deployment-status');
    expect(el.getAttribute('data-state')).toBe('PARTIALLY_ACKNOWLEDGED');
    expect(screen.getByText(/Partially acknowledged - NOT active/)).toBeTruthy();
    expect(screen.getAllByText('pending').length).toBe(5);              // two PREPARE + three APPLY cells
    expect(screen.queryByText(/Active and verified/)).toBeNull();
    expect(screen.queryByText(/Roll back to the previous bundle/)).toBeNull();
  });

  it('a NACK shows its reason and a mixed-jar fleet is called out', () => {
    render(<DeploymentStatus deployment={base({
      state: 'ACTIVATION_FAILED', error: 'PREPARE NACK: AMS - CPLM Long Diagnostics Engine: UNKNOWN_PROPERTY G4.activity_warn_ratioX',
      ackMatrix: [
        { jobName: 'AMS - CPLM Short Feature Engine', prepare: { status: 'ACK', bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Long Diagnostics Engine', prepare: { status: 'NACK', bundleHash: HASH, jarSha256: 'jar-B', reason: 'UNKNOWN_PROPERTY G4.activity_warn_ratioX', receivedAt: 't' }, apply: null },
        { jobName: 'AMS - CPLM Gate Fusion Engine', prepare: null, apply: null },
      ],
    })} canRollback rollbackPending={false} onRollback={() => {}} />);
    expect(screen.getByText(/Activation failed - NOT active/)).toBeTruthy();
    expect(screen.getByText('UNKNOWN_PROPERTY G4.activity_warn_ratioX')).toBeTruthy();
    expect(screen.getByText(/2 different jars/)).toBeTruthy();
  });

  it('active and verified lists the applied hash per job and offers the rollback only with the permission', () => {
    const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'jar-A', reason: null, receivedAt: 't' };
    const d = base({ state: 'ACTIVE_VERIFIED', active: true, probeResults: { pinnedResults: 3, checkedAt: '2026-09-17T08:10:00Z' },
      ackMatrix: base({}).requiredMembers.map(jobName => ({ jobName, prepare: ack, apply: ack })) });
    const calls: string[] = [];
    const { unmount } = render(<DeploymentStatus deployment={d} canRollback rollbackPending={false} onRollback={id => calls.push(id)} />);
    expect(screen.getByText(/Active and verified/)).toBeTruthy();
    expect(screen.getAllByText(HASH.slice(0, 12)).length).toBe(3);
    expect(screen.getByText(/3 result\(s\) pinned/)).toBeTruthy();
    screen.getByText('Roll back to the previous bundle').click();
    expect(calls).toEqual(['d1']);
    unmount();
    render(<DeploymentStatus deployment={d} canRollback={false} rollbackPending={false} onRollback={() => {}} />);
    expect((screen.getByText('Roll back to the previous bundle') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/needs cpm.config.rollback/)).toBeTruthy();
  });
});
