#!/usr/bin/env node
// CPA component inventory. Read-only over src/frontend-ob/src; writes docs/theme/deep/data/component-inventory.json.
// Counts every JSX element type over the live file set (source-inventory.json perFile, group != 'legacy').
// Usage: node docs/theme/tools/component-inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildReachable } from './lib/import-graph.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const app = path.join(repo, 'src/frontend-ob');
const src = path.join(app, 'src');
const inventory = path.join(repo, 'docs/theme/data/source-inventory.json');
const out = path.join(repo, 'docs/theme/deep/data/component-inventory.json');
const ts = createRequire(path.join(app, 'package.json'))('typescript');
const rel = f => path.relative(src, f).replaceAll('\\', '/');

const perFile = JSON.parse(fs.readFileSync(inventory, 'utf8')).perFile;
const live = new Set(Object.entries(perFile).filter(([, r]) => r.group !== 'legacy').map(([f]) => f));
const tsxFiles = [...live].filter(f => f.endsWith('.tsx'));

// Route entry points, from the <Route> table in App.tsx. Reachability is static, so "routes" is an upper bound:
// a file imported by a route may render only behind a tab, a dialog or a condition.
const ROUTE_ENTRIES = {
  '/cpm': 'components/Cpm/CpmOverview.tsx',
  '/cpm/performance': 'components/Cpm/CpmPerformance.tsx',
  '/cpm/kpi': 'components/Cpm/CpmKpiDrilldown.tsx',
  '/cpm/explorer': 'components/Cpm/CpmExplorer.tsx',
  '/cpm/calculations': 'components/Cpm/CpmCalculations.tsx',
  '/cpm/historical': 'components/Cpm/CpmHistorical.tsx',
  '/cpm/windows': 'components/Cpm/CpmWindows.tsx',
  '/cpm/replay': 'components/Cpm/CpmReplay.tsx',
  '/cpm/evidence': 'components/Cpm/evidence/GateEvidenceWorkspace.tsx',
  '/cpm/response': 'components/Cpm/response/ResponseWorkspace.tsx',
  '/cpm/config': 'components/Cpm/config/GateConfigurationWorkspace.tsx',
  '/cpm/investigation': 'components/Cpm/CpmInvestigation.tsx',
  '/cpm/pipeline': 'components/Cpm/CpmPipeline.tsx',
  '/cpm/governance': 'components/Cpm/CpmGovernance.tsx',
  '/cpm/registry': 'components/Cpm/LoopRegistry.tsx',
  '/cpm/events': 'components/Cpm/CpmEvents.tsx',
  '/trend': 'components/Designer/TrendPage.tsx',
  '/admin/*': 'components/Administration/Administration.tsx',
  '/login': 'components/Login/Login.tsx',
};
const SHELL = '(shell)';
const routeSets = { [SHELL]: new Set([...buildReachable([path.join(src, 'main.tsx')], /^$/)].map(rel).filter(f => live.has(f))) };
for (const [route, entry] of Object.entries(ROUTE_ENTRIES)) {
  routeSets[route] = new Set([...buildReachable([path.join(src, entry)], /^$/)].map(rel).filter(f => live.has(f)));
}
const routesOf = file => Object.keys(routeSets).filter(r => routeSets[r].has(file));

const EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolveFile(fromFile, spec) {
  const base = path.resolve(path.dirname(path.join(src, fromFile)), spec);
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return rel(p);
  }
  return null;
}

const parsed = new Map();
function parse(file) {
  if (parsed.has(file)) return parsed.get(file);
  const abs = path.join(src, file);
  const text = fs.readFileSync(abs, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
  const imports = new Map();
  const locals = new Set();
  const reexports = new Map();
  const collectLocal = n => {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) locals.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) locals.add(n.name.text);
    ts.forEachChild(n, collectLocal);
  };
  collectLocal(sf);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const spec = st.moduleSpecifier.text;
      const c = st.importClause;
      if (c.name) imports.set(c.name.text, { spec, name: 'default' });
      if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
        for (const el of c.namedBindings.elements) imports.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
      }
      if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) imports.set(c.namedBindings.name.text, { spec, name: '*' });
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) reexports.set(el.name.text, { spec: st.moduleSpecifier.text, name: (el.propertyName ?? el.name).text });
    }
  }
  const rec = { sf, imports, locals, reexports };
  parsed.set(file, rec);
  return rec;
}

// Follow barrels so one component has one key whatever path imported it.
function definingFile(file, name, depth = 0) {
  if (depth > 6 || !file) return file;
  const rec = parse(file);
  if (rec.reexports.has(name)) {
    const r = rec.reexports.get(name);
    return definingFile(resolveFile(file, r.spec), r.name, depth + 1);
  }
  return file;
}

