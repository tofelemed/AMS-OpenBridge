/**
 * CHG-168 (owner answer 3c): Export CSV, built in the browser from the list the page already holds. The columns are the bulk
 * import's (CSV_HEADERS, the Download template's), so a plant can correct many loops in a spreadsheet and import them back.
 * Only what the registry declares is written: a derived valve-position or peer applicability and an undeclared range stay
 * blank, so a re-import keeps them derived and undeclared. Signal paths are written in full, never derived.
 */
import type { CpmLoop } from '../../../api/cpmApi';
import { CSV_HEADERS } from '../csvImport';

type Column = typeof CSV_HEADERS[number];

/** The import splits lines before cells, so a line break inside a cell becomes a space. */
const cell = (v: unknown): string => {
  const s = v == null ? '' : String(v).replace(/\r?\n|\r/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const tagOf = (loop: CpmLoop, role: string): string =>
  Object.entries(loop.tags ?? {}).find(([k]) => k.toUpperCase() === role)?.[1] ?? '';

function rowOf(loop: CpmLoop): Record<Column, unknown> {
  const e = loop.engineering ?? {};
  return {
    tag: loop.loopId,
    service: loop.displayName,
    site: loop.site,
    area: loop.area,
    unit: loop.unit,
    loop_type: loop.loopType,
    criticality: loop.criticality,
    pv_tag: tagOf(loop, 'PV'),
    sp_tag: tagOf(loop, 'SP'),
    op_tag: tagOf(loop, 'OP'),
    mode_tag: tagOf(loop, 'MODE'),
    vp_tag: tagOf(loop, 'VP'),
    profile: loop.thresholdProfileId,
    pv_min: e.pvMin,
    pv_max: e.pvMax,
    op_min: e.opMin,
    op_max: e.opMax,
    pv_unit: e.pvUnit,
    vp_applicability: e.vpApplicability,
    peer_applicability: e.peerApplicability,
  };
}

export function registryCsv(loops: CpmLoop[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const loop of loops) {
    const row = rowOf(loop);
    lines.push(CSV_HEADERS.map(h => cell(row[h])).join(','));
  }
  return lines.join('\n');
}

/** cplm-loop-registry-2026-11-11.csv, beside the template's cplm-loop-registry-template.csv. */
export const exportFileName = (now: Date = new Date()): string =>
  `cplm-loop-registry-${now.toISOString().slice(0, 10)}.csv`;
