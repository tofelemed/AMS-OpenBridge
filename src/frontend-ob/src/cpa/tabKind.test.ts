import { describe, expect, it } from 'vitest';
import { carryKind, chosenKind, type KindTab } from './tabKind';

const SUMMARY: KindTab = { kindParam: 'window' };
const HISTORICAL: KindTab = { kindParam: 'kind', windowIsEnd: true };
const DIAGNOSIS: KindTab = { kindParam: 'profile', windowIsEnd: true };
const MODEL: KindTab = {};
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
  });

  it('survives a tab that shows no choice', () => {
    const onModel = moved('window=24h', SUMMARY, MODEL);
    expect(onModel).toEqual({ window: '24h' });
    expect(moved('window=24h', MODEL, HISTORICAL)).toEqual({ kind: '24h' });
  });

  it('keeps an evaluated end for a page that reads one', () => {
    expect(moved(`window=${END}&kind=24h`, HISTORICAL, DIAGNOSIS)).toEqual({ window: END, kind: '24h', profile: '24h' });
  });

  it('prefers the tab being left over an older name left on the address', () => {
    expect(moved('window=12h&kind=24h', SUMMARY, HISTORICAL)).toEqual({ kind: '12h' });
    expect(chosenKind(new URLSearchParams('window=12h&kind=24h'), 'kind')).toBe('24h');
  });

  it('adds nothing when no choice was made, and ignores other window sizes', () => {
    expect(moved('loop=L', SUMMARY, HISTORICAL)).toEqual({ loop: 'L' });
    expect(moved('kind=15m', HISTORICAL, SUMMARY)).toEqual({ kind: '15m' });
    expect(chosenKind(new URLSearchParams(`window=${END}`))).toBeUndefined();
  });
});
