// Aggregation and the hidden-surfaces.md writer for source-surfaces.mjs.
import { sliceFacts } from './surfaces-hidden-facts.mjs';

export function groupUrlParams(u, routesFor) {
  const map = new Map();
  const slot = (route, key) => {
    const k = `${route}|${key}`;
    if (!map.has(k)) map.set(k, { route, key, allowed: new Set(), writtenValues: new Set(), reads: [], writes: [], links: [] });
    return map.get(k);
  };
  const owners = n => { const r = routesFor(n); return r.length ? r : ['(unreachable)']; };
  for (const r of u.reads) {
    for (const route of owners(r._n)) {
      const s = slot(route, r.key);
      s.reads.push({ at: r.at, expr: r.expr });
      r.values.forEach(v => s.allowed.add(v));
    }
  }
  for (const w of u.writes) {
    // Link helpers write for the route they target; setParams writes for the route they run on.
    const targets = w.target && w.target !== 'unknown' ? [w.target] : owners(w._n);
    for (const route of targets) {
      const s = slot(route, w.key);
      s.writes.push({ at: w.at, op: w.op, values: w.values, helperFor: w.target ?? undefined, viaHelper: w.viaHelper });
      for (const v of w.values) { s.allowed.add(v); s.writtenValues.add(v); }
    }
  }
  for (const l of u.links) {
    const s = slot(l.target, l.key);
    s.links.push({ at: l.at, value: l.value, from: routesFor(l._n) });
    if (l.value != null) { s.allowed.add(l.value); s.writtenValues.add(l.value); }
  }
  return [...map.values()].map(s => ({ ...s, allowed: [...s.allowed].filter(Boolean).sort(), writtenValues: [...s.writtenValues].filter(Boolean).sort() }))
    .sort((a, b) => a.route.localeCompare(b.route) || a.key.localeCompare(b.key));
}

export function pageEndpoints({ queries, mutations, direct, reach, topOf, mutating }) {
  const out = {};
  for (const [route, tops] of Object.entries(reach)) {
    const reads = new Map(); const writes = new Map();
    const add = (ep, at, hook) => {
      if (/^\S+ \{[^}]*\}$/.test(ep)) return; // a helper's bare {url}; its callers appear with real paths
      const m = mutating(ep) ? writes : reads;
      if (!m.has(ep)) m.set(ep, { endpoint: ep, hooks: new Set(), at });
      if (hook) m.get(ep).hooks.add(hook);
    };
    for (const q of queries) if (tops.has(topOf(q._n))) for (const e of q.endpoints) add(e, q.at, q.hook);
    for (const m of mutations) if (tops.has(topOf(m._n))) for (const e of m.endpoints) add(e, m.at, m.hook);
    for (const d of direct) if (!d.viaQuery && tops.has(topOf(d._n))) add(d.endpoint, d.at, d.owner);
    const fin = m => [...m.values()].map(v => ({ ...v, hooks: [...v.hooks] })).sort((a, b) => a.endpoint.localeCompare(b.endpoint));
    out[route] = { reads: fin(reads), writes: fin(writes) };
  }
  return out;
}

const isComp = (ts, ctx, t) => {
  const nm = ctx.nameOf(t);
  if (!nm || !(ctx.isUpper(nm) || /^use[A-Z]/.test(nm))) return false;
  if (ctx.fnOf(t)) return true;
  const i = ctx.stripExpr(t.initializer);
  return !!i && ts.isCallExpression(i) && /memo|forwardRef|lazy/.test(i.expression.getText());
};

