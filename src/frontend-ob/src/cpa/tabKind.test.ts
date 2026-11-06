import { describe, expect, it } from 'vitest';
import { chosenKind } from './tabKind';

describe('the 12h / 24h choice on an address', () => {
  it('reads the name a page uses first', () => {
    expect(chosenKind(new URLSearchParams('kind=12h&window=24h'), 'kind')).toBe('12h');
    expect(chosenKind(new URLSearchParams('profile=24h'), 'profile')).toBe('24h');
  });

  it('reads an old ?window=12h as a kind on a page that names it otherwise', () => {
    expect(chosenKind(new URLSearchParams('window=12h'), 'kind')).toBe('12h');
  });

  it('never reads a window END as a kind', () => {
    expect(chosenKind(new URLSearchParams('window=2026-11-04T12:00:00Z'), 'kind')).toBeUndefined();
    expect(chosenKind(new URLSearchParams('window=2026-11-04T12:00:00Z&kind=24h'), 'kind')).toBe('24h');
  });
});
