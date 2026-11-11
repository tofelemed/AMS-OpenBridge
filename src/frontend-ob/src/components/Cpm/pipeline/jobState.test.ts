// CHG-170 (owner answer 1): a job's state in words with tone and glyph - RUNNING ✓ Running, MISSING ✕ Missing, the transitional
// states ◐ Starting in amber (not red); the role as a word; one list grouped Alarm · CPLM · Platform in the supervisor's order,
// then the jobs not on the required list.
import { describe, expect, it } from 'vitest';
import { groupRows, jobLabel, roleWord, stateView } from './jobState';
import type { JobRow } from './mergeJobs';

const row = (name: string, role: JobRow['role'], required = true): JobRow => ({
  name, role, state: 'RUNNING', running: true, required, jid: null, startTime: null, uptimeSec: null, checkpoint: null,
});

describe('stateView', () => {
  it('says Running, Missing and Starting with their glyphs and tones', () => {
    expect(stateView('RUNNING')).toEqual({ tone: 'good', glyph: '✓', word: 'Running' });
    expect(stateView('MISSING')).toEqual({ tone: 'bad', glyph: '✕', word: 'Missing' });
    for (const s of ['RESTARTING', 'INITIALIZING', 'CREATED', 'RECONCILING']) {
      expect(stateView(s)).toEqual({ tone: 'warn', glyph: '◐', word: 'Starting' });
    }
  });

  it('words the stopped states instead of showing the engine code', () => {
    expect(stateView('FAILED').word).toBe('Failed');
    expect(stateView('CANCELED').word).toBe('Cancelled');
    expect(stateView('CANCELLING').word).toBe('Cancelling');
    expect(stateView('FINISHED').word).toBe('Finished');
    expect(stateView('SUSPENDED').word).toBe('Suspended');
    expect(stateView('SOME_NEW_STATE')).toEqual({ tone: 'bad', glyph: '✕', word: 'Some new state' });
  });
});

describe('roleWord and jobLabel', () => {
  it('reads the roles as words and drops the shared AMS prefix', () => {
    expect(roleWord('alarm')).toBe('Alarm');
    expect(roleWord('cplm')).toBe('CPLM');
    expect(roleWord('platform')).toBe('Platform');
    expect(roleWord(null)).toBe('Not on the required list');
    expect(jobLabel('AMS - CPLM Gate Fusion Engine')).toBe('CPLM Gate Fusion Engine');
    expect(jobLabel('AMS Alarm State Export Engine')).toBe('Alarm State Export Engine');
  });
});

describe('groupRows', () => {
  it('groups Alarm, CPLM, Platform in the supervisor order and the jobs off the list last', () => {
    const rows = [
      row('AMS - B alarm', 'alarm'), row('AMS - A alarm', 'alarm'), row('AMS - Z cplm', 'cplm'), row('AMS - Y cplm', 'cplm'),
      row('AMS - P', 'platform'), row('AMS - Extra', null, false),
    ];
    const groups = groupRows(rows);
    expect(groups.map(g => g.title)).toEqual(['Alarm', 'CPLM', 'Platform', 'Not on the required list']);
    expect(groups[0].rows.map(r => r.name)).toEqual(['AMS - B alarm', 'AMS - A alarm']);
    expect(groups[1].rows.map(r => r.name)).toEqual(['AMS - Z cplm', 'AMS - Y cplm']);
  });

  it('leaves out a group with no job', () => {
    expect(groupRows([row('AMS - Y cplm', 'cplm')]).map(g => g.title)).toEqual(['CPLM']);
  });
});
