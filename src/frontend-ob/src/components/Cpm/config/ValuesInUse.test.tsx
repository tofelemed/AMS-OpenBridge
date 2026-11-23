// CHG-224 (owner decisions D1-D6, 23 Nov 2026): Values in use lists only what Gate Configuration can change - the loop page from the
// server's entries (EDITABLE and DECISION), a type or plant page from the catalogue's `editable` flag - and says where each value
// comes from in plain words; a decision reads "Not decided", a worked-out value says so with its basis on hover.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ValuesInUse } from './ValuesInUse';
import type { CatalogueEntry, EffectiveConfig, EffectiveEntry } from '../../../api/cpm/config';

afterEach(cleanup);

const entry = (property: string, over: Partial<EffectiveEntry> = {}): EffectiveEntry => ({
  property, gate: property.split('.')[0], kind: 'EDITABLE', editable: true, value: 1, configured: 1, level: 'FACTORY', setIn: 'GATE_CONFIGURATION',
  registryField: null, basis: null, unit: null, ...over,
});
const entries: EffectiveEntry[] = [
  entry('G12.step_min_input_eu', { value: 2, configured: 1, level: 'FACTORY', unit: 'm3/h' }),
  entry('G12.noise_multiplier', { value: 4, configured: 4, level: 'LOOP' }),
  entry('G12.settle_band_eu', { value: 2, configured: null, level: null, basis: '2.0 - 1 % of the PV range' }),
  entry('G12.lambda_s', { kind: 'DECISION', value: null, configured: null, level: null, basis: 'Not decided - advice uses the dead time (3.97 s)' }),
  entry('G12.retention_days', { kind: 'RETENTION', editable: false, setIn: 'EVIDENCE_RETENTION', value: 30, configured: null, level: null }),
  entry('G12.objective_type', { kind: 'REGISTRY', editable: false, setIn: 'LOOP_REGISTRY', registryField: 'model.objectiveType', value: 'TIGHT', configured: null, level: null, basis: 'Tight, from the loop type - set in Loop Registry' }),
  entry('G12.fixed_rule', { kind: 'AUTOMATIC_FIXED', editable: false, setIn: 'AUTOMATIC', value: 3, configured: null, level: null }),
  entry('G12.derived_value', { kind: 'AUTOMATIC_DERIVED', editable: false, setIn: 'AUTOMATIC', value: 7, configured: null, level: null }),
  entry('G12.not_applied', { kind: 'NOT_APPLIED', editable: false, setIn: 'NOT_APPLIED', value: null, configured: null, level: null }),
];
const eff = (over: Partial<EffectiveConfig> = {}) => ({
  properties: Object.fromEntries(entries.map(e => [e.property, e.value])), sources: {}, entries, workers: [], bundle: null, ...over,
}) as unknown as EffectiveConfig;
const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('ValuesInUse on a loop page (entries)', () => {
  it('lists only the editable properties: no retention, registry, fixed, derived or unapplied value', () => {
    render(<ValuesInUse eff={eff()} gate="G12" onGate={() => {}} />);
    const names = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent);
    expect(names).toEqual(['Step minimum input eu', 'Noise multiplier', 'Settle band eu', 'Lambda (s)']);
  });

  it('the value in use carries its unit; the level reads in plain words', () => {
    render(<ValuesInUse eff={eff()} gate="G12" onGate={() => {}} />);
    expect(within(rowOf('Step minimum input eu')).getByText('2 m3/h')).toBeTruthy();
    expect(within(rowOf('Step minimum input eu')).getByText('Factory')).toBeTruthy();
    expect(within(rowOf('Noise multiplier')).getByText('This loop')).toBeTruthy();
  });

  it('a decision reads "Not decided" with the basis words, and its From says it needs a decision', () => {
    render(<ValuesInUse eff={eff()} gate="G12" onGate={() => {}} />);
    const row = rowOf('Lambda (s)');
    expect(within(row).getByText('Not decided — advice uses the dead time (3.97 s)')).toBeTruthy();
    expect(within(row).getByText('Needs a decision')).toBeTruthy();
  });

  it('a decision reads "Not decided — 3.97 s used" first, then the basis', () => {
    const e = [entry('G10.limit_dwell_warn_s', { kind: 'DECISION', value: 3.97, configured: null, level: null, basis: 'Not decided - 3.97 s used (30 samples at 0.13 s)' })];
    render(<ValuesInUse eff={eff({ entries: e, properties: { 'G10.limit_dwell_warn_s': 3.97 } })} gate="G10" onGate={() => {}} />);
    expect(screen.getByText(/^Not decided — 3\.97 s used/)).toBeTruthy();
  });

  it('a worked-out value says so, with its basis on hover and not as a paragraph', () => {
    render(<ValuesInUse eff={eff()} gate="G12" onGate={() => {}} />);
    const from = within(rowOf('Settle band eu')).getByText('Worked out automatically');
    expect(from.closest('td')?.getAttribute('title')).toBe('2.0 - 1 % of the PV range');
    expect(document.body.textContent).not.toContain('1 % of the PV range');
  });

  it('never says No value, unset, Not set, NO_VALUE or FACTORY', () => {
    render(<ValuesInUse eff={eff()} gate="G12" onGate={() => {}} />);
    expect(document.body.textContent).not.toMatch(/No value|unset|Not set|NO_VALUE|FACTORY|not read by/);
  });

  it('a gate with no editable property is not offered', () => {
    render(<ValuesInUse eff={eff({ entries: [...entries, entry('G99.rule', { kind: 'AUTOMATIC_FIXED', editable: false })] })} gate="G12" onGate={() => {}} />);
    expect(within(screen.getByLabelText('Gate')).queryByText(/G99/)).toBeNull();
    expect(within(screen.getByLabelText('Gate')).getAllByRole('option')).toHaveLength(1);
  });
});

