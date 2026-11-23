// Task 8 (journey): the Deploy step in words - a datetime-local input named with the plant zone, rows "5 of 5 ready", the panel
// title a short phrase, Roll back naming the version that runs and what goes back.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DeploymentsTab } from './DeploymentsTab';
import { RollbackDialog, goesBackWords } from './RollbackDialog';
import type { Bundle, Deployment } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
vi.mock('@oicl/openbridge-webcomponents-react/icons/icon-close-google', () => ({ ObiCloseGoogle: () => null }));
afterEach(cleanup);

const HASH = 'a'.repeat(64);
const ack = { status: 'ACK' as const, bundleHash: HASH, jarSha256: 'j', reason: null, receivedAt: 't' };
const dep = (over: Partial<Deployment> = {}): Deployment => ({
  deploymentId: 'd1', bundleId: 'b1', contentHash: HASH, kind: 'ACTIVATE', rollbackOf: null, scheduledFor: null, state: 'ACTIVE_VERIFIED', error: null, epoch: 1,
  probeResults: null, createdBy: 'alice', createdAt: '2026-11-23T08:00:00Z', updatedAt: 't', requiredMembers: [],
  ackMatrix: ['a', 'b', 'c', 'd', 'e'].map(jobName => ({ jobName, prepare: ack, apply: ack })), active: true, semantics: 'x', rollbackTarget: { bundleId: 'b0', version: 11 }, ...over,
});
const bundle = (props: Record<string, unknown> = {}): Bundle => ({ bundleId: 'b1', version: 12, scopeKind: 'LOOP', scopeRef: 'FIC10302', resolved: { properties: props, sources: {} } } as unknown as Bundle);
const lc = (label: string, enabled = true) => ({ key: 'deploy' as const, label, enabled, reason: null });
const view = (extra: Partial<React.ComponentProps<typeof DeploymentsTab>> = {}) => render(
  <DeploymentsTab bundle={bundle()} deployments={[dep()]} deploymentsLoading={false} deploymentsError={null} retryDeployments={() => {}}
    activate={lc('Deploy')} rollback={{ ...lc('Roll back'), key: 'rollback' }} reasons={{ activate: null, rollback: null }}
    busy={{ deploy: false, rollback: false }} errors={{ deploy: null, rollback: null }} verifiedActivation={dep()} onDeploy={() => {}} onRollback={() => {}} {...extra} />);

describe('DeploymentsTab in words', () => {
  it('the row reads 5 of 5 ready, never PREPARE / APPLY', () => {
    view();
    expect(screen.getByText(/5 of 5 ready/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/PREPARE|APPLY|ACK|Epoch|jar/);
  });

  it('says the step word, Deploy, for the button and a deployment row; never Activate or Activation', () => {
    view();
    expect(within(screen.getByRole('region', { name: 'Deploy and roll back' })).getByRole('button', { name: 'Deploy' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Deployments' })).getByRole('button', { name: 'Deploy' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Activat/);
  });

  it('a row says its state in the panel title words, never "Active (verified)"', () => {
    view();
    expect(within(screen.getByRole('region', { name: 'Deployments' })).getByText('Running')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/verified/i);
  });

  it('a settled running row has the same glyph as the page pill, even with an ACK-window probe (retest 8)', () => {
    view({ deployments: [dep({ probeResults: { verifiedBy: 'ACK_WINDOW' } })] });
    expect(within(screen.getByRole('region', { name: 'Deployments' })).getByText(/Running/).textContent).toMatch(/✓ ?Running/);
  });

  it('the schedule is a datetime-local input named with the plant zone, sent as the instant in that zone', () => {
    const onDeploy = vi.fn();
    view({ onDeploy });
    const input = screen.getByLabelText(/^Takes effect at · /) as HTMLInputElement;
    expect(input.type).toBe('datetime-local');
    expect(screen.queryByText(/ISO/)).toBeNull();
    fireEvent.change(input, { target: { value: '2026-11-24T06:00' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Deploy and roll back' })).getByRole('button', { name: 'Deploy' }));
    const sent = onDeploy.mock.calls[0][0].scheduledFor as string;
    expect(Number.isNaN(Date.parse(sent))).toBe(false);
    expect(sent).toMatch(/Z$/);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Deploy and roll back' })).getByRole('button', { name: 'Deploy' }));
    expect(onDeploy.mock.calls[1][0]).toEqual({ scheduledFor: null });
  });

  it('the panel title is a short phrase, not a technical sentence', () => {
    view();
    expect(screen.getByRole('heading', { name: 'Running' })).toBeTruthy();
    expect(screen.queryByText(/a result carries this bundle hash/)).toBeNull();
  });

  it('Roll back names the version that will run', () => {
    view();
    expect(screen.getByRole('button', { name: 'Roll back to Own settings v11' })).toBeTruthy();
  });
});

describe('RollbackDialog', () => {
  it('names the version and says what goes back, in one line', () => {
    render(<RollbackDialog open bundle={bundle()} activation={dep()} changes={[{ property: 'G2r.pv_region_max', before: 125, after: 120 }]} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Roll back to Own settings v11')).toBeTruthy();
    expect(screen.getByText('Region maximum goes back from 125 to 120')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Rolls back|Active again|The bundle that ran before/);
  });
  it('without known differences it has the first line only', () => {
    render(<RollbackDialog open bundle={bundle()} activation={dep()} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Roll back to Own settings v11')).toBeTruthy();
    expect(goesBackWords([])).toBeNull();
  });
});
