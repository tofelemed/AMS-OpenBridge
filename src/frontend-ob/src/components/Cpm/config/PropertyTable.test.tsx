// 2026-09-17 audit F18: the properties of a gate are a table (name · effective · from · class · flags), not a wall of every
// property fully expanded. CHG-169 (owner review): the row no longer expands into the editor - choosing it selects the property,
// whose editor is the panel beside the list; the class reads in words under the name, the value carries its unit.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PropertyTable } from './PropertyTable';
import { PropertiesTab } from './PropertiesTab';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';

afterEach(cleanup);

const entry = (over: Partial<CatalogueEntry> & { property: string }): CatalogueEntry => ({
  id: 'CFG-001', gate: 'G0', type: 'number', unit: 's', effect: 'what it does', default: 10, validation: { minimum: 0 }, dependencies: [], consumers: ['flink:short'],
  changeClass: 'POLICY', commissioningRequired: false, notReadByBuild: null, kind: 'EDITABLE', editable: true, setIn: 'GATE_CONFIGURATION', registryField: null, ...over,
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
  entry({ property: 'G0.evidence_retention_days', type: 'integer', unit: 'day', default: null, commissioningRequired: true }),
];

describe('PropertyTable', () => {
  it('one row per property with its value, unit, source layer, class word and flags; a row selects its property', () => {
    const onSelect = vi.fn();
    render(<PropertyTable entries={entries} bundle={bundle} selected="G0.min_samples" onSelect={onSelect} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Setting', 'Value · from', 'Flags']);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toMatch(/^Minimum samplesPolicy10 samplesFactory$/);
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows[1].textContent).toMatch(/Maximum gap \(s\).*◆ State boundary.*45 s.*This loop.*invalid/);
    expect(rows[1].getAttribute('data-invalid')).toBe('true');
    expect(rows[2].textContent).toMatch(/—.*Worked out automatically.*commissioning/);
    expect(document.body.textContent).not.toMatch(/No value|unset|not used|FACTORY/);
    expect(screen.getByRole('table').getAttribute('aria-label')).toBe('Settings');
    expect(screen.queryAllByTestId('property-form')).toHaveLength(0);              // the editor is the panel, not an expanding row
    fireEvent.click(screen.getByRole('button', { name: /Maximum gap/ }));
    expect(onSelect).toHaveBeenCalledWith('G0.max_gap_s');
  });

  it('the name is in words, the code only in the title, also while searching across gates', () => {
    render(<PropertyTable entries={entries.slice(0, 1)} bundle={bundle} selected={null} onSelect={() => {}} />);
    const b = screen.getByRole('button', { name: 'Minimum samples' });
    expect(b.getAttribute('title')).toBe('G0.min_samples');
    expect(document.body.textContent).not.toMatch(/G0\.min_samples/);
  });

  // CHG-169 review: a flex <td> stops being a table cell, so the Flags column lost the row's height, highlight and line
  it('keeps every cell a table cell: the flags flex inside a wrapper, not on the cell', () => {
    render(<PropertyTable entries={entries} bundle={bundle} selected={null} onSelect={() => {}} />);
    for (const td of Array.from(document.querySelectorAll('tbody td'))) expect(td.classList.contains('cpm-config-table__flags')).toBe(false);
    expect(document.querySelectorAll('tbody td > .cpm-config-table__flags').length).toBe(entries.length);
  });

  // CHG-224: the Edit step lists only what Gate Configuration can change
  it('the Edit step lists and offers only the editable properties', () => {
    const mixed = [...entries, entry({ property: 'G0.objective_type', kind: 'REGISTRY', editable: false, setIn: 'LOOP_REGISTRY', registryField: 'model.objectiveType' }),
      entry({ property: 'G12.derived', gate: 'G12', kind: 'AUTOMATIC_DERIVED', editable: false, setIn: 'AUTOMATIC' })];
    render(<PropertiesTab bundle={bundle} entries={mixed} gate="G0" onGate={() => {}} editable pending={false} onOp={() => {}} />);
    const names = screen.getAllByRole('row').slice(1).map(r => r.querySelector('button')?.textContent);
    expect(names).toEqual(['Minimum samples', 'Maximum gap (s)', 'Evidence retention days']);
    expect(screen.queryByText('Objective type')).toBeNull();
    expect(within(screen.getByLabelText('Gate')).queryByText(/G12/)).toBeNull();
    expect(screen.getAllByLabelText('Settings')).toHaveLength(2);   // the list and its table
  });
});
