/**
 * Bulk-import CSV contract and parser — the column vocabulary, the row shape,
 * an RFC-4180-ish line splitter, plant-location validation and the row->request
 * mapping. Pure logic, split out of BulkImportDialog so the dialog stays inside
 * the repo's file-size limit and the parser can be reasoned about on its own.
 */
import type { CpmLoop } from '../../api/cpmApi';
import type { PlantLocation, SignalRole } from './plantLocation';
import {
  SIGNAL_ROLES, areasOf, deriveSignalPath, historianNode, isResolvablePath,
  loopIdProblem, unitsOf, usePlantLocations,
} from './plantLocation';

export const CSV_HEADERS = [
  'tag', 'service', 'site', 'area', 'unit', 'loop_type', 'criticality',
  'pv_tag', 'sp_tag', 'op_tag', 'mode_tag', 'vp_tag', 'profile',
  // Engineering ranges. Optional, but they change how gates compute: PV range
  // scales the good-error band behind G3/OCE (undeclared it is a fixed +/-0.5 EU,
  // unreachable for a loop in engineering units), OP range normalises the output
  // to 0-100 before saturation (G10) and operating region (G2r).
  'pv_min', 'pv_max', 'op_min', 'op_max',
] as const;

/**
 * Only these columns must be present. The signal-path columns are optional
 * because a blank one is DERIVED from site/[area/]unit + tag — hand-typing four
 * long paths per row was the single largest source of import errors, and a
 * mistyped one silently onboards a loop pointed at nothing.
 */
export const REQUIRED_COLUMNS = ['tag', 'service', 'site', 'loop_type'] as const;

/** Uploaded-file ceiling — 2 MB is roughly 20 000 rows, far past a sane batch. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
/** Rows rendered in the preview; past this the table itself is the slow part. */
export const PREVIEW_LIMIT = 100;

/** Source → Review → Activate. Validation is entirely client-side, so review is
 *  a real gate rather than a formality: nothing is sent until the last step. */
export const IMPORT_STEPS = [
  { title: 'Import file' },
  { title: 'Review & validate' },
  { title: 'Activate' },
] as const;
/**
 * Server-side ceiling for one bulk import (cplm-api MaxBulkLoops). The whole file
 * goes in ONE request, so the gateway's 120-mutations-per-minute window no longer
 * caps a batch — the bound is request size and the gateway's 120s timeout.
 */
export const MAX_BULK_LOOPS = 5000;

export const ROLE_COLUMN: Record<SignalRole, string> = {
  pv: 'pv_tag', sp: 'sp_tag', op: 'op_tag', mode: 'mode_tag', vp: 'vp_tag',
};

export interface CsvRow {
  values: Record<string, string>;
  tag: string;
  location: PlantLocation;
  loopType: string;
  criticality: string;
  paths: Record<SignalRole, { path: string; derived: boolean }>;
  /** Declared bounds only — an omitted one must stay omitted, not become 0. */
  engineering: Record<string, number> | null;
  problems: string[];
  warnings: string[];
  existing: boolean;
}

/**
 * LR1 — split one CSV line respecting double quotes (RFC-4180 style: quoted
 * cells may contain commas, "" escapes a quote). The old naive split(',')
 * meant a service description like "Reactor 1, feed flow" shifted every
 * following column — and because the shifted row could still pass the
 * required-fields check, it ACTIVATED a loop with wrong tag paths.
 */
/** pv_min -> pvMin, op_max -> opMax: the CSV is snake_case, the API camelCase. */
const camelBound = (col: string): string =>
  col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Blank -> undefined (undeclared); unparseable -> null (a row problem). */
