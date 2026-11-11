// v2.5 Task 2G.1 (spec v6 §6.1-6.3, R25): the wizard's classification step offers the five loop-model
// dimensions as explicit selects from the registry contract, shows the loop_type preset as a
// suggestion, says that an explicit value overrides the preset, and types the acquisition contract.
// CHG-168 (owner review): each select's first option names the preset ("preset (INTEGRATING)"); the badge says where the model
// comes from; the override rule and the acquisition hints sit behind their ?.
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
  it('offers the contract enums, names the preset in each first option and keeps the override rule behind its ?', () => {
    const onChange = vi.fn();
    render(<ClassificationStep loopType="LIC" contract={contract} form={emptyModelForm()} onChange={onChange} />);
    const dyn = screen.getByLabelText('Dynamic class') as HTMLSelectElement;
    expect(Array.from(dyn.options).map(o => o.value)).toEqual(['', 'FAST_SELF_REG', 'SLOW_SELF_REG', 'INTEGRATING', 'UNKNOWN']);
    expect(dyn.options[0].textContent).toBe('preset (INTEGRATING)');
    expect(screen.getByText('Preset from loop type')).toBeTruthy();
    expect(screen.queryByText(/preset for LIC/i)).toBeNull();
    expect(screen.queryByText(/explicit values override the preset/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Loop model' }));
    expect(screen.getByText(/explicit values override the preset/i)).toBeTruthy();
    fireEvent.change(dyn, { target: { value: 'SLOW_SELF_REG' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dynamicClass: 'SLOW_SELF_REG' }));
  });

  it('an explicit form is labelled Explicit and becomes the request model; an empty form sends no model', () => {
    const form: ModelForm = { ...emptyModelForm(), dynamicClass: 'SLOW_SELF_REG', acqMode: 'RBE', gridSeconds: '5', sourceFilterS: '', tsQuantMs: '', declaredScanS: '1' };
    render(<ClassificationStep loopType="LIC" contract={contract} form={form} onChange={() => {}} />);
    expect(screen.getByText('Explicit')).toBeTruthy();
    expect(modelOf(form)).toEqual({ serviceFamily: null, dynamicClass: 'SLOW_SELF_REG', objectiveType: null, topology: null, commandPath: null, acquisition: { mode: 'RBE', gridSeconds: 5, sourceFilterS: null, timestampQuantizationMs: null, declaredScanS: 1 } });
    expect(modelOf(emptyModelForm())).toBeNull();
    expect(modelOf({ ...emptyModelForm(), gridSeconds: 'abc' })).toBeNull();                       // an unparseable number is not a declaration
  });

  it('shows undeclared acquisition numbers as a hint, with what each means behind the ?', () => {
    render(<ClassificationStep loopType="LIC" contract={contract} form={emptyModelForm()} onChange={() => {}} />);
    expect((screen.getByLabelText('Grid (s)') as HTMLInputElement).placeholder).toBe('undeclared');
    fireEvent.click(screen.getByRole('button', { name: 'Acquisition' }));
    expect(screen.getByText(/Grid: the sample interval the source delivers\./)).toBeTruthy();
  });
});
