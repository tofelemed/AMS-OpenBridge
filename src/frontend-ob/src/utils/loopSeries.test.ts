import { afterEach, describe, expect, it, vi } from 'vitest';

// CHG-101: the loop historian root comes from VITE_LOOP_ROOT_PREFIX, baked in at build time from the
// .env value LOOP_ROOT_PREFIX. The constant is read once at module load, so each case re-imports.
async function load() {
  vi.resetModules();
  return import('./loopSeries');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loopSeries root prefix', () => {
  it('uses the build-time prefix when set (root.hdpe.cpm)', async () => {
    vi.stubEnv('VITE_LOOP_ROOT_PREFIX', 'root.hdpe.cpm');
    const m = await load();
    expect(m.LOOP_ROOT_PREFIX).toBe('root.hdpe.cpm');
    expect(m.loopSeries('FIC10401')).toBe('root.hdpe.cpm.FIC10401');
    expect(m.loopSeries('101FIC')).toBe('root.hdpe.cpm._101FIC');
  });

  it('keeps the legacy tree when unset', async () => {
    vi.stubEnv('VITE_LOOP_ROOT_PREFIX', '');
    const m = await load();
    expect(m.LOOP_ROOT_PREFIX).toBe('root.site1.cpm');
    expect(m.loopSeries('FIC-10409')).toBe('root.site1.cpm.FIC_10409');
  });
});
