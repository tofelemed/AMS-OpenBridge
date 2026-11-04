#!/usr/bin/env node
// CPA source inventory. Read-only over src/frontend-ob/src; writes docs/theme/data/source-inventory.json.
// Usage: node docs/theme/tools/source-inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HEX, RGB, HSL, OK, MIX, VAR, CSS_COLOUR_PROP, TS_COLOUR_KEY, count, classifyValue } from './lib/colour-rules.mjs';
import { buildReachable } from './lib/import-graph.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const app = path.join(repo, 'src/frontend-ob');
const src = path.join(app, 'src');
const out = path.join(repo, 'docs/theme/data/source-inventory.json');
const ts = createRequire(path.join(app, 'package.json'))('typescript');
const rel = f => path.relative(src, f).replaceAll('\\', '/');

// productSlice.ts CPA_SLICE_ONLY=true keeps /cpm/*, /trend, /admin/*, /login. Everything else redirects home.
const LAZY_LIVE = /Cpm\/|Administration\/Administration|Login\/Login|Designer\/TrendPage/;
const reachable = buildReachable([path.join(src, 'main.tsx')], LAZY_LIVE);
// Admin tabs the slice hides (SLICE_ADMIN_TABS): bundled but redirected, so they count as legacy.
const SLICE_HIDDEN = /Administration\/(AlarmFeedConfig|AlarmRulesConfig|NotificationsConfig)/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

function group(f) {
  const r = rel(f);
  if (!reachable.has(f) || SLICE_HIDDEN.test(r)) return 'legacy';
  if (/^(main\.tsx|App\.tsx|productSlice\.ts)$/.test(r) || r.startsWith('styles/') || r.endsWith('designTokens.css')) return 'core';
  if (/^components\/(shared|nav|charts)\//.test(r) || r === 'components/CommandPalette.tsx' || r.startsWith('hooks/')) return 'shared';
  if (/^components\/Cpm\/[^/]+\.tsx$/.test(r) && !/^components\/Cpm\/Cpm[A-Z]/.test(r) && r !== 'components/Cpm/LoopRegistry.tsx') return 'shared';
  if (r.startsWith('components/Cpm/evidence/views/primitives/')) return 'shared';
  return 'page';
}

const blank = () => ({ hex: 0, rgb: 0, hsl: 0, oklchEtc: 0, colorMix: 0, named: 0, varFallbackLiteral: 0,
  inlineColourProps: 0, inlineLiteral: 0, colourDecl: 0, declLiteral: 0, declMixed: 0, declToken: 0, declIndirect: 0,
  tokenDefLiteral: 0, tRefs: 0, varRefs: 0, tailwindPalette: 0, darkVariant: 0, arbitrary: 0, literals: {}, tokens: {} });
const bump = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const typo = { fontSize: {}, fontWeight: {}, fontFamily: {}, lineHeight: {}, tabular: 0, radius: {} };
const customProps = [];

function scanText(rec, text) {
  rec.hex += count(HEX, text); rec.rgb += count(RGB, text); rec.hsl += count(HSL, text);
  rec.oklchEtc += count(OK, text); rec.colorMix += count(MIX, text);
  for (const m of text.matchAll(VAR)) { rec.varRefs++; bump(rec.tokens, m[1]); }
  for (const re of [HEX, RGB, HSL]) for (const m of text.matchAll(re)) bump(rec.literals, m[0].toLowerCase());
}

function tally(rec, c) {
  rec.varFallbackLiteral += c.fallbacks.length;
  rec.named += c.lits.filter(l => /^[a-z]+$/.test(l)).length;
  if (c.kind === 'keyword') return;
  rec.colourDecl++;
  if (c.kind === 'literal') rec.declLiteral++;
  else if (c.kind === 'mixed') rec.declMixed++;
  else rec.declToken++;
}

function scanCss(f, rec) {
  const raw = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  let selector = '';
  for (const piece of raw.split(/(?<=[{};])/)) {
    const t = piece.trim();
    if (t.endsWith('{')) { selector = t.slice(0, -1).trim(); continue; }
    if (t === '}' || !t.includes(':')) continue;
    const i = t.indexOf(':');
    const prop = t.slice(0, i).trim();
    const value = t.slice(i + 1).replace(/[;}]\s*$/, '').trim();
    if (!/^[-\w]+$/.test(prop)) continue;
    if (prop.startsWith('--')) {
      const c = classifyValue(value);
      customProps.push({ file: rel(f), selector, name: prop, value });
      if (c.kind === 'literal' || c.kind === 'mixed') rec.tokenDefLiteral++;
      continue;
    }
    const clean = value.replace(/\s*!important/, '');
    if (prop === 'font-size') bump(typo.fontSize, clean);
    if (prop === 'font-weight') bump(typo.fontWeight, clean);
    if (prop === 'font-family') bump(typo.fontFamily, clean);
    if (prop === 'line-height') bump(typo.lineHeight, clean);
    if (prop === 'border-radius') bump(typo.radius, clean);
    if (/tabular-nums/.test(value)) typo.tabular++;
    if (CSS_COLOUR_PROP.test(prop)) { tally(rec, classifyValue(value)); scanText(rec, value); }
  }
}