describe('ValuesInUse where parts run another version', () => {
  const worker = (runs: unknown) => ({ jobName: 'j', jarSha256: 'x', catalogueHash: 'c', required: true, runs });
  const bundle = { bundleId: 'b8', version: 8, contentHash: 'h', scopeKind: 'LOOP', scopeRef: 'FIC1', changeClass: 'POLICY', effectiveFrom: null, catalogueHash: 'c' };
  it('shows one plain line, never the word workers', () => {
    const workers = [worker({ bundleId: 'b8', version: 8, scopeKind: 'LOOP' }), worker({ bundleId: 'b7', version: 7, scopeKind: 'LOOP' })];
    render(<ValuesInUse eff={eff({ bundle, workers } as never)} gate="G12" onGate={() => {}} />);
    const line = screen.getByText(/^Some parts run another version: /);
    expect(line.textContent).toContain('v7');
    expect(document.body.textContent).not.toMatch(/worker/i);
  });
  it('shows nothing when every part runs the version of the page', () => {
    render(<ValuesInUse eff={eff({ bundle, workers: [worker({ bundleId: 'b8', version: 8, scopeKind: 'LOOP' })] } as never)} gate="G12" onGate={() => {}} />);
    expect(screen.queryByText(/another version/)).toBeNull();
  });
});

describe('ValuesInUse on a type or plant page (no entries)', () => {
  const cat = (property: string, editable: boolean): [string, CatalogueEntry] =>
    [property, { property, gate: property.split('.')[0], editable, kind: editable ? 'EDITABLE' : 'REGISTRY' } as CatalogueEntry];
  it('lists only the editable catalogue properties, from the resolved values', () => {
    const catalogue = new Map([cat('G4.min_samples', true), cat('G4.objective_type', false)]);
    render(<ValuesInUse eff={{ properties: { 'G4.min_samples': 30, 'G4.objective_type': 'TIGHT' }, sources: { 'G4.min_samples': 'PROFILE', 'G4.objective_type': 'FACTORY' } }}
      catalogue={catalogue} gate="G4" onGate={() => {}} />);
    expect(screen.getByText('Minimum samples')).toBeTruthy();
    expect(screen.queryByText('Objective type')).toBeNull();
    expect(within(rowOf('Minimum samples')).getByText('Loop type')).toBeTruthy();
  });
});
