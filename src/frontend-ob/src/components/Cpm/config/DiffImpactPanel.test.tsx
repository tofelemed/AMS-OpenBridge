// The Check step: Setting · Now · New, where Now is the parent version's value or, without a parent, the layers BELOW the version's
// own level (CHG-169 owner answer 2d); then Check (✓ Valid or the errors) and Loops. Validate sits under them with its reason when
// disabled and the server's refusal as "Refused:" / "Conflict:".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ApiError } from '../../../api/apiFetch';
import type { Bundle } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const layers = (loop: Record<string, unknown>) => [
  { kind: 'FACTORY', ref: null, ordinal: 0, content: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.9 }, content_hash: 'f' },
  { kind: 'PROFILE', ref: 'FLOW_FAST_SELF_REG', ordinal: 2, content: { 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 3 }, content_hash: 'p' },
  { kind: 'LOOP', ref: 'FIC10302', ordinal: 3, content: loop, content_hash: 'l' },
];
const bundle = (over: Partial<Bundle> = {}, loop: Record<string, unknown> = { 'G4.activity_warn_ratio': 4.5 }): Bundle => ({
  bundleId: 'v6', version: 6, contentHash: 'f9153b00aaf3ba1a', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, parentHash: null, catalogueHash: 'c', executionPlanHash: 'e',
  changeClass: 'POLICY', state: 'ACTIVE_VERIFIED', layers: layers(loop),
  resolved: { properties: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 3, ...loop }, sources: {}, execution_plan: {} },
  validation: { errors: [], warnings: [], notReadByBuild: { 'G0.mode': 'x' }, changeClass: 'POLICY' }, shadow: null, effectiveFrom: null,
  createdBy: 'e2e', createdAt: 't', updatedAt: 't', etag: 'W/"1"', note: null, approvals: [], ...over,
} as unknown as Bundle);
const idle = { enabled: false, reason: null, busy: false, error: null, onValidate: () => {} };

