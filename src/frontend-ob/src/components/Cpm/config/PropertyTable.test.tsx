// 2026-09-17 audit F18: the properties of a gate are a table (name · effective · from · class · flags),
// one row expanded at a time into the editor - not a wall of every property fully expanded.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertyTable } from './PropertyTable';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const entry = (over: Partial<CatalogueEntry> & { property: string }): CatalogueEntry => ({
  id: 'CFG-001', gate: 'G0', type: 'number', unit: 's', effect: 'what it does', default: 10, validation: { minimum: 0 }, dependencies: [], consumers: ['flink:short'],
  changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null, ...over,
} as CatalogueEntry);
const bundle = {
  bundleId: 'b1', version: 2, contentHash: 'h', site: 'hdpe', scopeKind: 'LOOP', scopeRef: 'FIC10302', parentBundleId: null, parentHash: null, catalogueHash: 'c', executionPlanHash: 'e',
  changeClass: 'POLICY', state: 'DRAFT', layers: [{ kind: 'FACTORY', content: { 'G0.min_samples': 10, 'G0.max_gap_s': 30 } }, { kind: 'LOOP', content: { 'G0.max_gap_s': 45 } }],
  resolved: { properties: { 'G0.min_samples': 10, 'G0.max_gap_s': 45, 'G0.evidence_retention_days': null }, sources: { 'G0.min_samples': 'FACTORY', 'G0.max_gap_s': 'LOOP' } },
  validation: { errors: ["'G0.max_gap_s' above the maximum"], warnings: [] }, shadow: null, effectiveFrom: null, createdBy: 'me', createdAt: 't', updatedAt: 't', etag: 'W/"1"', note: null,
} as unknown as Bundle;
const entries = [
  entry({ property: 'G0.min_samples', type: 'integer', unit: 'sample' }),
  entry({ property: 'G0.max_gap_s', changeClass: 'STATE_BOUNDARY' }),
  entry({ property: 'G0.evidence_retention_days', type: 'integer', unit: 'day', default: null, commissioningRequired: true, notReadByBuild: 'RETENTION_IN_API' }),
];

describe('PropertyTable', () => {
  it('one row per property with its effective value, source layer, class and flags; the editor opens for one row at a time', () => {
    render(<PropertyTable entries={entries} bundle={bundle} editable pending={false} onOp={() => {}} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/G0\.min_samples/);
    expect(rows[0].textContent).toMatch(/10/);
    expect(rows[0].textContent).toMatch(/FACTORY/);
    expect(rows[1].textContent).toMatch(/45/);
    expect(rows[1].textContent).toMatch(/LOOP/);
    expect(rows[1].textContent).toMatch(/STATE_BOUNDARY/);
    expect(rows[1].getAttribute('data-invalid')).toBe('true');
    expect(rows[2].textContent).toMatch(/commissioning/);
    expect(rows[2].textContent).toMatch(/unread by build/);
    expect(screen.queryAllByTestId('property-form')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /G0\.max_gap_s/ }));
    expect(screen.getAllByTestId('property-form')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /G0\.max_gap_s/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/above the maximum/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /G0\.min_samples/ }));
    const forms = screen.getAllByTestId('property-form');
    expect(forms).toHaveLength(1);
    expect(forms[0].getAttribute('data-property')).toBe('G0.min_samples');
  });
});
