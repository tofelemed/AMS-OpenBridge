#!/usr/bin/env node
// Lists every colour variable the OpenBridge components in use read inside their shadow roots, then checks that
// each is assigned by the bridge. Usage: node scripts/theme/bridge-coverage.mjs [--list]
// Exit 1 when a colour variable is unassigned, so a package upgrade that adds one is caught.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../..');
const pkg = path.join(app, 'node_modules/@oicl/openbridge-webcomponents/dist');
const src = path.join(app, 'src');
const list = process.argv.includes('--list');

// Components CPA renders today, plus what they compose. Removed from this list as Phase 3 replaces them.
const USED = ['button', 'icon-button', 'toggle-button-group', 'toggle-button-option', 'tab-row', 'tab-item', 'tab', 'text-input-field', 'filter-chip', 'accordion-item', 'status-indicator', 'progress-bar', 'pagination', 'input-chip', 'dropdown-button', 'alert-icon', 'checkbox', 'badge', 'tooltip', 'chip'];

function jsIn(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) jsIn(p, acc);
    else if (e.name.endsWith('.js') || e.name.endsWith('.css')) acc.push(p);
  }
  return acc;
}

const read = new Set();
for (const c of USED) {
  for (const f of jsIn(path.join(pkg, 'components', c))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/var\(\s*(--[a-z0-9-]+)/g)) read.add(m[1]);
  }
}

// A name is a colour when openbridge.css gives it a colour value in any theme.
const css = fs.readFileSync(path.join(pkg, 'openbridge.css'), 'utf8');
const colour = new Set();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g)) colour.add(m[1]);
const aliased = new Set();
for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(/g)) aliased.add(m[1]);

const bridged = new Set();
for (const f of fs.readdirSync(path.join(src, 'styles')).filter(n => n.startsWith('openbridge-bridge'))) {
  for (const m of fs.readFileSync(path.join(src, 'styles', f), 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/g)) bridged.add(m[1]);
}

const need = [...read].filter(n => (colour.has(n) && !/radius/.test(n)) || (aliased.has(n) && /color|background/.test(n) && !/radius/.test(n))).sort();
const missing = need.filter(n => !bridged.has(n));
if (list) console.log(need.join('\n'));
console.log(`components ${USED.length}, shadow-root variables read ${read.size}, colour variables ${need.length}, unbridged ${missing.length}`);
if (missing.length) {
  console.log(missing.join('\n'));
  process.exit(1);
}