describe('DiffImpactPanel', () => {
  it('a version without a parent is compared with the layers below it; the setting in words, its code in the title', () => {
    render(<DiffImpactPanel bundle={bundle()} parent={undefined} validate={idle} />);
    const t = screen.getByRole('table');
    expect(within(t).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Setting', 'Now', 'New']);
    const rows = within(t).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/3.*4\.5/);
    expect(rows[0].textContent).not.toMatch(/G4\.activity_warn_ratio/);
    expect(within(t).getByTitle('G4.activity_warn_ratio')).toBeTruthy();
    expect(screen.getByText('Loops').nextSibling?.textContent).toBe('1');
  });

  it('an empty draft changes nothing and is not checked yet', () => {
    render(<DiffImpactPanel bundle={bundle({ state: 'DRAFT', validation: null }, {})} parent={undefined} validate={idle} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Not checked yet')).toBeTruthy();
  });

  it('a version with a parent is compared with that parent', () => {
    const parent = bundle({ bundleId: 'v5', version: 5 }, { 'G4.activity_warn_ratio': 5 });
    render(<DiffImpactPanel bundle={bundle()} parent={parent} validate={idle} />);
    expect(within(screen.getByRole('table')).getAllByRole('row')[1].textContent).toMatch(/5.*4\.5/);
  });

  it('a type version started from the plant version: Now and New both the engine way, so only the real edit is listed', () => {
    // what the server stores: the plant's layers and the edit, no copy of the pack - its own resolution never saw the pack
    const typeLayers = [
      { kind: 'FACTORY', ref: null, ordinal: 0, content: { 'G0.coverage_min': 0.9, 'G4.activity_warn_ratio': 2 }, content_hash: 'f' },
      { kind: 'SITE', ref: 'hdpe', ordinal: 1, content: {}, content_hash: 's' },
      { kind: 'PROFILE', ref: 'FLOW_FAST_SELF_REG', ordinal: 2, content: { 'G4.activity_warn_ratio': 4.5 }, content_hash: 'p' },
    ];
    const b = bundle({
      bundleId: 't1', scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG', parentBundleId: 'p1', layers: typeLayers as Bundle['layers'],
      resolved: { properties: { 'G0.coverage_min': 0.9, 'G4.activity_warn_ratio': 4.5 }, sources: {}, execution_plan: {} },
      below: { 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 3 },
      effective: { 'G0.coverage_min': 0.95, 'G4.activity_warn_ratio': 4.5 },
    });
    const plant = bundle({ bundleId: 'p1', scopeKind: 'SITE', scopeRef: null }, {});
    render(<DiffImpactPanel bundle={b} parent={plant} validate={idle} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);                                     // the pack value the loops already run is not a change
    expect(rows[0].textContent).toMatch(/3.*4\.5/);                   // Now = the pack value, not the factory 2
  });

  it('a version with an earlier version of its own level compares the two the engine way', () => {
    const parent = bundle({ bundleId: 'v5', version: 5, effective: { 'G4.activity_warn_ratio': 5 } }, { 'G4.activity_warn_ratio': 9 });
    render(<DiffImpactPanel bundle={bundle({ effective: { 'G4.activity_warn_ratio': 4.5 } })} parent={parent} validate={idle} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/5.*4\.5/);
  });

  it('without the engine pair (an older server) both columns come from the own resolution', () => {
    render(<DiffImpactPanel bundle={bundle({ effective: { 'G4.activity_warn_ratio': 1 } })} parent={undefined} validate={idle} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/3.*4\.5/);                   // the layers below (PROFILE 3) against resolved, never one of each
  });

  it('between an edit and its re-read (below kept, effective dropped) it waits instead of mixing the two ways', () => {
    render(<DiffImpactPanel bundle={bundle({ below: { 'G0.mode': 'OPERATIONAL', 'G0.coverage_min': 0.5, 'G4.activity_warn_ratio': 1 } })} parent={undefined} validate={idle} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('waits for the earlier version it names instead of comparing with something else', () => {
    render(<DiffImpactPanel bundle={bundle({ parentBundleId: 'v5', below: {}, effective: {} })} parent={undefined} parentPending validate={idle} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Nothing changed yet.')).toBeNull();
  });

  it('a plant or type version shows the loop count it was given', () => {
    render(<DiffImpactPanel bundle={bundle({ scopeKind: 'PROFILE', scopeRef: 'FLOW_FAST_SELF_REG' })} parent={undefined} loopCount={7} validate={idle} />);
    expect(screen.getByText('Loops').nextSibling?.textContent).toBe('7');
  });

  it('says ✓ Valid, then Check (the step word, never Validate) with its reason, busy word and the server refusal', () => {
    const onValidate = vi.fn();
    const { rerender } = render(<DiffImpactPanel bundle={bundle()} parent={undefined} validate={{ ...idle, reason: 'Already checked; edit the change to check it again.' }} />);
    expect(screen.getByText('✓ Valid')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/build|read by no running job|Validat/);
    expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Already checked; edit the change to check it again.')).toBeTruthy();
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} validate={{ ...idle, enabled: true, onValidate }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(onValidate).toHaveBeenCalledTimes(1);
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} validate={{ ...idle, enabled: true, busy: true, onValidate }} />);
    expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} validate={{ ...idle, enabled: true, error: new ApiError(409, 'the bundle changed') }} />);
    expect(screen.getByRole('alert').textContent).toBe('Conflict: the bundle changed');
  });

  it('a rejected validation lists its errors and warnings', () => {
    render(<DiffImpactPanel bundle={bundle({ state: 'REJECTED', validation: { errors: ["'G4.activity_warn_ratio' above the maximum"], warnings: ['w1'], notReadByBuild: {}, changeClass: 'POLICY' } })}
      parent={undefined} validate={idle} />);
    expect(screen.getByText('1 error')).toBeTruthy();
    expect(screen.getByText(/above the maximum/)).toBeTruthy();
    expect(screen.getByText('w1')).toBeTruthy();
  });
});

describe('DiffImpactPanel leaves out settings the person did not change (retest issue 3)', () => {
  it('drops non-editable properties and names a duplicated name with its gate, values in words', () => {
    const b = bundle({}, { 'G4.activity_warn_ratio': 4.5 });
    const parent = bundle({ bundleId: 'p', version: 5 }, { 'G4.activity_warn_ratio': 3 });
    (b.resolved.properties as Record<string, unknown>)['G7.role'] = 'SUPPORTING';
    (b.resolved.properties as Record<string, unknown>)['G10.role'] = 'SUPPORTING';
    (parent.resolved.properties as Record<string, unknown>)['G7.role'] = 'PRIMARY';
    (parent.resolved.properties as Record<string, unknown>)['G10.role'] = 'PRIMARY';
    const entries = [{ property: 'G7.role', editable: false }, { property: 'G10.role', editable: false }, { property: 'G4.activity_warn_ratio', editable: true }] as never;
    const { rerender } = render(<DiffImpactPanel bundle={b} parent={parent} entries={entries} validate={idle} />);
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(1);
    expect(screen.queryByText(/Role/)).toBeNull();
    rerender(<DiffImpactPanel bundle={b} parent={parent} entries={[{ property: 'G7.role', editable: true }, { property: 'G10.role', editable: true }] as never} validate={idle} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map(r => r.querySelector('td')?.textContent).filter(t => t?.startsWith('Role · '))).toHaveLength(2);
    expect(rows.some(r => /Primary.*Supporting/.test(r.textContent ?? ''))).toBe(true);
    expect(document.body.textContent).not.toMatch(/PRIMARY|SUPPORTING/);
  });
});
