// v2.5 Task 1H.6 — the panel renders the SERVED health state. NR-044: an M-only device is
// "context only, measurement valid"; an unbound role is an unavailable state, never OK.
import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LoopInstrumentHealth, RoleHealth } from '../../../api/cpm/health';
import { TransmitterHealthPanel, loopHealthSummary, roleHeadline } from './TransmitterHealthPanel';

const role = (over: Partial<RoleHealth>): RoleHealth => ({
  role: 'PV', eligibility: 'ELIGIBLE', descriptiveEligibility: 'ELIGIBLE', reason: 'NO_ACTIVE_DIAGNOSTIC',
  deviceId: 'TT-101', bindingId: 'b1', activeFlags: [], collectionState: 'VERIFIED', measurementImpact: 'VALID',
  healthStateId: 'hs', intervalFrom: '2026-09-01T00:00:00Z', intervalTo: null, intervalRevision: 1,
  lastObservedAt: '2026-09-01T01:00:00Z', lastVerifiedAt: '2026-09-01T01:00:00Z', observedAgeS: 30, verifiedAgeS: 30,
  nativeStatus: 'GOOD', activeDiagnostics: 0, diagnostics: [], interpretationVersion: 1,
  ...over,
});

const health = (roles: RoleHealth[]): LoopInstrumentHealth => ({
  loopId: 'FIC10101', at: '2026-09-01T01:00:30Z', roles, sourceState: 'online', sourceSince: null,
});

afterEach(cleanup);

describe('TransmitterHealthPanel', () => {
  it('renders an M-only device as context only with the measurement still valid (NR-044)', () => {
    const r = role({ activeFlags: ['M'], eligibility: 'ELIGIBLE', reason: 'MAINTENANCE_CONTEXT_ONLY', measurementImpact: 'VALID' });
    render(<TransmitterHealthPanel health={health([r])} />);
    expect(screen.getByText(/Maintenance required — context only, measurement valid/)).toBeTruthy();
    expect(screen.getByTitle('Maintenance required')).toBeTruthy();
    expect(screen.getByText('INSTRUMENTS OK')).toBeTruthy();
  });

  it('renders NOT_CONFIGURED as unavailable, never as OK', () => {
    const r = role({ eligibility: 'NOT_CONFIGURED', descriptiveEligibility: 'NOT_CONFIGURED', reason: 'NO_BINDING', deviceId: null, bindingId: null });
    render(<TransmitterHealthPanel health={health([r])} />);
    expect(screen.getByText(/No device bound — health unavailable \(not OK\)/)).toBeTruthy();
    expect(screen.getByText('HEALTH NOT CONFIGURED')).toBeTruthy();
    expect(screen.queryByText('INSTRUMENTS OK')).toBeNull();
    expect(screen.queryByText('No active diagnostic')).toBeNull();
  });

  it('shows a failure with its flag label, native status and the device diagnostics verbatim', () => {
    const r = role({
      activeFlags: ['F'], eligibility: 'INELIGIBLE', descriptiveEligibility: 'INELIGIBLE', reason: 'F_AFFECTS_PV',
      measurementImpact: 'INVALID', nativeStatus: 'FAILURE', activeDiagnostics: 1,
      diagnostics: [{ diagnosticId: 'd1', nativeCode: 'F042', message: 'Sensor break', flags: ['F'], affectedVariableIds: ['FIC10101.PV'],
        measurementImpact: 'INVALID', firstObservedAt: '2026-09-01T00:30:00Z', cause: 'Open circuit', remedy: 'Replace sensor', sourceRecordRef: null }],
    });
    render(<TransmitterHealthPanel health={health([r])} />);
    expect(screen.getByText('INSTRUMENT FAULT')).toBeTruthy();
    expect(screen.getByText(/Failure — measurement invalid/)).toBeTruthy();
    expect(screen.getByText('F042')).toBeTruthy();
    expect(screen.getByText('Replace sensor')).toBeTruthy();
    expect(screen.getByText('FAILURE')).toBeTruthy();
  });

  it('summarises worst-of across roles and keeps stale collection visible', () => {
    expect(loopHealthSummary(health([role({}), role({ role: 'VP', eligibility: 'LIMITED' })])).label).toBe('INSTRUMENT LIMITED');
    expect(loopHealthSummary(undefined).label).toBe('HEALTH UNKNOWN');
    expect(roleHeadline(role({ collectionState: 'STALE', activeFlags: ['S'] }))).toMatch(/^Stale collection — Out of specification/);
    expect(roleHeadline(role({ collectionState: 'OFFLINE' }))).toMatch(/Source offline/);
  });
});
