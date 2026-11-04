#!/usr/bin/env node
// Generates src/help/registry.json from docs/theme/deep/help-registry-draft.md, which stays the
// source (SPEC 6.7, DEC-002 RD10). Re-run after any draft change. Run: node scripts/redesign/build-help-registry.mjs
//
// No word of a definition changes. Two things are separated out, because operators must not read
// implementation (SPEC principle 5):
//   - source citations move to `citations`, and where each one sat goes to registry.anchors.json,
//     so src/help/registry.test.ts can put them back and compare with the draft byte for byte;
//   - the marker "(as implemented, pending approval (Q7))" becomes `status: 'as-implemented'`.
//
// Anything the parser cannot place stops the build and nothing is written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRAFT = path.resolve(app, '../../docs/theme/deep/help-registry-draft.md');
const HELP = path.join(app, 'src/help');

const MARKER = ' (as implemented, pending approval (Q7))';
const FIELDS = [
  ['What it measures', 'what'],
  ['Formula', 'formula'],
  ['Window and eligibility', 'window'],
  ['Unit', 'unit'],
  ['Source and version', 'source'],
  ['Link target', 'link'],
  ['Register status', 'registerStatus'],
];
const KEY_OF = new Map(FIELDS);

const PATH = String.raw`(?:[\w.-]+/)*[\w.-]+\.(?:cs|java|tsx?|jsx?|md|sql|json|py|mjs|ya?ml|ps1)(?::[\d,-]+)?`;
const WHOLE_CITATION = new RegExp(String.raw`^(?:[^;]*?[ ,:] )?${PATH}$`);
const BARE_PATH = new RegExp(String.raw`(?<![\w/.-])${PATH}`);
const GROUP = / \(([^()]*)\)/g;
/** Anything still looking like a source reference after extraction is an unhandled entry. */
const LEFTOVER = new RegExp(String.raw`(?:^|[\s(])(?:src|docs|infra|database|scripts|kpi_calculation_logic)/|${PATH.replace('(?::[\\d,-]+)?', '')}\b`);

const problems = [];
const moved = [];
const labelled = [];

/** Blanks a span while keeping every later index valid. */
const blank = (text, from, to) => text.slice(0, from) + ' '.repeat(to - from) + text.slice(to);

/** Whole parentheticals made only of citations, plus any bare citation with its whole sentence. */
function citationSpans(id, field, text) {
  const spans = [];
  let rest = text;
  for (const m of text.matchAll(GROUP)) {
    const parts = m[1].split('; ');
    if (!parts.every(p => WHOLE_CITATION.test(p))) continue;
    spans.push({ from: m.index, to: m.index + m[0].length, parts, sentence: false });
    rest = blank(rest, m.index, m.index + m[0].length);
    for (const p of parts) if (!new RegExp(`^${PATH}$`).test(p)) labelled.push(`${id} ${field}: ${p}`);
  }
  for (let bare = rest.match(BARE_PATH); bare; bare = rest.match(BARE_PATH)) {
    const before = rest.lastIndexOf('. ', bare.index);
    const after = rest.indexOf('. ', bare.index + bare[0].length);
    const from = before + 1;
    const to = after < 0 ? rest.length : after + 1;
    if (before < 0) {
      problems.push(`${id} ${field}: a bare citation opens the field: ${bare[0]}`);
      break;
    }
    const raw = text.slice(from, to);
    const inside = spans.filter(s => s.from >= from && s.to <= to);
    for (const s of inside) spans.splice(spans.indexOf(s), 1);
    spans.push({ from, to, parts: [raw.trimStart()], sentence: true });
    rest = blank(rest, from, to);
    moved.push(`${id} ${field}: ${raw.trimStart()}`);
  }
  return spans.sort((a, b) => a.from - b.from);
}

