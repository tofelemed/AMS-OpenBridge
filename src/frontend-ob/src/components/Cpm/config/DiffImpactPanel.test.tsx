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
