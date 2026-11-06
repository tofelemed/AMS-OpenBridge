// The CPA pages compared by size-check and control-check. `before` is the address in the build the baseline
// was taken from, `after` is its address in the reference redesign. Old addresses keep working through redirects.
const L = encodeURIComponent(process.env.CPA_LOOP ?? 'FIC10401');

export const PAGES = [
  { key: 'overview', before: '/cpm', after: '/cpm' },
  { key: 'performance', before: '/cpm/performance', after: '/cpm/performance' },
  { key: 'performance-matrix', before: '/cpm/performance?view=matrix', after: '/cpm/performance?view=matrix' },
  { key: 'events', before: '/cpm/events', after: '/cpm/events' },
  { key: 'explorer', before: `/cpm/loop?tab=summary&loop=${L}`, after: `/cpm/explorer?loop=${L}` },
  { key: 'explorer-signals', before: `/cpm/loop?tab=signals&loop=${L}`, after: `/cpm/explorer?loop=${L}&tab=Signals` },
  { key: 'explorer-calculations', before: `/cpm/loop?tab=calculations&loop=${L}`, after: `/cpm/explorer?loop=${L}&tab=Calculations` },
  { key: 'explorer-history', before: `/cpm/loop?tab=history&loop=${L}`, after: `/cpm/explorer?loop=${L}&tab=History` },
  { key: 'historical', before: `/cpm/loop?tab=historical&loop=${L}`, after: `/cpm/historical?loop=${L}` },
  { key: 'investigation', before: `/cpm/loop?tab=diagnosis&loop=${L}`, after: `/cpm/investigation?loop=${L}` },
  { key: 'response', before: `/cpm/loop?tab=model&loop=${L}`, after: `/cpm/response?loop=${L}` },
  { key: 'workbench', before: `/cpm/evidence?tab=gates&loop=${L}`, after: `/cpm/evidence?loop=${L}` },
  { key: 'replay', before: `/cpm/evidence?tab=replay&loop=${L}`, after: `/cpm/replay?loop=${L}` },
  { key: 'windows', before: `/cpm/evidence?tab=windows&loop=${L}`, after: `/cpm/windows?loop=${L}` },
  { key: 'calculations', before: `/cpm/evidence?tab=calculations&loop=${L}`, after: `/cpm/calculations?loop=${L}` },
  { key: 'registry', before: '/cpm/setup?tab=loops', after: '/cpm/registry' },
  { key: 'config', before: `/cpm/setup?tab=configuration&loop=${L}`, after: `/cpm/config?loop=${L}` },
  { key: 'trend', before: '/trend', after: '/trend' },
  { key: 'pipeline', before: '/cpm/system?tab=pipeline', after: '/cpm/pipeline' },
  { key: 'governance', before: '/cpm/system?tab=governance', after: '/cpm/governance' },
  { key: 'users', before: '/cpm/system?tab=users', after: '/admin/users' },
  { key: 'roles', before: '/cpm/system?tab=roles', after: '/admin/roles' },
  { key: 'settings', before: '/cpm/system?tab=settings', after: '/admin/system' },
  { key: 'plant-model', before: '/cpm/setup?tab=plant-model', after: '/admin/plant-model' },
  { key: 'data-sources', before: '/cpm/setup?tab=data-sources', after: '/admin/data-sources' },
  { key: 'tag-aliases', before: '/cpm/setup?tab=tag-aliases', after: '/admin/aliases' },
];

/** Opens one page from a clean start, so a page never inherits the last page's selection. */
export async function openPage(page, net, goto, waitStable, url) {
  await goto(page, '/trend');
  await page.waitForTimeout(120);
  await goto(page, url);
  await waitStable(page, net, { timeout: 14000, quietMs: 500 });
  await page.waitForTimeout(400);
}
