// 2026-09-17 audit F18: the properties of a gate are a table (name · effective · from · class · flags), not a wall of every
// property fully expanded. CHG-169 (owner review): the row no longer expands into the editor - choosing it selects the property,
// whose editor is the panel beside the list; the class reads in words under the name, the value carries its unit.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertyTable } from './PropertyTable';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';

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
  it('one row per property with its value, unit, source layer, class word and flags; a row selects its property', () => {
    const onSelect = vi.fn();
    render(<PropertyTable entries={entries} bundle={bundle} selected="G0.min_samples" fullKeys={false} onSelect={onSelect} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Property', 'Value · from', 'Flags']);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/^min_samplesPolicy10 samplesfrom FACTORY$/);
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows[1].textContent).toMatch(/max_gap_s.*◆ State boundary.*45 s.*from LOOP.*invalid/);
    expect(rows[1].getAttribute('data-invalid')).toBe('true');
    expect(rows[2].textContent).toMatch(/No value.*unset - no layer sets it.*commissioning.*unread by build/);
    expect(screen.queryAllByTestId('property-form')).toHaveLength(0);              // the editor is the panel, not an expanding row
    fireEvent.click(screen.getByRole('button', { name: /max_gap_s/ }));
    expect(onSelect).toHaveBeenCalledWith('G0.max_gap_s');
  });

  it('while searching across gates the full key is shown', () => {
    render(<PropertyTable entries={entries.slice(0, 1)} bundle={bundle} selected={null} fullKeys onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'G0.min_samples' })).toBeTruthy();
  });

  // CHG-169 review: a flex <td> stops being a table cell, so the Flags column lost the row's height, highlight and line
  it('keeps every cell a table cell: the flags flex inside a wrapper, not on the cell', () => {
    render(<PropertyTable entries={entries} bundle={bundle} selected={null} fullKeys={false} onSelect={() => {}} />);
    for (const td of Array.from(document.querySelectorAll('tbody td'))) expect(td.classList.contains('cpm-config-table__flags')).toBe(false);
    expect(document.querySelectorAll('tbody td > .cpm-config-table__flags').length).toBe(entries.length);
  });
});