const keyName = n => (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteralLike(n.name)) ? n.name.text : null);
const isLiteralNode = n => ts.isStringLiteralLike(n) || [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(n.kind);
const NO_COLOUR = /^['"`]?(none|transparent|inherit|currentColor|0|true|false|undefined|null|auto)['"`]?$/i;

function scanTs(f, rec) {
  const text = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const inStyle = n => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isJsxAttribute(p)) return p.name.getText(sf) === 'style';
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) return false;
    }
    return false;
  };
  const visit = n => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && /^(T|TB)$/.test(n.expression.text)) rec.tRefs++;
    if (isLiteralNode(n)) {
      const attr = n.parent && ts.isJsxAttribute(n.parent) ? n.parent.name.getText(sf) : '';
      if (!/^(href|id|to|data-testid|aria-)/.test(attr)) scanText(rec, n.text);
      if (/tabular-nums/.test(n.text)) typo.tabular++;
    }
    const isProp = ts.isPropertyAssignment(n);
    const isAttr = ts.isJsxAttribute(n) && /^(fill|stroke|color)$/.test(n.name.getText(sf));
    if (isProp || isAttr) {
      const key = isAttr ? n.name.getText(sf) : keyName(n);
      const init = n.initializer;
      if (key && init) {
        const raw = init.getText(sf);
        const plain = raw.replace(/['"`]/g, '');
        if (key === 'fontSize') bump(typo.fontSize, plain);
        if (key === 'fontWeight') bump(typo.fontWeight, plain);
        if (key === 'fontFamily') bump(typo.fontFamily, plain.slice(0, 60));
        if (key === 'borderRadius') bump(typo.radius, plain);
        if (TS_COLOUR_KEY.test(key) && !ts.isObjectLiteralExpression(init) && !NO_COLOUR.test(raw)) {
          const quoted = /^['"`]/.test(raw) || (ts.isJsxExpression(init) === false && ts.isStringLiteralLike(init));
          const c = classifyValue(plain, { named: quoted });
          const style = inStyle(n);
          if (c.kind === 'keyword') {
            rec.colourDecl++;
            if (/\bTB?\.\w+/.test(raw)) rec.declToken++; else rec.declIndirect++;
          } else tally(rec, c);
          if (style) {
            rec.inlineColourProps++;
            if (c.kind === 'literal' || c.kind === 'mixed') rec.inlineLiteral++;
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // This stack should have none of these. Proved here rather than assumed.
  rec.tailwindPalette = count(/\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g, text);
  rec.darkVariant = count(/\bdark:[\w-]+/g, text);
  rec.arbitrary = count(/\b(?:bg|text|border)-\[[^\]]+\]/g, text);
}

const files = walk(src);
const perFile = {};
for (const f of files) {
  const rec = blank();
  if (f.endsWith('.css')) scanCss(f, rec); else scanTs(f, rec);
  rec.group = group(f);
  rec.lines = fs.readFileSync(f, 'utf8').split('\n').length;
  perFile[rel(f)] = rec;
}

const NUM = Object.keys(blank()).filter(k => typeof blank()[k] === 'number');
const totals = {};
for (const r of Object.values(perFile)) {
  for (const scope of ['all', r.group, ...(r.group === 'legacy' ? [] : ['live'])]) {
    totals[scope] ??= { files: 0 };
    totals[scope].files++;
    for (const k of NUM) totals[scope][k] = (totals[scope][k] ?? 0) + r[k];
  }
}
for (const t of Object.values(totals)) {
  const resolved = t.declToken + t.declLiteral + t.declMixed;
  t.readinessPct = +((t.declToken / Math.max(1, resolved)) * 100).toFixed(1);
}

// Keyed by resolved path: two pairs of stylesheets share a basename across folders.
const importers = {};
for (const f of files.filter(x => /\.tsx?$/.test(x))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/import\s+['"]([^'"]+\.css)['"]/g)) {
    if (!m[1].startsWith('.')) continue;
    (importers[path.resolve(path.dirname(f), m[1])] ??= []).push(rel(f));
  }
}
const rootCss = fs.readdirSync(app).filter(n => n.endsWith('.css')).map(n => path.join(app, n));
const stylesheets = [...rootCss, ...files.filter(f => f.endsWith('.css'))].map(f => {
  const imp = importers[f] ?? [];
  const liveImporter = imp.some(i => reachable.has(path.join(src, i)) && !SLICE_HIDDEN.test(i));
  return { file: path.relative(app, f).replaceAll('\\', '/'), lines: fs.readFileSync(f, 'utf8').split('\n').length, importers: imp,
    status: imp.length === 0 ? 'dead' : liveImporter ? 'imported-live' : 'imported-legacy-only' };
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedBy: 'docs/theme/tools/source-inventory.mjs', totals, typography: typo, stylesheets, customProps, perFile }, null, 1));
const worst = Object.entries(perFile).filter(([, r]) => r.group !== 'legacy')
  .map(([f, r]) => ({ f, literalDecl: r.declLiteral + r.declMixed, hexRgbHsl: r.hex + r.rgb + r.hsl, group: r.group }))
  .sort((a, b) => b.literalDecl - a.literalDecl || b.hexRgbHsl - a.hexRgbHsl).slice(0, 14);
console.log(JSON.stringify({ files: files.length, reachable: reachable.size, totals }));
console.table(worst);
console.table(stylesheets.map(s => ({ file: s.file, lines: s.lines, status: s.status })));
