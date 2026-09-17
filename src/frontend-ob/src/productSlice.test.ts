import { describe, expect, it } from 'vitest';
import { isSliceNavPath, postLoginPath } from './productSlice';

// 2026-09-17 UI audit: the three v2.5 pages had routes and nav entries but the Marun slice
// whitelist hid them from the sidebar and the command palette. Every Loop Performance page
// the nav declares must be a slice path, or it is unreachable without typing the URL.
describe('productSlice (CPA slice navigation)', () => {
  it.each([
    '/cpm', '/cpm/performance', '/cpm/explorer', '/cpm/historical', '/cpm/windows', '/cpm/replay',
    '/cpm/evidence', '/cpm/response', '/cpm/config',
    '/cpm/investigation', '/cpm/calculations', '/cpm/registry', '/cpm/events', '/cpm/pipeline', '/cpm/governance',
    '/trend', '/admin',
  ])('keeps %s in the sidebar', path => {
    expect(isSliceNavPath(path)).toBe(true);
  });

  it('keeps the CAMS and designer chrome out of the slice', () => {
    for (const p of ['/dashboard', '/alarms', '/designer', '/displays', '/edge']) expect(isSliceNavPath(p)).toBe(false);
  });

  it('returns to a v2.5 page after login when that is where the user was', () => {
    expect(postLoginPath('/cpm/evidence?loop=FIC10405&methodRun=abc&gate=G5')).toBe('/cpm/evidence?loop=FIC10405&methodRun=abc&gate=G5');
    expect(postLoginPath('/cpm/config')).toBe('/cpm/config');
    expect(postLoginPath('/designer')).toBe('/cpm');
  });
});