export function deadCode(ctx, liveRoot) {
  const { ts, program, symOf, isSrc, topOf } = ctx;
  const importers = new Map();
  for (const sf of program.getSourceFiles()) {
    if (!isSrc(sf)) continue;
    ts.forEachChild(sf, n => {
      if (!ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)) return;
      const clause = ts.isImportDeclaration(n) ? n.importClause : n.exportClause;
      const names = [];
      if (ts.isImportDeclaration(n)) {
        if (clause?.name) names.push(clause.name);
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) names.push(...clause.namedBindings.elements.map(e => e.name));
      } else if (clause && ts.isNamedExports(clause)) names.push(...clause.elements.map(e => e.name));
      for (const id of names) {
        const s = symOf(id);
        for (const d of s?.declarations ?? []) {
          if (ts.isSourceFile(d)) continue;
          const t = topOf(d);
          if (!importers.has(t)) importers.set(t, new Set());
          importers.get(t).add(ctx.rel(sf));
        }
      }
    });
  }
  const testText = [];
  const walk = dir => {
    for (const e of ctx.ts.sys.readDirectory(dir, ['.ts', '.tsx'], undefined, ['**/*.test.*'])) testText.push(e);
  };
  walk(ctx.src);
  const tests = testText.map(f => ctx.ts.sys.readFile(f) ?? '');
  const components = []; const files = [];
  for (const sf of ctx.liveFiles) {
    let topCount = 0; let reached = 0;
    const isApp = ctx.rel(sf) === 'App.tsx'; // its lazy page consts are the legacy table, not dead code
    ts.forEachChild(sf, st => {
      const decls = ts.isVariableStatement(st) ? [...st.declarationList.declarations] : ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) ? [st] : [];
      for (const t of decls) {
        topCount++;
        if (liveRoot.has(t)) { reached++; continue; }
        if (isApp || !isComp(ts, ctx, t)) continue;
        const nm = ctx.nameOf(t);
        const imp = [...(importers.get(t) ?? [])];
        const exported = (ts.getCombinedModifierFlags(t) & ts.ModifierFlags.Export) !== 0 || ts.getCombinedModifierFlags(t.parent?.parent ?? t) & ts.ModifierFlags.Export;
        components.push({ name: nm, kind: /^use/.test(nm) ? 'hook' : 'component', at: ctx.at(t), exported: !!exported,
          status: imp.length ? 'imported, but no live path renders it' : exported ? 'exported, imported nowhere' : 'local, referenced by no live declaration',
          importedBy: imp.slice(0, 6), testOnly: tests.some(s => new RegExp(`\\b${nm}\\b`).test(s)) });
      }
    });
    if (topCount && !reached) {
      const base = ctx.rel(sf).replace(/\.tsx?$/, '').split('/').pop();
      const spec = new RegExp(`from ['"][^'"]*${base}['"]`);
      const importLines = ctx.liveFiles.flatMap(o => o.text.split('\n').filter(l => spec.test(l)));
      const typesOnly = importLines.length > 0 && importLines.every(l => /^\s*(import|export) type\b/.test(l));
      files.push({ file: ctx.rel(sf), declarations: topCount, note: typesOnly ? 'imported for types only, so nothing reaches the runtime' : 'no live reference' });
    }
  }
  return { components: components.sort((a, b) => a.at.localeCompare(b.at)), files };
}

const cell = s => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');