/** Takes the citations out of one field, recording where each sat in the cleaned text. */
function separate(id, field, text) {
  const citations = [];
  const anchors = [];
  let clean = '';
  let cursor = 0;
  for (const s of citationSpans(id, field, text)) {
    clean += text.slice(cursor, s.from);
    cursor = s.to;
    anchors.push({ field, at: clean.length, count: s.parts.length, ...(s.sentence ? { sentence: true } : {}) });
    citations.push(...s.parts);
  }
  clean += text.slice(cursor);
  if (text && !clean.trim()) problems.push(`${id} ${field}: nothing is left once the citations are out`);
  if (LEFTOVER.test(clean)) problems.push(`${id} ${field}: source reference left in the text: ${clean.match(LEFTOVER)[0]}`);
  return { clean, citations, anchors };
}

function parseEntry(heading, group, body) {
  const id = heading[1];
  const values = {};
  const citations = [];
  const anchors = [];
  let marked = 0;
  for (const line of body) {
    const m = line.match(/^- \*\*(.+?):\*\*(?: (.*))?$/);
    const key = m && KEY_OF.get(m[1]);
    if (!key) { problems.push(`${id}: not a field line: ${line.slice(0, 80)}`); continue; }
    if (key in values) { problems.push(`${id}: ${m[1]} appears twice`); continue; }
    let text = m[2] ?? '';
    if (text.endsWith(MARKER)) { text = text.slice(0, -MARKER.length); marked += 1; }
    if (text.includes('pending approval (Q7)')) problems.push(`${id} ${key}: the marker is not at the end of the field`);
    const parts = separate(id, key, text);
    values[key] = parts.clean;
    citations.push(...parts.citations);
    anchors.push(...parts.anchors);
  }
  if (Object.keys(values).join() !== FIELDS.map(f => f[1]).join()) problems.push(`${id}: fields are missing or out of order`);
  if (marked !== 0 && marked !== FIELDS.length) problems.push(`${id}: only ${marked} of ${FIELDS.length} fields carry the marker`);
  const { what, formula, window, unit, source, link, registerStatus } = values;
  return {
    entry: {
      id, name: heading[2], group, what, formula, window, unit, source, link,
      status: marked ? 'as-implemented' : 'approved',
      registerStatus, citations,
    },
    anchors,
  };
}

function parseDraft(markdown) {
  const registry = {};
  const anchors = {};
  let group = null;
  let heading = null;
  let body = [];
  const flush = () => {
    if (!heading) return;
    if (heading[1] in registry) problems.push(`${heading[1]}: heading appears twice`);
    const parsed = parseEntry(heading, group, body);
    registry[heading[1]] = parsed.entry;
    anchors[heading[1]] = parsed.anchors;
    heading = null;
    body = [];
  };
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const h3 = line.match(/^### (M-\d{3}) (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    if (h3 || h2) flush();
    if (h3) { if (!group) problems.push(`${h3[1]}: entry before the first section`); heading = h3; }
    else if (h2) group = h2[1];
    else if (line.startsWith('### ')) problems.push(`heading the parser cannot read: ${line}`);
    else if (heading && line.trim()) body.push(line);
  }
  flush();
  return { registry, anchors };
}

const { registry, anchors } = parseDraft(fs.readFileSync(DRAFT, 'utf8'));
const ids = Object.keys(registry);

if (problems.length) {
  console.error(`help registry: ${problems.length} problem(s), nothing written`);
  console.error(problems.join('\n'));
  process.exit(1);
}

fs.mkdirSync(HELP, { recursive: true });
fs.writeFileSync(path.join(HELP, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
const anchorLines = ids.map(id => `  ${JSON.stringify(id)}: ${JSON.stringify(anchors[id])}`);
fs.writeFileSync(path.join(HELP, 'registry.anchors.json'), `{\n${anchorLines.join(',\n')}\n}\n`);

const citationCount = ids.reduce((n, id) => n + registry[id].citations.length, 0);
console.log(`help registry: ${ids.length} entries, ${citationCount} citations, ${moved.length} moved as whole sentences, ${labelled.length} with a label`);
for (const line of moved) console.log(`  sentence  ${line}`);
for (const line of new Set(labelled.map(l => l.replace(/^\S+ \S+ /, '')))) console.log(`  labelled  ${line}`);
