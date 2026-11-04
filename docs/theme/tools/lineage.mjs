#!/usr/bin/env node
// Checks docs/theme/deep/metric-lineage.json: every cited file:line exists within the file's length, and prints
// the concept count by status. Exit code 1 when a citation is bad.
// Usage: node docs/theme/tools/lineage.mjs [path/to/metric-lineage.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const input = path.resolve(process.argv[2] ?? path.join(repo, 'docs/theme/deep/metric-lineage.json'));
const concepts = JSON.parse(fs.readFileSync(input, 'utf8'));

const STATUSES = ['Consistent', 'Label only', 'Definition conflict', 'Engine-UI conflict', 'Undocumented'];
const CITE = /([A-Za-z0-9_][A-Za-z0-9_.\/-]*\.(?:tsx?|mjs|cs|java|md|json|ya?ml)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;

const lengths = new Map();
function lengthOf(rel) {
  if (!lengths.has(rel)) {
    const abs = path.join(repo, rel);
    lengths.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n').length : null);
  }
  return lengths.get(rel);
}

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
  return out;
}

const bad = [];
let cited = 0;
for (const c of concepts) {
  for (const text of strings(c)) {
    for (const [, file, spec] of text.matchAll(CITE)) {
      const total = lengthOf(file);
      for (const part of spec.split(',')) {
        cited += 1;
        const [from, to = from] = part.split('-').map(Number);
        if (total == null) bad.push(`${c.id}: ${file} does not exist`);
        else if (from < 1 || to < from || to > total) bad.push(`${c.id}: ${file}:${part} is outside 1-${total}`);
      }
    }
  }
}

const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
for (const c of concepts) {
  if (!(c.status in counts)) bad.push(`${c.id}: unknown status "${c.status}"`);
  else counts[c.status] += 1;
}

console.log(`concepts: ${concepts.length}`);
for (const s of STATUSES) console.log(`  ${s}: ${counts[s]}`);
console.log(`citations checked: ${cited} across ${lengths.size} files`);
if (bad.length) {
  console.error(`bad citations: ${bad.length}`);
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.log('bad citations: 0');