export function hiddenMarkdown({ routes, nav, urlParams, dead, ctx, overlays, nonSearch, routeRefs }) {
  const f = sliceFacts({ routes, nav, urlParams, ctx, routeRefs });
  const L = [];
  L.push('# CPA hidden surfaces', '');
  L.push('Generated by `docs/theme/tools/source-surfaces.mjs`. Paths are relative to `src/frontend-ob/src`. Scope: `CPA_SLICE_ONLY=true`, live-file set from `source-inventory.json`.', '');
  L.push('## Routes that have no menu entry', '', 'A route with no sidebar or admin-tab entry is reached by an in-app link or by typing the URL. "In-app links" counts literal hrefs in live code.', '');
  L.push(table(['Route', 'Guard', 'In-app links', 'Example link'], f.noMenu.map(r => [`\`${r.path}\``, r.guard, r.links.length, r.links[0] ?? 'none (URL only)'])), '');
  L.push('## Views reachable only by URL', '', 'A search parameter a page reads while nothing in live code writes it. The shared `loop`, `site`, `area`, `unit`, `from` and `to` carry in `cpmNavHref` is left out.', '');
  L.push('### Parameters with no writer', '', f.urlOnly.length ? '' : 'None.', table(['Route', 'Key', 'Known values', 'Read at'], f.urlOnly.map(p => [`\`${p.route}\``, `\`${p.key}\``, p.allowed.join(', ') || 'free value', p.reads[0]?.at])), '');
  L.push('### Values with no writer', '', 'Values the page compares against that no control or link sets, listed only where every writer of the key is a literal. A value here is either the default shown when the key is absent, or a view only a typed URL reaches.', '', table(['Route', 'Key', 'Unset values', 'Written values', 'Read at'], f.unsetValues.map(p => [`\`${p.route}\``, `\`${p.key}\``, p.unset.join(', '), p.writtenValues.join(', '), p.reads[0]?.at])), '');
  L.push('### Opened only by keyboard or by state', '');
  if (overlays.some(x => /CommandPalette/.test(x.at))) L.push('- Command palette (`components/CommandPalette.tsx:116`): opened by Ctrl+K or Cmd+K only (`components/CommandPalette.tsx:47`). No visible control opens it, and it is the only way to jump straight to a loop or a calculation from any page.');
  L.push(...f.nonSearch(nonSearch).map(s => `- ${s}`), '');
  L.push('## Silent redirects by permission', '', '`RequirePermission` (`App.tsx:786`) sends a user without the permission to `/cpm` with `Navigate replace` and no message. It shows "Not authorized" only when the user lacks `analytics.view` or is already on `/cpm`. Inside Administration each tab redirects to the first visible tab, or `/cpm` if there is none.', '');
  L.push(table(['Route', 'Requires', 'On refusal', 'Declared at'], f.silent.map(r => [`\`${r.path}\``, r.req, r.to, r.at])), '');
  L.push('', '### Guard mismatches', '');
  L.push(...f.mismatches.map(s => `- ${s}`), '');
  L.push('## Legacy routes under CPA_SLICE_ONLY', '', 'These paths are declared but redirect: App-level routes to `/cpm`, hidden admin tabs to the first visible tab. App-level pages stay in the build as lazy chunks. The hidden admin tabs are static imports of `Administration.tsx`, so they ship in its chunk.', '');
  L.push(table(['Route', 'Legacy component', 'Legacy permission', 'Declared at'], f.legacy.map(r => [`\`${r.path}\``, r.legacyComponent ?? r.component ?? '', r.legacyPermission ?? '', r.at])), '');
  L.push('', '### Menu entries filtered out by the slice', '', table(['Path', 'Label', 'Group', 'Declared at'], f.navHidden.map(n => [`\`${n.path}\``, n.label, n.group ?? '', n.at])), '');
  L.push('', '### Administration tabs filtered out by the slice', '', table(['Path', 'Label', 'Declared at'], f.tabsHidden.map(n => [`\`${n.path}\``, n.label, n.at])), '');
  L.push('', '## Dead components in the live import graph', '', 'Reachability walks references from `main.tsx`, resolving symbols with the checker and skipping branches the slice settles. Test files are outside the program, so `testOnly` means a test file names the symbol.', '');
  L.push(table(['Name', 'Kind', 'At', 'Status', 'Imported by', 'Named in tests'], dead.components.map(c => [c.name, c.kind, c.at, c.status, c.importedBy.join(', '), c.testOnly ? 'yes' : 'no'])), '');
  L.push('', '### Live-set files with no reachable declaration', '', dead.files.length ? table(['File', 'Top-level declarations', 'Note'], dead.files.map(x => [x.file, x.declarations, x.note])) : 'None.', '');
  return `${L.join('\n')}\n`;
}