function classify(file, rec, tag) {
  // A lower-case member tag (<item.Icon/>) is a component held in a variable, not a native element.
  if (/^[a-z]/.test(tag) && !tag.includes('.')) return tag.includes('-') ? { kind: 'raw-custom-element', key: tag } : { kind: 'native', key: tag };
  const root = tag.split('.')[0];
  const imp = rec.imports.get(root);
  if (imp) {
    if (imp.spec.startsWith('.')) {
      const target = resolveFile(file, imp.spec);
      const defined = target ? definingFile(target, imp.name) : null;
      const shown = imp.name === 'default' ? tag : imp.name + tag.slice(root.length);
      return { kind: 'custom', key: `${shown} @ ${defined ?? imp.spec}`, name: shown, definedIn: defined };
    }
    if (imp.spec.startsWith('@oicl/')) {
      const name = imp.name + tag.slice(root.length);
      return { kind: name.startsWith('Obi') ? 'openbridge-icon' : 'openbridge', key: name, module: imp.spec };
    }
    return { kind: 'third-party', key: imp.name === 'default' ? tag : imp.name + tag.slice(root.length), module: imp.spec };
  }
  if (rec.locals.has(root)) return { kind: 'custom', key: `${tag} @ ${file}`, name: tag, definedIn: file };
  return { kind: 'dynamic', key: `${tag} @ ${file}`, name: tag, definedIn: file };
}

const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const elements = {};
const totals = { jsxElements: 0, fragments: 0, createElementCalls: 0 };
const progressEmptyStates = []; // EmptyState used as a loading message: its title ends in an ellipsis.

// Static class tokens: literals inside className, including template heads and ternary branches.
function classTokens(init) {
  const acc = [];
  const visit = n => {
    if (ts.isStringLiteralLike(n) || n.kind === ts.SyntaxKind.TemplateHead || n.kind === ts.SyntaxKind.TemplateMiddle || n.kind === ts.SyntaxKind.TemplateTail) {
      acc.push(...n.text.split(/\s+/).filter(t => /^[a-zA-Z][\w-]*$/.test(t)));
    }
    ts.forEachChild(n, visit);
  };
  visit(init);
  return acc;
}

function attrValue(init, sf) {
  if (!init) return 'true';
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteralLike(e)) return e.text;
    if (e.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    if (e.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (ts.isNumericLiteral(e)) return e.text;
    if (ts.isPropertyAccessExpression(e) && /(Variant|Size|Type|Corner|Position|Mode)$/.test(e.expression.getText(sf))) return e.getText(sf);
    return '{expr}';
  }
  return '{expr}';
}

function record(file, rec, opening) {
  const tag = opening.tagName.getText(rec.sf);
  const c = classify(file, rec, tag);
  totals.jsxElements++;
  const e = (elements[c.key] ??= { kind: c.kind, ...(c.name ? { name: c.name } : {}), ...(c.module ? { module: c.module } : {}),
    ...(c.definedIn ? { definedIn: c.definedIn } : {}), uses: 0, files: {}, props: {}, values: {}, roles: {}, classes: {}, sites: [] });
  e.uses++;
  bump(e.files, file);
  const line = rec.sf.getLineAndCharacterOfPosition(opening.getStart(rec.sf)).line + 1;
  if (e.sites.length < 400) e.sites.push(`${file}:${line}`);
  for (const a of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(a)) { bump(e.props, '{...spread}'); continue; }
    const name = a.name.getText(rec.sf);
    bump(e.props, name);
    if (c.name === 'EmptyState' && name === 'title' && a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text.endsWith('…')) {
      progressEmptyStates.push({ site: `${file}:${line}`, title: a.initializer.text });
    }
    if (name === 'className' && a.initializer) for (const t of classTokens(a.initializer)) bump(e.classes, t);
    else if (name === 'role') bump(e.roles, attrValue(a.initializer, rec.sf));
    else if (name !== 'style' && !name.startsWith('on')) {
      const v = attrValue(a.initializer, rec.sf);
      if (v !== '{expr}' && v.length <= 24) bump((e.values[name] ??= {}), v);
    }
  }
}

for (const file of tsxFiles) {
  const rec = parse(file);
  const visit = n => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) record(file, rec, n);
    if (ts.isJsxOpeningFragment(n)) totals.fragments++;
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(rec.sf);
      if (/(^|\.)createElement$/.test(callee) && !/document/.test(callee)) totals.createElementCalls++;
    }
    ts.forEachChild(n, visit);
  };
  visit(rec.sf);
}

for (const e of Object.values(elements)) {
  e.fileCount = Object.keys(e.files).length;
  e.routes = [...new Set(Object.keys(e.files).flatMap(routesOf))].sort();
  e.sites.sort();
}

const byKind = {};
for (const e of Object.values(elements)) {
  const k = (byKind[e.kind] ??= { types: 0, uses: 0 });
  k.types++;
  k.uses += e.uses;
}
const sorted = Object.fromEntries(Object.entries(elements).sort((a, b) => b[1].uses - a[1].uses));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  generatedBy: 'docs/theme/tools/component-inventory.mjs',
  scope: "perFile entries of docs/theme/data/source-inventory.json with group != 'legacy'; .tsx files only (JSX cannot appear in .ts)",
  liveFiles: live.size,
  tsxFiles: tsxFiles.length,
  totals,
  byKind,
  progressEmptyStates,
  routeFileCounts: Object.fromEntries(Object.entries(routeSets).map(([r, s]) => [r, s.size])),
  elements: sorted,
}, null, 1));

console.log(JSON.stringify({ liveFiles: live.size, tsxFiles: tsxFiles.length, totals, byKind }, null, 1));
const top = k => Object.entries(sorted).filter(([, e]) => e.kind === k).slice(0, 45).map(([n, e]) => `${e.uses}\t${e.fileCount}f\t${n}`).join('\n');
for (const k of ['openbridge', 'native', 'third-party', 'custom', 'dynamic']) console.log(`\n== ${k}\n${top(k)}`);
