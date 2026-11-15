// CHG-201: the list's search, status filter and page live in the address; a loop's page keeps them, so "‹ All loops" returns
// to the same list. An old `?loop=` link is not part of either address.
import { describe, expect, it } from 'vitest';
import { listPageHref, loopPageHref } from './registryUrl';

describe('registry addresses', () => {
  it('opens a loop with the list address kept', () => {
    expect(loopPageHref('FIC10401', new URLSearchParams('search=fic&retired=1&page=2&site=hdpe'))).toBe('/cpm/registry/FIC10401?search=fic&retired=1&page=2&site=hdpe');
    expect(loopPageHref('A B', '')).toBe('/cpm/registry/A%20B');
  });

  it('returns to the list with the same address, without an old loop parameter', () => {
    expect(listPageHref('?search=fic&gap=vp&page=3')).toBe('/cpm/registry?search=fic&gap=vp&page=3');
    expect(listPageHref(new URLSearchParams('loop=X&page=2'))).toBe('/cpm/registry?page=2');
    expect(listPageHref('')).toBe('/cpm/registry');
    expect(loopPageHref('FIC1', 'loop=FIC1&search=a')).toBe('/cpm/registry/FIC1?search=a');
  });
});
