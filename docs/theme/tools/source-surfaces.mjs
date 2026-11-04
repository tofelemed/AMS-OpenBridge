#!/usr/bin/env node
// CPA source surfaces. Read-only over src/frontend-ob/src, using the TypeScript compiler and checker.
// Writes docs/theme/deep/data/source-surfaces.json, deny-list.json and hidden-surfaces.md.
// Usage: node docs/theme/tools/source-surfaces.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from './lib/surfaces-core.mjs';
import { createApi } from './lib/surfaces-api.mjs';
import { createRoutes } from './lib/surfaces-routes.mjs';
import { createUrl } from './lib/surfaces-url.mjs';
import { createJsx } from './lib/surfaces-jsx.mjs';
import { createData } from './lib/surfaces-data.mjs';
import { createDeny } from './lib/surfaces-deny.mjs';
import { groupUrlParams, pageEndpoints, deadCode, hiddenMarkdown } from './lib/surfaces-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const outDir = path.join(repo, 'docs/theme/deep/data');
fs.mkdirSync(outDir, { recursive: true });

const ctx = createContext(repo);
const api = createApi(ctx);
const jsx = createJsx(ctx, api);
const rt = createRoutes(ctx, api);
const url = createUrl(ctx, api);
const data = createData(ctx, api, jsx);
const deny = createDeny(ctx, api, jsx);

const routes = rt.collect();
const nav = rt.collectNav();
const { declRoutes, reach, stopTops } = rt.attribute(routes);
const routesFor = n => [...(declRoutes.get(ctx.topOf(n)) ?? [])].sort();
const pub = items => items.map(({ _n, _h, _tag, ...rest }) => ({ ...rest, routes: _n ? routesFor(_n) : rest.routes }));

// Deny-list first: it is the file other work is waiting on.
const clicksRaw = jsx.collectClicks();
const denied = deny.collect();
const sources = ctx.liveFiles.map(sf => [ctx.rel(sf), sf.text.split('\n')]);
const seedEv = deny.seedEvidence(clicksRaw, sources);
const found = denied.evidence.map(({ label, file, line }) => ({ label, file, line }));
const labels = [...deny.SEEDS, ...[...new Set(found.map(e => e.label))].filter(l => !deny.SEEDS.includes(l)).sort((a, b) => a.localeCompare(b))];
const evidence = [...new Map([...seedEv, ...found].map(e => [`${e.label}|${e.file}|${e.line}`, e])).values()];
fs.writeFileSync(path.join(outDir, 'deny-list.json'), JSON.stringify({ labels, evidence }, null, 2));

const pageRoots = new Set(stopTops.values());
const clicks = pub(clicksRaw.map(c => {
  const e = c._h ? api.effects(c._h) : null;
  const muts = e ? e.api.filter(api.mutating) : [];
  return { ...c, mutates: muts.length ? [...new Set(muts.map(m => m.endpoint))] : undefined,
    navigates: e?.navigates.length ? [...new Set(e.navigates)] : undefined,
    setsState: e?.setters.length ? [...new Set(e.setters.map(s => s.name))].slice(0, 6) : undefined };
}));
const u = url.collect();
const overlays = jsx.collectOverlays();
const queries = data.collectQueries();
const mutations = data.collectMutations();
const direct = data.collectDirect();
const polling = data.collectPolling();
const toasts = data.collectToasts();
const permissions = data.collectPermissions();
const collapsibles = jsx.collectCollapsibles();
const regions = jsx.collectRegions(pageRoots);
const urlParams = groupUrlParams(u, routesFor);

const liveRoot = ctx.closure(ctx.fileByRel.get('main.tsx').statements.filter(s => !ctx.ts.isImportDeclaration(s)));
const dead = deadCode(ctx, liveRoot);
const endpoints = pageEndpoints({ queries, mutations, direct, reach, topOf: ctx.topOf, routes, mutating: api.mutatingEndpoint });

const liveRoutes = routes.filter(r => r.kind === 'page');
const routeOut = pub(routes).map(r => {
  const ep = endpoints[r.path];
  return { ...r, routes: undefined, urlParams: urlParams.filter(p => p.route === r.path).map(p => p.key), endpointCount: ep?.reads.length };
});

const totals = {
  liveFiles: ctx.liveFiles.length, routes: routes.length, liveRoutes: liveRoutes.length, sliceRedirects: routes.filter(r => r.kind === 'slice-redirect').length,
  urlParams: urlParams.length, urlParamKeys: new Set(urlParams.map(p => p.key)).size, urlDynamicKeyOps: u.dynamic.filter(d => !d.resolved).length, apiQueryWritesSkipped: u.apiQueryWrites,
  regions: regions.length, pageRootRegions: regions.filter(r => r.pageRoot).length, overlays: overlays.items.length, tooltips: overlays.titles.length,
  collapsibles: collapsibles.length, clicks: clicks.length, clicksStaticLabel: clicks.filter(c => c.labelStatic).length, clicksMutating: clicks.filter(c => c.mutates).length,
  toasts: toasts.length, polling: polling.length, refetchIntervalInBackground: polling.filter(p => p.kind === 'refetchIntervalInBackground').length, queries: queries.length, queriesWithEndpoint: queries.filter(q => q.endpoints.length).length, mutations: mutations.length,
  directCalls: direct.length, permissions: permissions.length, mutatingControls: denied.controls.length, denyUnresolved: denied.unresolved.length,
  denyLabels: labels.length, deadComponents: dead.components.length, deadFiles: dead.files.length,
};

const out = {
  generatedBy: 'docs/theme/tools/source-surfaces.mjs',
  scope: 'source-inventory.json perFile entries with group other than legacy, CPA_SLICE_ONLY=true branches pruned. Paths are relative to src/frontend-ob/src.',
  totals,
  routes: routeOut,
  nav,
  urlParams,
  urlDynamicKeyOps: u.dynamic.filter(d => !d.resolved).map(({ _n, entriesOf, ...r }) => r),
  nonSearchUrlState: pub(u.nonSearch),
  regions: pub(regions),
  overlays: pub(overlays.items),
  tooltips: pub(overlays.titles),
  collapsibles: pub(collapsibles),
  clicks,
  toasts: pub(toasts),
  polling: pub(polling),
  queries: pub(queries),
  mutations: pub(mutations),
  directCalls: pub(direct),
  pageEndpoints: endpoints,
  permissions: pub(permissions),
  mutatingControls: pub(denied.controls),
  denyUnresolved: denied.unresolved,
};
fs.writeFileSync(path.join(outDir, 'source-surfaces.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(outDir, 'hidden-surfaces.md'), hiddenMarkdown({ routes: routeOut, nav, urlParams, dead, ctx, overlays: out.overlays, nonSearch: out.nonSearchUrlState, routeRefs: u.routeRefs }));
console.log(JSON.stringify(totals, null, 1));
