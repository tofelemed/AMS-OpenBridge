// CHG-201 (owner, 15 Nov 2026): the Loop Registry list and the Loop detail page say every code in plain words, the same words
// the editor offers. No internal code, no `_`, no gate code.
import { describe, expect, it } from 'vitest';
import {
  acquisitionWord, classificationNote, criticalityWord, loopTypeWord, MODEL_FIELDS, modelWord, profileWord, relationText,
} from './loopWords';

describe('loopTypeWord', () => {
  it('says the loop type as the kind of loop', () => {
    expect(['FIC', 'PIC', 'PIC_GAS', 'PIC_VAPOUR', 'LIC', 'TIC'].map(loopTypeWord))
      .toEqual(['Flow', 'Pressure', 'Gas pressure', 'Vapour pressure', 'Level', 'Temperature']);
  });

  it('keeps the existing word for a loop with no type, and Other for any other code', () => {
    expect(loopTypeWord('UNKNOWN')).toBe('Unknown type');
    expect(loopTypeWord('')).toBe('Unknown type');
    expect(loopTypeWord(null)).toBe('Unknown type');
    expect(loopTypeWord('AIC')).toBe('Other');
    expect(loopTypeWord('fic')).toBe('Flow');
  });
});

describe('modelWord', () => {
  it('says each model dimension in plain words', () => {
    expect(modelWord('commandPath', 'OP_TO_VALVE')).toBe('Control valve');
    expect(modelWord('commandPath', 'OP_TO_VFD')).toBe('Variable-speed drive');
    expect(modelWord('topology', 'SINGLE')).toBe('Single loop');
    expect(modelWord('topology', 'CASCADE_MASTER')).toBe('Cascade master (outer loop)');
    expect(modelWord('objectiveType', 'TIGHT')).toBe('Tight control');
    expect(modelWord('objectiveType', 'AVERAGING')).toBe('Averaging (smooth changes)');
    expect(modelWord('dynamicClass', 'FAST_SELF_REG')).toBe('Fast, settles on its own');
    expect(modelWord('dynamicClass', 'INTEGRATING')).toBe('Keeps rising or falling until corrected');
    expect(modelWord('serviceFamily', 'PRESSURE_GAS')).toBe('Gas pressure');
    expect(modelWord('serviceFamily', 'UNKNOWN_UNSTABLE_INVERSE_MIMO')).toBe('Other');
  });

  it('has a word for every value the registry contract offers', () => {
    const contract: Record<keyof typeof MODEL_FIELDS, string[]> = {
      serviceFamily: ['FLOW', 'PRESSURE_LIQUID', 'PRESSURE_GAS', 'PRESSURE_VAPOUR', 'LEVEL', 'TEMPERATURE', 'COMPOSITION_ANALYZER', 'PH_CONDUCTIVITY', 'SPEED_POSITION_POWER', 'CASCADE', 'SPLIT_RANGE_OVERRIDE_RATIO', 'UNKNOWN_UNSTABLE_INVERSE_MIMO'],
      dynamicClass: ['FAST_SELF_REG', 'SLOW_SELF_REG', 'INTEGRATING', 'INTEGRATING_LAG', 'UNDERDAMPED', 'UNKNOWN'],
      objectiveType: ['TIGHT', 'AVERAGING', 'RATIO', 'CONSTRAINT', 'RAMP', 'BATCH', 'QUALITY', 'SUPERVISORY', 'UNSET'],
      topology: ['SINGLE', 'CASCADE_MASTER', 'CASCADE_SLAVE', 'SPLIT_RANGE', 'OVERRIDE', 'RATIO', 'FEEDFORWARD', 'UNKNOWN'],
      commandPath: ['OP_TO_VALVE', 'OP_TO_VFD', 'OP_TO_SLAVE_SP', 'UNKNOWN'],
    };
    for (const [dim, codes] of Object.entries(contract)) {
      for (const code of codes) {
        const word = modelWord(dim as keyof typeof MODEL_FIELDS, code);
        expect(word, `${dim} ${code}`).not.toMatch(/_|[A-Z]{3,}/);
      }
    }
  });

  it('humanises a code it does not know, and says Not set for none', () => {
    expect(modelWord('topology', 'SOME_NEW_SHAPE')).toBe('Some new shape');
    expect(modelWord('topology', null)).toBe('Not set');
  });

  it('names the fields as the page and the editor do', () => {
    expect(MODEL_FIELDS).toEqual({
      serviceFamily: 'Service', dynamicClass: 'Process behaviour', objectiveType: 'Control goal',
      topology: 'Control structure', commandPath: 'Final element',
    });
  });
});

describe('the other settings', () => {
  it('says how data arrives', () => {
    expect(acquisitionWord('PERIODIC')).toBe('At regular intervals');
    expect(acquisitionWord('RBE')).toBe('When the value changes');
    expect(acquisitionWord('SAMPLE_HOLD')).toBe('Sampled, held between samples');
    expect(acquisitionWord(undefined)).toBe('At regular intervals');
  });

  it('says where the classification came from', () => {
    expect(classificationNote('PRESET_FROM_LOOP_TYPE')).toBe('Set from the loop type. Change it in Edit loop.');
    expect(classificationNote('EXPLICIT')).toBe('Set by a person.');
    expect(classificationNote(undefined)).toBe('Set from the loop type. Change it in Edit loop.');
  });

  it('says the criticality and the assessment settings in words', () => {
    expect(['low', 'medium', 'HIGH', 'critical'].map(criticalityWord)).toEqual(['Low', 'Medium', 'High', 'Critical']);
    expect(profileWord(null)).toBe('Standard');
    expect(profileWord('default')).toBe('Standard');
    expect(profileWord(' ')).toBe('Standard');
    expect(profileWord('Reactor feeds')).toBe('Reactor feeds');
  });

  it('says each link from this loop’s side', () => {
    expect(relationText('CASCADE_PRIMARY', 'FIC10402')).toBe('Cascade master of FIC10402');
    expect(relationText('CASCADE_SECONDARY', 'FIC10402')).toBe('Cascade slave of FIC10402');
    expect(relationText('UPSTREAM_OF', 'X')).toBe('Upstream of X');
    expect(relationText('DOWNSTREAM_OF', 'X')).toBe('Downstream of X');
    expect(relationText('PEER', 'X')).toBe('Interacts with X');
    expect(relationText('SOMETHING_ELSE', 'X')).toBe('Linked to X');
  });
});
