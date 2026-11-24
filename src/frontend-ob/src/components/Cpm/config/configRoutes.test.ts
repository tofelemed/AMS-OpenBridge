import { describe, expect, it } from 'vitest';
import { changePath, legacyTarget, loopContextPath, loopPath, plantPath, regionsBatchPath, regionsPath, scoped, STEP_OF_TAB, typePath } from './configRoutes';
import { configHref } from '../cpaHref';

const lt = (s: string) => legacyTarget(new URLSearchParams(s));

describe('config route builders', () => {
  it('builds each sub-page path and encodes ids', () => {
    expect(loopPath('FIC10302')).toBe('/cpm/config/loops/FIC10302');
    expect(loopPath('A/B 1')).toBe('/cpm/config/loops/A%2FB%201');
    expect(typePath('p 1')).toBe('/cpm/config/types/p%201');
    expect(plantPath('hdpe')).toBe('/cpm/config/plant/hdpe');
    expect(regionsPath()).toBe('/cpm/config/regions');
    expect(changePath('b6')).toBe('/cpm/config/changes/b6');
    expect(changePath('b/6', 'check')).toBe('/cpm/config/changes/b%2F6?step=check');
  });
  it('maps each bundle tab to a change step', () => {
    expect(STEP_OF_TAB).toEqual({ properties: 'edit', diff: 'check', shadow: 'try', approval: 'approve', deployments: 'deploy' });
  });
});

describe('scoped (the header plant travels with every journey link)', () => {
  it('carries site, area and unit and nothing else, before the path query', () => {
    expect(scoped('/cpm/config/types/p1', '?site=hdpe&area=a&unit=u1&tab=versions&gate=G4')).toBe('/cpm/config/types/p1?site=hdpe&area=a&unit=u1');
    expect(scoped(changePath('b6', 'check'), new URLSearchParams('site=hdpe'))).toBe('/cpm/config/changes/b6?site=hdpe&step=check');
    expect(scoped(regionsBatchPath('b 7'), 'site=hdpe')).toBe('/cpm/config/regions?site=hdpe&batch=b%207');
  });
  it('leaves the path alone without a scope, and keeps a scope key the path names itself', () => {
    expect(scoped('/cpm/config', '')).toBe('/cpm/config');
    expect(scoped(regionsBatchPath('b 7'), '?tab=x')).toBe('/cpm/config/regions?batch=b%207');
    expect(scoped('/cpm/config/regions?site=other', '?site=hdpe&unit=u1')).toBe('/cpm/config/regions?unit=u1&site=other');
  });
});

describe('legacyTarget', () => {
  it('sends an old bundle link to the change page at the matching step', () => {
    expect(lt('loop=FIC10302&view=editor&bundle=b6&tab=deployments')).toBe('/cpm/config/changes/b6?step=deploy');
    expect(lt('view=editor&bundle=b6')).toBe('/cpm/config/changes/b6');
    expect(lt('view=editor&bundle=b6&tab=nonsense')).toBe('/cpm/config/changes/b6');
    expect(lt('view=editor&bundle=b6&tab=constructor')).toBe('/cpm/config/changes/b6');
    expect(lt('view=editor&bundle=b6&tab=toString')).toBe('/cpm/config/changes/b6');
  });
  it('sends the bundles view to the loop versions tab', () => {
    expect(lt('loop=FIC10302&view=bundles')).toBe('/cpm/config/loops/FIC10302?tab=versions');
  });
  it('sends per-loop to the regions page, keeping the batch', () => {
    expect(lt('view=per-loop&batch=x1')).toBe('/cpm/config/regions?batch=x1');
    expect(lt('view=per-loop')).toBe('/cpm/config/regions');
  });
  it('sends an old loop link (view=effective or a gate) to the loop page, keeping the gate', () => {
    expect(lt('loop=FIC10302&view=effective')).toBe('/cpm/config/loops/FIC10302');
    expect(lt('loop=FIC10302&view=effective&gate=G12')).toBe('/cpm/config/loops/FIC10302?gate=G12');
    expect(lt('loop=FIC10302&gate=G12')).toBe('/cpm/config/loops/FIC10302?gate=G12');
  });
  it('leaves a bare loop alone: it is the loop the app carries, so the start page shows', () => {
    expect(lt('loop=FIC10302')).toBeNull();
    expect(lt('site=hdpe&loop=FIC10302&range=24h')).toBeNull();
  });
  it('a loop page link that names the loop as the carried one', () => {
    expect(loopContextPath('FIC 1')).toBe('/cpm/config/loops/FIC%201?loop=FIC%201');
  });
  it('returns null when there is nothing to map', () => {
    expect(lt('')).toBeNull();
    expect(lt('view=effective')).toBeNull();
  });
});

describe('configHref on the new routes', () => {
  it('routes by what the caller names', () => {
    expect(configHref({ loop: 'FIC10302' })).toBe('/cpm/config/loops/FIC10302');
    expect(configHref({ loop: 'FIC10302', gate: 'G12' })).toBe('/cpm/config/loops/FIC10302?gate=G12');
    expect(configHref({ bundle: 'b6', tab: 'approval' })).toBe('/cpm/config/changes/b6?step=approve');
    expect(configHref({ bundle: 'b6' })).toBe('/cpm/config/changes/b6');
    expect(configHref({ scope: 'LOOP', ref: 'L1' })).toBe('/cpm/config/loops/L1');
    expect(configHref({ scope: 'PROFILE', ref: 'p1' })).toBe('/cpm/config/types/p1');
    expect(configHref({ scope: 'SITE', site: 'hdpe' })).toBe('/cpm/config/plant/hdpe');
    expect(configHref()).toBe('/cpm/config');
  });
});
