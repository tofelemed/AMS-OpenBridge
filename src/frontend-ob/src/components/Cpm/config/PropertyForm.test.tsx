// v2.5 Task 3D.1 (spec §5.7): the property editor sends typed requested changes and refuses an
// obviously wrong value by name - a fraction is not a percent, an array is replaced whole, a reset
// removes only this scope's override, a property no job reads is read-only with the build's reason.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PropertyForm, inheritedValue } from './PropertyForm';
import type { CatalogueEntry, ConfigLayer, PatchOp } from '../../../api/cpm/config';

vi.mock('@oicl/openbridge-webcomponents-react/components/button/button', () => ({
  ObcButton: (p: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) => React.createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}));
afterEach(cleanup);

const entry = (over: Partial<CatalogueEntry>): CatalogueEntry => ({
  id: 'CFG-041', gate: 'G3', property: 'G3.error_band_span_fraction', type: 'number', unit: 'fraction', default: 0.005, commissioningRequired: false,
  validation: { minimum: 0, maximum: 1 }, changeClass: 'POLICY', consumers: ['flink:short'], dependencies: [], effect: 'Half-width of the acceptable error band as a fraction of the PV span.', notReadByBuild: null, ...over,
});

const layers: ConfigLayer[] = [
  { kind: 'FACTORY', ref: null, ordinal: 0, content: { 'G3.error_band_span_fraction': 0.005, 'G13.peer_binding_ids': ['a'] }, content_hash: 'f' },
  { kind: 'SITE', ref: 'MARUN', ordinal: 1, content: {}, content_hash: 's' },
  { kind: 'PROFILE', ref: 'FLOW_FAST_SELF_REG', ordinal: 2, content: { 'G3.error_band_span_fraction': 0.01 }, content_hash: 'p' },
  { kind: 'LOOP', ref: null, ordinal: 3, content: { 'G3.error_band_span_fraction': 0.02 }, content_hash: 'l' },
];

describe('PropertyForm', () => {
  it('refuses a percent for a fraction unit and accepts the fraction as a typed set op', () => {
    const ops: PatchOp[] = [];
    render(<PropertyForm entry={entry({})} layers={layers} scopeKind="LOOP" effective={0.02} source="LOOP" errors={[]} editable pending={false} onOp={op => ops.push(op)} />);
    const input = screen.getByLabelText('G3.error_band_span_fraction value') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.click(screen.getByText('Set'));
    expect(screen.getByTestId('input-error').textContent).toMatch(/fraction, not a percent/);
    expect(ops).toHaveLength(0);

    fireEvent.change(input, { target: { value: '0.5' } });
    fireEvent.click(screen.getByText('Set'));
    expect(ops).toEqual([{ op: 'set', property: 'G3.error_band_span_fraction', value: 0.5 }]);
  });

  it('replaces an array whole, and reset removes only this scope override', () => {
    const ops: PatchOp[] = [];
    const arr = entry({ id: 'CFG-140', property: 'G13.peer_binding_ids', type: 'string_array', unit: 'ids', default: null, commissioningRequired: true, validation: { minItems: 0, maxItems: 12 } });
    render(<PropertyForm entry={arr} layers={[...layers.slice(0, 3), { kind: 'LOOP', ref: null, ordinal: 3, content: { 'G13.peer_binding_ids': ['x'] }, content_hash: 'l' }]}
      scopeKind="LOOP" effective={['x']} source="LOOP" errors={[]} editable pending={false} onOp={op => ops.push(op)} />);
    fireEvent.change(screen.getByLabelText('G13.peer_binding_ids value'), { target: { value: 'FIC-2, PIC-7' } });
    fireEvent.click(screen.getByText('Set'));
    fireEvent.click(screen.getByText('Reset to inherited'));
    expect(ops).toEqual([
      { op: 'set', property: 'G13.peer_binding_ids', value: ['FIC-2', 'PIC-7'] },
      { op: 'reset', property: 'G13.peer_binding_ids' },
    ]);
  });

  it('shows the inherited value from the layer below, commissioning required, and locks an unread property with the reason', () => {
    expect(inheritedValue(layers, 'LOOP', 'G3.error_band_span_fraction')).toEqual({ value: 0.01, from: 'PROFILE' });
    expect(inheritedValue(layers, 'PROFILE', 'G3.error_band_span_fraction')).toEqual({ value: 0.005, from: 'FACTORY' });
    render(<PropertyForm entry={entry({ property: 'G0.mode', type: 'enum', unit: 'state', validation: ['OPERATIONAL', 'OBSERVE_ONLY'], notReadByBuild: 'DIAGNOSTIC_MODE_NOT_GOVERNED_IN_BUILD', default: null, commissioningRequired: true })}
      layers={layers} scopeKind="LOOP" effective={null} source={undefined} errors={[]} editable pending={false} onOp={() => {}} />);
    expect(screen.getByText('Commissioning required')).toBeTruthy();
    expect(screen.getByTestId('locked-reason').textContent).toMatch(/DIAGNOSTIC_MODE_NOT_GOVERNED_IN_BUILD/);
    expect(screen.queryByText('Set')).toBeNull();
  });
});