export function parseBound(text: string | undefined): number | null | undefined {
  const t = (text ?? '').trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

export type KnownLocations = ReturnType<typeof usePlantLocations>['data'];

/** Non-blocking: a location outside the asset model still onboards, but its
 *  signal assets land outside the plant hierarchy. Worth seeing before import. */
export function locationWarnings(known: KnownLocations, loc: PlantLocation): string[] {
  if (!known || known.sites.length === 0 || !loc.site) return [];
  const sites = known.sites.map(s => s.contextualPath.split('/')[0]);
  if (!sites.includes(loc.site)) return [`site "${loc.site}" is not in the asset model`];
  const out: string[] = [];
  if (loc.area && !areasOf(known.areas, loc.site).includes(loc.area))
    out.push(`area "${loc.area}" is not under site "${loc.site}"`);
  if (loc.unit && !unitsOf(known.units, loc.site, loc.area).includes(loc.unit))
    out.push(`unit "${loc.unit}" is not under ${[loc.site, loc.area].filter(Boolean).join('/')}`);
  return out;
}

export function parseCsv(
  text: string, existingLoops: CpmLoop[], known: KnownLocations, loopTypes: string[],
): { missing: string[]; unknownColumns: string[]; rows: CsvRow[] } {
  const existingTags = new Set(existingLoops.map(l => l.loopId.toUpperCase()));
  // Historian device node → the loop that already owns it (see the wizard's
  // nodeClash): punctuation-only differences merge two loops onto one series.
  const existingNodes = new Map(existingLoops.map(l => [historianNode(l.loopId), l.loopId]));
  const seenNodes = new Map<string, string>();
  // '#' starts a comment line: templates and generated fixtures annotate
  // themselves, and '#' can never begin a real tag (it is a forbidden character).
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length === 0) return { missing: [...REQUIRED_COLUMNS], unknownColumns: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter(h => !headers.includes(h));
  // A misspelled header would otherwise be read as "column absent" and its
  // values silently dropped.
  const unknownColumns = headers.filter(h => h && !CSV_HEADERS.includes(h as typeof CSV_HEADERS[number]));
  const seen = new Set<string>();
  const rows: CsvRow[] = lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};
    headers.forEach((h, i) => { values[h] = (cells[i] ?? '').trim(); });
    const problems: string[] = [];
    const warnings: string[] = [];
    // A mis-shaped row means every cell after the fault is in the wrong column —
    // never let it through on the strength of accidentally-non-empty cells.
    if (cells.length !== headers.length)
      problems.push(`${cells.length} cell(s) for ${headers.length} column(s) — quote any value containing a comma`);

    const tag = (values['tag'] ?? '').toUpperCase();
    for (const req of REQUIRED_COLUMNS) if (!values[req]) problems.push(`missing ${req}`);
    const idIssue = loopIdProblem(tag);
    if (idIssue) problems.push(`loop tag "${tag}": ${idIssue}`);
    const isDuplicate = !!tag && seen.has(tag);
    if (isDuplicate) problems.push('duplicate tag in file');
    seen.add(tag);
    // A duplicate necessarily collides with itself in the historian; reporting
    // both would just be noise on the same row.
    if (tag && !idIssue && !isDuplicate) {
      const node = historianNode(tag);
      const priorInFile = seenNodes.get(node);
      const priorInRegistry = existingNodes.get(node);
      if (priorInFile)
        problems.push(`historian collision with "${priorInFile}" in this file — both become device ${node}`);
      else if (priorInRegistry && priorInRegistry.toUpperCase() !== tag)
        problems.push(`historian collision with registered loop "${priorInRegistry}" — both become device ${node}`);
      seenNodes.set(node, tag);
    }

    const loopType = (values['loop_type'] ?? '').toUpperCase();
    if (loopType && loopTypes.length && !loopTypes.includes(loopType))
      problems.push(`loop_type "${loopType}" is not one of ${loopTypes.join(', ')}`);
    // The server only accepts lowercase criticality; normalising is unambiguous
    // so it is fixed rather than rejected.
    const criticality = (values['criticality'] ?? '').toLowerCase();
    if (criticality && !['low', 'medium', 'high', 'critical'].includes(criticality))
      problems.push(`criticality "${values['criticality']}" must be low, medium, high or critical`);

    const location: PlantLocation = {
      site: values['site'] ?? '', area: values['area'] ?? '', unit: values['unit'] ?? '',
    };
    warnings.push(...locationWarnings(known, location));

    const paths = {} as CsvRow['paths'];
    for (const role of SIGNAL_ROLES) {
      const given = values[ROLE_COLUMN[role]] ?? '';
      if (given && !isResolvablePath(given))
        problems.push(`${ROLE_COLUMN[role]} "${given}" is not a UNS contextual path (site/[area/]unit/loop.${role})`);
      // VP is opt-in — deriving it for every loop would map a position signal
      // most loops do not have.
      const path = given || (role === 'vp' ? '' : deriveSignalPath(location, tag, role));
      if (!path && role !== 'vp') problems.push(`cannot derive ${role} path — give ${ROLE_COLUMN[role]} or a site`);
      paths[role] = { path, derived: !given && !!path };
    }
    if (Object.values(paths).some(p => p.derived)) warnings.push('signal paths derived from location');

    // Engineering ranges: only declared bounds ride along, and a half-declared
    // pair is flagged because the API defaults the missing bound (0 / 100),
    // inventing a span nobody wrote down.
    const engineering: Record<string, number> = {};
    for (const col of ['pv_min', 'pv_max', 'op_min', 'op_max'] as const) {
      const bound = parseBound(values[col]);
      if (bound === null) problems.push(`${col} '${values[col]}' is not a number`);
      else if (bound !== undefined) engineering[camelBound(col)] = bound;
    }
    for (const [lo, hi, label] of [['pv_min', 'pv_max', 'PV'], ['op_min', 'op_max', 'OP']] as const) {
      if ((values[lo] ?? '').trim() === '' !== ((values[hi] ?? '').trim() === ''))
        warnings.push(`${label} range is half-declared — the missing bound defaults (0 / 100)`);
    }

    return {
      values, tag, location, loopType, criticality, paths,
      engineering: Object.keys(engineering).length > 0 ? engineering : null,
      problems, warnings, existing: existingTags.has(tag),
    };
  });
  return { missing, unknownColumns, rows };
}
