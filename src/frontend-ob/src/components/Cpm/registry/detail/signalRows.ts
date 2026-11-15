/**
 * CHG-201 (owner, 15 Nov 2026): the rows of the Loop detail page's Signals table. Each role with its plain name and pen, its tag
 * in the control system (loopFacts.sourceTagOf: never the path), its unit and range from the engineering ranges (the PV unit for
 * PV and SP, % for OP) and whether data arrives, read from the loop's readiness: samples reached the analysis (evidence_short),
 * and for the valve position the latest window carried it (tag_vp). Pure.
 */
import type { CpmLoop, CpmReadiness } from '../../../../api/cpmApi';
import { humanise } from '../../vocabulary';
import { inputContextOf } from '../../optionalInputs';
import { sourceTagOf, vpWord } from '../loopFacts';

/** receiving / none (amber) / expected (amber: a missing expected signal) / unknown (readiness not read) / none-expected. */
export type DataState = 'receiving' | 'none' | 'expected' | 'unknown' | 'none-expected';

export const DATA_WORD: Record<DataState, string> = {
  receiving: 'Receiving data', none: 'No data', expected: 'Expected', unknown: '—', 'none-expected': '—',
};

export interface SignalRow {
  role: string;
  name: string;
  /** The pen in the one signal colour source (--signal-*); null for a role that has none. */
  pen: string | null;
  sourceTag: string | null;
  /** Why there is no source tag: Not connected, Not fitted, Not applicable. */
  missing: string | null;
  unit: string;
  range: string;
  data: DataState;
}

const MAIN: Array<{ key: string; role: string; name: string }> = [
  { key: 'PV', role: 'PV', name: 'Process value' },
  { key: 'SP', role: 'SP', name: 'Setpoint' },
  { key: 'OP', role: 'OP', name: 'Controller output' },
  { key: 'MODE', role: 'Mode', name: 'Auto, manual or cascade' },
  { key: 'VP', role: 'VP', name: 'Valve position' },
];
const REQUIRED = new Set(['PV', 'SP', 'OP', 'MODE']);
const DASH = '—';

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 });
const isNum = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const rangeText = (min: number | null | undefined, max: number | null | undefined) =>
  (isNum(min) && isNum(max) ? `${number.format(min)} – ${number.format(max)}` : DASH);

type Readiness = Pick<CpmReadiness, 'checks'> & Partial<Pick<CpmReadiness, 'evidence'>>;

/** Samples reached the analysis: the evidence_short check, else the evidence count; null before the readiness is read. */
function samplesArrive(readiness: Readiness | undefined): boolean | null {
  if (!readiness) return null;
  const check = readiness.checks.find(c => c.id === 'evidence_short');
  if (check) return check.ok;
  return readiness.evidence ? readiness.evidence.shortFeatures > 0 : null;
}

export function signalRows(loop: CpmLoop, readiness: Readiness | undefined): SignalRow[] {
  const e = loop.engineering ?? {};
  const samples = samplesArrive(readiness);
  const vpExpected = inputContextOf(loop)!.vp === 'EXPECTED';
  const vpHeld = readiness?.checks.some(c => c.id === 'tag_vp' && c.state === 'TEMPORARILY_UNAVAILABLE') ?? false;
  const known = new Set(MAIN.map(m => m.key));
  const others = Object.keys(loop.tags ?? {}).map(k => k.toUpperCase()).filter(k => !known.has(k) && !!sourceTagOf(loop, k)).sort();

  const rowOf = (key: string, role: string, name: string, pen: string | null): SignalRow => {
    const sourceTag = sourceTagOf(loop, key);
    const unit = key === 'PV' || key === 'SP' ? e.pvUnit?.trim() || DASH : key === 'OP' ? '%' : DASH;
    const range = key === 'PV' || key === 'SP' ? rangeText(e.pvMin, e.pvMax) : key === 'OP' ? rangeText(e.opMin, e.opMax) : DASH;
    if (!sourceTag) {
      const expected = REQUIRED.has(key) || (key === 'VP' && vpExpected);
      const missing = key === 'VP' ? vpWord(loop).label : 'Not connected';
      return { role, name, pen, sourceTag, missing, unit, range, data: expected ? 'expected' : 'none-expected' };
    }
    const data: DataState = samples === null ? 'unknown' : !samples || (key === 'VP' && vpHeld) ? 'none' : 'receiving';
    return { role, name, pen, sourceTag, missing: null, unit, range, data };
  };

  return [
    ...MAIN.map(m => rowOf(m.key, m.role, m.name, m.key.toLowerCase())),
    ...others.map(k => rowOf(k, humanise(k), `${humanise(k)} signal`, null)),
  ];
}
