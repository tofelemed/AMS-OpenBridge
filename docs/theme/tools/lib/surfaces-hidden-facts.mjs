// Derives the hidden-surface tables from routes, nav tables and URL parameters.
export function sliceFacts({ routes, nav, urlParams, ctx, routeRefs }) {
  const { admin, nav: sliceNav } = ctx.sliceTabs;
  const menuPaths = new Set(nav.items.filter(n => sliceNav.has(n.path)).map(n => n.path));
  const tabPaths = new Set(nav.tabs.filter(t => admin.has(t.path)).map(t => t.path));
  const chrome = /^(App\.tsx|productSlice\.ts|components\/nav\/|components\/Administration\/Administration\.tsx)/;
  const refs = path => routeRefs.filter(r => r.path === path && !chrome.test(r.at)).map(r => r.at);
  const guard = r => [r.permission, r.anyOf?.length ? `anyOf ${r.anyOf.join(', ')}` : null, r.guard].filter(Boolean).join('; ') || 'parent guard only';
  const pages = routes.filter(r => r.kind === 'page');

  const noMenu = pages.filter(r => !menuPaths.has(r.path) && !tabPaths.has(r.path) && r.path !== '/admin/*' && r.path !== '/login')
    .map(r => ({ path: r.path, guard: guard(r), links: refs(r.path) }));

  const skip = new Set(['(unreachable)', '(shell)']);
  const urlOnly = urlParams.filter(p => p.reads.length && !p.writes.length && !p.links.length && !skip.has(p.route));
  const unsetValues = urlParams
    .filter(p => p.reads.length && (p.writes.length || p.links.length) && !skip.has(p.route))
    .filter(p => p.writes.every(w => w.op === 'delete' || w.values.length) && p.links.every(l => l.value != null))
    .map(p => ({ ...p, unset: p.allowed.filter(v => !p.writtenValues.includes(v)) }))
    .filter(p => p.unset.length);

  const silent = [];
  for (const r of pages) {
    if (r.path === '/login') continue;
    if (r.permission || r.anyOf?.length) {
      silent.push({ path: r.path, req: r.anyOf?.length ? `any of ${r.anyOf.join(', ')}` : r.permission, to: '`/cpm`, or "Not authorized" without analytics.view', at: r.at });
    } else if (r.guard) {
      silent.push({ path: r.path, req: r.guard, to: 'first visible tab, else `/cpm`', at: r.at });
    }
  }
  const legacy = routes.filter(r => r.kind === 'slice-redirect');

  const tabByPath = new Map(nav.tabs.map(t => [t.path, t]));
  const routeByPath = new Map(routes.map(r => [r.path, r]));
  const mismatches = [];
  const adminRoute = routeByPath.get('/admin/*');
  const adminNav = nav.items.find(n => n.path === '/admin');
  if (adminRoute && adminNav) {
    const extra = (adminRoute.anyOf ?? []).filter(p => !(adminNav.anyOf ?? []).includes(p));
    if (extra.length) mismatches.push(`\`/admin/*\` (${adminRoute.at}) accepts ${extra.join(', ')}, but the Administration menu entry (${adminNav.at}) does not list them. A user holding only those opens the route by URL with no menu entry.`);
  }
  for (const t of nav.tabs.filter(x => admin.has(x.path))) {
    const r = routeByPath.get(t.path);
    if (!r) continue;
    if (t.permission && !(adminRoute?.anyOf ?? []).includes(t.permission) && !r.guard) mismatches.push(`Tab \`${t.path}\` needs ${t.permission}, which the \`/admin/*\` umbrella guard does not list.`);
    if (t.permission && !(adminRoute?.anyOf ?? []).includes(t.permission) && r.guard) mismatches.push(`Tab \`${t.path}\` needs ${t.permission}, which the \`/admin/*\` umbrella guard (${adminRoute?.at}) does not list, so that permission alone is redirected before the tab loads.`);
    if (!t.permission && !r.guard) mismatches.push(`Tab \`${t.path}\` (${t.at}) and its route (${r.at}) carry no check of their own, so any holder of one umbrella permission opens the page.`);
  }
  for (const n of nav.items.filter(x => sliceNav.has(x.path))) {
    const r = routeByPath.get(n.path);
    if (r?.permission && !r.anyOf?.length && n.permission !== r.permission) mismatches.push(`Menu \`${n.path}\` needs ${n.permission} while the route needs ${r.permission}.`);
  }
  for (const r of pages) {
    if (r.path.startsWith('/admin/') && !tabByPath.has(r.path) && r.path !== '/admin/*') mismatches.push(`\`${r.path}\` (${r.at}) renders with no tab in the bar.`);
  }

  const nonSearch = items => items.map(s => `\`${s.kind}\` at ${s.at}: ${s.expr}`);
  return { noMenu, urlOnly, unsetValues, silent, legacy, mismatches, nonSearch,
    navHidden: nav.items.filter(n => !sliceNav.has(n.path)),
    tabsHidden: nav.tabs.filter(t => !admin.has(t.path)) };
}
