#!/usr/bin/env node
// What each OpenBridge component exposes to a consumer: CSS parts, slots, inherited geometry variables, and what is
// fixed inside the shadow tree. Read-only over node_modules; writes docs/theme/deep/data/openbridge-internals.json.
// Usage: node docs/theme/tools/obc-internals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const pkg = path.join(repo, 'src/frontend-ob/node_modules/@oicl/openbridge-webcomponents');
const out = path.join(repo, 'docs/theme/deep/data/openbridge-internals.json');
const dir = path.join(pkg, 'dist/components');

const uniq = a => [...new Set(a)].sort();
const all = (re, s, g = 1) => uniq([...s.matchAll(re)].map(m => m[g]));

// Geometry declarations with a literal length inside the shadow stylesheet: a consumer cannot change these with a variable.
const GEOMETRY = /(?:^|[\s;{])((?:min-|max-)?(?:height|width)|border-radius|border-(?:top|bottom|left|right)-(?:left|right)-radius|padding(?:-(?:left|right|top|bottom|inline|block))?|gap|outline-offset|font-size|line-height)\s*:\s*([^;}]+);/g;

function inspect(name) {
  const js = path.join(dir, name, `${name}.js`);
  const css = path.join(dir, name, `${name}.css.js`);
  if (!fs.existsSync(js)) return null;
  const code = fs.readFileSync(js, 'utf8');
  const styles = fs.existsSync(css) ? fs.readFileSync(css, 'utf8') : '';
  const fixed = {};
  const viaVar = {};
  for (const m of styles.matchAll(GEOMETRY)) {
    const [, prop, value] = m;
    const v = value.trim();
    if (/var\(/.test(v)) (viaVar[prop] ??= new Set()).add(v.slice(0, 70));
    else if (/\d(px|rem|em)\b/.test(v)) (fixed[prop] ??= new Set()).add(v.slice(0, 40));
  }
  const toObj = o => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, [...s].sort()]));
  return {
    tag: `obc-${name}`,
    parts: uniq(all(/part="([^"]+)"/g, code).flatMap(p => p.split(/\s+/))),
    slots: all(/<slot(?:\s+name="([^"]+)")/g, code),
    hasDefaultSlot: /<slot(?:\s*>|\s*><\/slot>)/.test(code),
    delegatesFocus: /delegatesFocus/.test(code),
    elementInternals: /attachInternals/.test(code),
    formAssociated: /formAssociated/.test(code),
    roles: all(/role=["']?([a-z${}.:" ]+)["']?/g, code).slice(0, 12),
    ariaAttrs: all(/(aria-[a-z]+)=/g, code),
    nativeElements: all(/<(button|input|textarea|select|table|thead|tbody|tr|td|th|a|dialog|label)[\s>]/g, code),
    hostRules: all(/(:host[^{]*)\{/g, styles).map(s => s.trim()),
    focusVisible: /focus-visible/.test(styles),
    componentVars: all(/var\((--(?:ui-components|obc|[a-z]+-components)-[a-z0-9-]+)/g, styles),
    colourVars: all(/var\((--(?:normal|flat|raised|checked|selected|on-[a-z]+|container|border|element|instrument|alert)-[a-z0-9-]+)/g, styles).length,
    fixedGeometry: toObj(fixed),
    variableGeometry: toObj(viaVar),
  };
}

const names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
const components = Object.fromEntries(names.map(n => [n, inspect(n)]).filter(([, v]) => v));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedBy: 'docs/theme/tools/obc-internals.mjs', package: '@oicl/openbridge-webcomponents', components }, null, 1));
console.log(Object.keys(components).length, 'components');
