// @vitest-environment node
/**
 * Proof that the generated registry lost nothing (RD10). This file reads the draft itself and shares
 * no code with the generator: each entry is put back together from its fields and compared with the
 * draft's text for that entry, then the whole document is compared the same way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import registry from './registry.json';
import anchorData from './registry.anchors.json';
import { helpFor, type HelpEntry } from './registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const draft = fs
  .readFileSync(path.resolve(here, '../../../../docs/theme/deep/help-registry-draft.md'), 'utf8')
  .replace(/\r\n/g, '\n');

interface Anchor { field: string; at: number; count: number; sentence?: boolean }

const entries = Object.values(registry) as unknown as HelpEntry[];
const anchors = anchorData as unknown as Record<string, Anchor[]>;

const MARKER = ' (as implemented, pending approval (Q7))';
const FIELDS = [
  ['what', 'What it measures'],
  ['formula', 'Formula'],
  ['window', 'Window and eligibility'],
  ['unit', 'Unit'],
  ['source', 'Source and version'],
  ['link', 'Link target'],
  ['registerStatus', 'Register status'],
] as const;

/** Each field's citations go back at their anchors, in draft order. */
function refill(entry: HelpEntry, marks: Anchor[]): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const [key] of FIELDS) texts[key] = entry[key];
  let next = 0;
  for (const [key] of FIELDS) {
    let shift = 0;
    for (const mark of marks.filter(m => m.field === key)) {
      const cited = entry.citations.slice(next, next + mark.count);
      next += mark.count;
      const insert = mark.sentence ? ` ${cited[0]}` : ` (${cited.join('; ')})`;
      const at = mark.at + shift;
      texts[key] = texts[key].slice(0, at) + insert + texts[key].slice(at);
      shift += insert.length;
    }
  }
  expect(next).toBe(entry.citations.length);
  return texts;
}

function reassemble(entry: HelpEntry, marks: Anchor[] = anchors[entry.id]): string {
  const texts = refill(entry, marks);
  const marker = entry.status === 'as-implemented' ? MARKER : '';
  const lines = FIELDS.map(([key, label]) => `- **${label}:** ${texts[key]}${marker}`);
  return [`### ${entry.id} ${entry.name}`, '', ...lines].join('\n');
}

/** The draft's own text per entry, cut on headings only. */
function draftBlocks(): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const block of draft.split(/\n(?=#{2,3} )/)) {
    const id = block.match(/^### (M-\d{3}) /)?.[1];
    if (id) blocks.set(id, block.trimEnd());
  }
  return blocks;
}

const blocks = draftBlocks();
const SOURCE_REF = /\b(?:src|docs|infra|kpi_calculation_logic)\/|\.(?:cs|java|tsx?|md|ya?ml|sql)(?::\d|\b)/;
/** Every path reference in the entries, counted without the generator's grammar. */
const SOURCE_REF_GLOBAL = /(?<![\w/.-])(?:[\w.-]+\/)*[\w.-]+\.(?:cs|java|tsx?|md|ya?ml|sql)(?::[\d,-]+)?(?=[\s;).,]|$)/gm;

