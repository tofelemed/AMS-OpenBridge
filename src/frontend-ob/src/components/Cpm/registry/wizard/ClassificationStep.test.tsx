// v2.5 Task 2G.1 (spec v6 §6.1-6.3, R25): the wizard's classification step offers the five loop-model
// dimensions as explicit selects from the registry contract, shows the loop_type preset as a
// suggestion, says that an explicit value overrides the preset, and types the acquisition contract.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClassificationStep, emptyModelForm, modelOf, type ModelForm } from './ClassificationStep';
import type { CpmRegistryContract } from '../../../../api/cpmApi';

afterEach(cleanup);

const contract: NonNullable<CpmRegistryContract['model']> = {
  serviceFamilies: ['FLOW', 'LEVEL', 'TEMPERATURE'], dynamicClasses: ['FAST_SELF_REG', 'SLOW_SELF_REG', 'INTEGRATING', 'UNKNOWN'],
  objectiveTypes: ['TIGHT', 'AVERAGING', 'UNSET'], topologies: ['SINGLE', 'CASCADE_SLAVE', 'UNKNOWN'], commandPaths: ['OP_TO_VALVE', 'OP_TO_VFD', 'UNKNOWN'],
  acquisitionModes: ['PERIODIC', 'RBE', 'SAMPLE_HOLD'], classificationSources: ['PRESET_FROM_LOOP_TYPE', 'EXPLICIT'],
  presets: { LIC: { serviceFamily: 'LEVEL', dynamicClass: 'INTEGRATING', objectiveType: 'AVERAGING', topology: 'SINGLE', commandPath: 'OP_TO_VALVE' } },
};

describe('ClassificationStep', () => {
  it('offers the contract enums, shows the preset for the loop type and names the override rule', () => {
    const onChange = vi.fn();
    render(<ClassificationStep loopType="LIC" contract={contract} form={emptyModelForm()} onChange={onChange} />);
    const dyn = screen.getByLabelText('Dynamic class') as HTMLSelectElement;
    expect(Array.from(dyn.options).map(o => o.value)).toEqual(['', 'FAST_SELF_REG', 'SLOW_SELF_REG', 'INTEGRATING', 'UNKNOWN']);
    expect(screen.getByText(/preset for LIC/i)).toBeTruthy();
    expect(screen.getByText(/INTEGRATING · AVERAGING/)).toBeTruthy();
    expect(screen.getByText(/explicit values override the preset/i)).toBeTruthy();
    expect(screen.getByText('PRESET FROM LOOP TYPE')).toBeTruthy();
    fireEvent.change(dyn, { target: { value: 'SLOW_SELF_REG' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dynamicClass: 'SLOW_SELF_REG' }));
  });

  it('an explicit form is labelled EXPLICIT and becomes the request model; an empty form sends no model', () => {
    const form: ModelForm = { ...emptyModelForm(), dynamicClass: 'SLOW_SELF_REG', acqMode: 'RBE', gridSeconds: '5', sourceFilterS: '', tsQuantMs: '', declaredScanS: '1' };
    render(<ClassificationStep loopType="LIC" contract={contract} form={form} onChange={() => {}} />);
    expect(screen.getByText('EXPLICIT')).toBeTruthy();
    expect(modelOf(form)).toEqual({ serviceFamily: null, dynamicClass: 'SLOW_SELF_REG', objectiveType: null, topology: null, commandPath: null, acquisition: { mode: 'RBE', gridSeconds: 5, sourceFilterS: null, timestampQuantizationMs: null, declaredScanS: 1 } });
    expect(modelOf(emptyModelForm())).toBeNull();
    expect(modelOf({ ...emptyModelForm(), gridSeconds: 'abc' })).toBeNull();                       // an unparseable number is not a declaration
  });
});
