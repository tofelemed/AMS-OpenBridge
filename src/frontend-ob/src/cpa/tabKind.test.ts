import { describe, expect, it } from 'vitest';
import { carryKind, chosenKind, misplacedKind, settleKind, type KindTab } from './tabKind';

const SUMMARY: KindTab = { kindParam: 'window' };
const HISTORICAL: KindTab = { kindParam: 'kind', windowIsEnd: true, own: ['window', 'focus'] };
const DIAGNOSIS: KindTab = { kindParam: 'profile', windowIsEnd: true, own: ['window'] };
const MODEL: KindTab = { own: ['event', 'methodRun'] };
const GATES: KindTab = { kindParam: 'kind', own: ['methodRun', 'analysisRun', 'mode', 'view', 'before'] };
const REPLAY: KindTab = { kindParam: 'kind', windowIsEnd: true, own: ['window'] };
const WINDOWS: KindTab = { windowIsEnd: true, own: ['window'] };
const CALCULATIONS: KindTab = { kindParam: 'window', own: ['gate', 'metric'] };
const END = '2026-11-04T12:00:00Z';

const moved = (search: string, from: KindTab, to: KindTab) => {
  const p = new URLSearchParams(search);
  carryKind(p, from, to);
  return Object.fromEntries(p);
};

describe('the 12h / 24h choice between tabs of one page', () => {
  it('moves under the name the next tab reads', () => {
    expect(moved('window=24h', SUMMARY, HISTORICAL)).toEqual({ kind: '24h' });
    expect(moved('window=24h', SUMMARY, DIAGNOSIS)).toEqual({ profile: '24h' });
    expect(moved('kind=24h', HISTORICAL, SUMMARY)).toEqual({ kind: '24h', window: '24h' });
    expect(moved('profile=24h', DIAGNOSIS, HISTORICAL)).toEqual({ profile: '24h', kind: '24h' });
    expect(moved('kind=24h', REPLAY, CALCULATIONS)).toEqual({ kind: '24h', window: '24h' });
    expect(moved('window=24h', CALCULATIONS, GATES)).toEqual({ kind: '24h' });
  });

  it('survives a tab that shows no choice', () => {
    expect(moved('window=24h', SUMMARY, MODEL)).toEqual({ window: '24h', kind: '24h' });
    expect(moved('window=24h&kind=24h', MODEL, HISTORICAL)).toEqual({ kind: '24h' });
    expect(moved('window=24h', CALCULATIONS, WINDOWS)).toEqual({ kind: '24h' });
    expect(moved('kind=24h', WINDOWS, REPLAY)).toEqual({ kind: '24h' });
  });

  it('prefers the tab being left over an older name left on the address', () => {
    expect(moved('window=12h&kind=24h', SUMMARY, HISTORICAL)).toEqual({ kind: '12h' });
    expect(chosenKind(new URLSearchParams('window=12h&kind=24h'), 'kind')).toBe('24h');
  });

  it('adds nothing when no choice was made, and leaves other window sizes alone', () => {
    expect(moved('loop=L', SUMMARY, HISTORICAL)).toEqual({ loop: 'L' });
    expect(moved('kind=15m', GATES, REPLAY)).toEqual({ kind: '15m' });
    expect(chosenKind(new URLSearchParams(`window=${END}`))).toBeUndefined();
  });
});

describe('a selection stays on its tab', () => {
  it('does not take one loop\'s evidence to another loop', () => {
    expect(moved('loop=A&methodRun=R&gate=G7&mode=FIXED', GATES, REPLAY)).toEqual({ loop: 'A', gate: 'G7' });
    expect(moved('loop=A&event=E&methodRun=R', MODEL, SUMMARY)).toEqual({ loop: 'A' });
  });

  it('does not let a gate selection narrow the catalogue, or a catalogue filter select a gate', () => {
    expect(moved('loop=A&gate=G7', GATES, CALCULATIONS)).toEqual({ loop: 'A' });
    expect(moved('loop=A&gate=G7&metric=M', CALCULATIONS, REPLAY)).toEqual({ loop: 'A' });
  });

  it('keeps gate between the two tabs where it means the same', () => {
    expect(moved('loop=A&gate=G7', REPLAY, GATES)).toEqual({ loop: 'A', gate: 'G7' });
  });

  it('does not take an evaluated end to a tab listing other windows', () => {
    expect(moved(`loop=A&window=${END}`, WINDOWS, REPLAY)).toEqual({ loop: 'A' });
    expect(moved(`window=${END}&kind=24h`, HISTORICAL, DIAGNOSIS)).toEqual({ kind: '24h', profile: '24h' });
  });

  it('keeps the loop, the plant scope and the filters', () => {
    const search = 'loop=A&site=s&area=a&unit=u&from=f&to=t&signals=pv&case=c';
    expect(moved(`${search}&focus=x`, HISTORICAL, MODEL)).toEqual(Object.fromEntries(new URLSearchParams(search)));
  });
});

describe('a kind brought by a link or the menu', () => {
  const settled = (search: string, tab: KindTab) => {
    const p = new URLSearchParams(search);
    expect(misplacedKind(p, tab)).toBe(true);
    settleKind(p, tab);
    expect(misplacedKind(p, tab)).toBe(false);
    return Object.fromEntries(p);
  };

  it('goes where the tab reads it', () => {
    expect(settled('window=24h', GATES)).toEqual({ kind: '24h' });
    expect(settled('window=24h', DIAGNOSIS)).toEqual({ profile: '24h' });
    expect(settled('window=24h', WINDOWS)).toEqual({});
  });

  it('never overrides what the link set', () => {
    expect(settled('window=24h&kind=15m', GATES)).toEqual({ kind: '15m' });
    expect(settled('window=24h&kind=12h', HISTORICAL)).toEqual({ kind: '12h' });
  });

  it('leaves a tab alone that reads it there, or shows no choice, and an evaluated end', () => {
    expect(misplacedKind(new URLSearchParams('window=24h'), SUMMARY)).toBe(false);
    expect(misplacedKind(new URLSearchParams('window=24h'), { own: ['event'] })).toBe(false);
    expect(misplacedKind(new URLSearchParams(`window=${END}`), REPLAY)).toBe(false);
  });
});