describe('help registry is the draft, separated and not rewritten', () => {
  it('holds every M-### heading in the draft, once, in draft order', () => {
    const headings = [...draft.matchAll(/^### (M-\d{3}) /gm)].map(m => m[1]);
    expect(headings.length).toBe(145);
    expect(new Set(headings).size).toBe(headings.length);
    expect(entries.map(e => e.id)).toEqual(headings);
    expect(Object.keys(registry)).toEqual(headings);
    expect(new Set(entries.map(e => e.id)).size).toBe(entries.length);
  });

  it('keys each entry by its own id', () => {
    for (const [key, entry] of Object.entries(registry)) expect(entry.id).toBe(key);
  });

  it('reassembles every entry to the draft text exactly', () => {
    for (const entry of entries) expect(reassemble(entry)).toBe(blocks.get(entry.id));
  });

  it('reassembles the whole document after the preamble exactly', () => {
    const start = draft.search(/^## /m);
    const body: string[] = [];
    let group: string | null = null;
    for (const entry of entries) {
      if (entry.group !== group) {
        group = entry.group;
        body.push(`## ${group}`);
      }
      body.push(reassemble(entry));
    }
    expect(body.join('\n\n').trimEnd()).toBe(draft.slice(start).trimEnd());
  });

  it('can fail: a changed word or a dropped citation no longer matches', () => {
    const entry = entries[0];
    const reworded = { ...entry, what: entry.what.replace('monitored', 'watched') };
    expect(reassemble(reworded)).not.toBe(blocks.get(entry.id));
    const moved = anchors[entry.id].map(a => ({ ...a, at: a.at + 1 }));
    expect(reassemble(entry, moved)).not.toBe(blocks.get(entry.id));
    const swapped = { ...entry, citations: [...entry.citations].reverse() };
    expect(reassemble(swapped)).not.toBe(blocks.get(entry.id));
  });

  it('leaves no field empty unless the draft field is', () => {
    const blockField = (id: string, label: string) =>
      blocks.get(id)?.split('\n').find(l => l.startsWith(`- **${label}:**`))?.slice(label.length + 7) ?? '';
    for (const entry of entries) {
      for (const [key, label] of FIELDS) {
        if (entry[key] === '') expect(blockField(entry.id, label).replace(MARKER, '').trim()).toBe('');
      }
      expect(entry.name).not.toBe('');
      expect(entry.group).not.toBe('');
    }
  });

  it('moves citations and the marker out of what an operator can read', () => {
    for (const entry of entries) {
      for (const [key] of FIELDS) {
        expect(entry[key]).not.toContain('pending approval');
        if (SOURCE_REF.test(entry[key])) expect.fail(`${entry.id} ${key}: ${entry[key]}`);
      }
    }
    const everyCitation = entries.flatMap(e => e.citations);
    const inDraft = [...blocks.values()].flatMap(b => b.match(SOURCE_REF_GLOBAL) ?? []);
    expect(everyCitation.length).toBe(inDraft.length);
  });

  it('turns the marker into a status and keeps known conflicts', () => {
    expect(new Set(entries.map(e => e.status))).toEqual(new Set(['as-implemented']));
    expect(helpFor('M-002')?.registerStatus).toBe('Definition conflict. See M-002 in the register before using this text.');
    expect(helpFor('M-008')?.registerStatus).toContain('Engine-UI conflict');
    expect(helpFor('M-002')?.window).toContain('Differs: all registered on /cpm');
  });

  it('keeps a citation with its label, and a bare citation with its sentence', () => {
    expect(helpFor('M-021')?.citations).toContain('compose default local: infra/docker/docker-compose.yml:1446');
    expect(helpFor('M-078')?.citations).toContain('vw_ columns, src/services/cplm-api/Data/KpiSql.cs:37-48');
    expect(helpFor('M-129')?.citations).toContain('Trigger per kpi_calculation_logic/KPI-AND-APPLICATION-LOGIC.md:214.');
    expect(helpFor('M-001')?.citations[0]).toBe('src/services/cplm-api/Data/FleetKpiSql.cs:65');
  });
});

describe('helpFor', () => {
  it('returns the entry for a known id', () => {
    expect(helpFor('M-001')?.name).toBe('Monitored loops');
    expect(helpFor('M-001')?.group).toBe('Fleet population');
    expect(helpFor('M-001')?.link).toBe('/cpm');
  });

  it('returns undefined for anything else and never throws', () => {
    for (const id of ['M-999', '', 'constructor', '__proto__', 'toString', null, undefined]) {
      expect(helpFor(id)).toBeUndefined();
    }
    expect(helpFor(42 as unknown as string)).toBeUndefined();
  });
});
