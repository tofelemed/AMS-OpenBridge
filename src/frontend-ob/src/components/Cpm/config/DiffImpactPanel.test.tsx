// CHG-169 (owner answer 2d): Diff & impact of a version without a parent compares it with the layers BELOW it (the values the
// loop would run without this level), no longer with the factory layer alone: v6 sets one value and reads "1 property differs",
// an empty draft reads 0. A version with a parent is still compared with that parent. Validate sits under the validation it
// produces, with its reason when disabled and the server's refusal as "Refused:" / "Conflict:".
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DiffImpactPanel } from './DiffImpactPanel';
import { ApiError } from '../../../api/apiFetch';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';

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
const catalogue = new Map<string, CatalogueEntry>([['G4.activity_warn_ratio', { changeClass: 'POLICY' } as CatalogueEntry]]);
const idle = { enabled: false, reason: null, busy: false, error: null, onValidate: () => {} };

describe('DiffImpactPanel', () => {
  it('a version without a parent is compared with the layers below it, not the factory layer alone', () => {
    render(<DiffImpactPanel bundle={bundle()} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={idle} />);
    expect(screen.getByRole('heading', { name: '1 property differs from the layers below' })).toBeTruthy();
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/G4\.activity_warn_ratio.*3.*4\.5.*Policy/);
    expect(screen.getByText('1 loop (FIC10302)')).toBeTruthy();
  });

  it('an empty draft differs in nothing', () => {
    render(<DiffImpactPanel bundle={bundle({ state: 'DRAFT', validation: null }, {})} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={idle} />);
    expect(screen.getByRole('heading', { name: '0 properties differ from the layers below' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Not validated yet.')).toBeTruthy();
  });

  it('a version with a parent is compared with that parent', () => {
    const parent = bundle({ bundleId: 'v5', version: 5 }, { 'G4.activity_warn_ratio': 5 });
    render(<DiffImpactPanel bundle={bundle()} parent={parent} catalogue={catalogue} siteLoopCount={undefined} validate={idle} />);
    expect(screen.getByRole('heading', { name: '1 property differs from v5' })).toBeTruthy();
    expect(within(screen.getByRole('table')).getAllByRole('row')[1].textContent).toMatch(/5.*4\.5/);
  });

  it('shows the validation it holds, then Validate with its reason, busy word and the server refusal', () => {
    const onValidate = vi.fn();
    const { rerender } = render(<DiffImpactPanel bundle={bundle()} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={{ ...idle, reason: 'Already validated; edit the draft to validate again.' }} />);
    expect(screen.getByText(/No errors\./)).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getByText(/1 property in this bundle are read by no running job/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Validate' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Already validated; edit the draft to validate again.')).toBeTruthy();
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={{ ...idle, enabled: true, onValidate }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }));
    expect(onValidate).toHaveBeenCalledTimes(1);
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={{ ...idle, enabled: true, busy: true, onValidate }} />);
    expect((screen.getByRole('button', { name: 'Validating…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<DiffImpactPanel bundle={bundle({ state: 'DRAFT' })} parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={{ ...idle, enabled: true, error: new ApiError(409, 'the bundle changed') }} />);
    expect(screen.getByRole('alert').textContent).toBe('Conflict: the bundle changed');
  });

  it('a rejected validation lists its errors', () => {
    render(<DiffImpactPanel bundle={bundle({ state: 'REJECTED', validation: { errors: ["'G4.activity_warn_ratio' above the maximum"], warnings: ['w1'], notReadByBuild: {}, changeClass: 'POLICY' } })}
      parent={undefined} catalogue={catalogue} siteLoopCount={undefined} validate={idle} />);
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.getByText('1 error(s)')).toBeTruthy();
    expect(screen.getByText(/above the maximum/)).toBeTruthy();
    expect(screen.getByText('w1')).toBeTruthy();
  });
});
