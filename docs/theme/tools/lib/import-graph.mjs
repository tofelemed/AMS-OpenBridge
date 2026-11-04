// Which source files can actually execute in the live CPA slice.
// App.tsx lazily imports every page, so it is walked with an allowlist of lazy targets.
import fs from 'node:fs';
import path from 'node:path';

const EXT = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'];
const FROM = /\bfrom\s+['"](\.[^'"]+)['"]/g;
const BARE = /(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const e of EXT) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function buildReachable(entries, lazyAllow) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !/\.(tsx?|css)$/.test(f)) continue;
    seen.add(f);
    if (f.endsWith('.css')) continue;
    const src = fs.readFileSync(f, 'utf8');
    const specs = new Set();
    for (const re of [FROM, BARE]) for (const m of src.matchAll(re)) specs.add(m[1]);
    for (const m of src.matchAll(DYNAMIC)) {
      if (path.basename(f) !== 'App.tsx' || lazyAllow.test(m[1])) specs.add(m[1]);
    }
    for (const s of specs) {
      const r = resolve(f, s);
      if (r) stack.push(r);
    }
  }
  return seen;
}
