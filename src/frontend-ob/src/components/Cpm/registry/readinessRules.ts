/**
 * CHG-201 (owner, 15 Nov 2026): ONE rule for "Ready for analysis", shared by the Loop Registry list column and the Loop detail
 * page's checklist, so the two always agree on the loop record. What a person must set before the analysis can judge the loop:
 *
 *  - the process value, setpoint, output and mode connected;
 *  - the process value unit and range, and the output range, set;
 *  - the valve position connected, only where one is expected (optionalInputs.inputContextOf);
 *  - linked loops, only where they are expected (optionalInputs.peerApplicabilityOf); CHG-203: its how in one short sentence,
 *    the one cplm-api's peer_links message also sends (CpmReadinessController.PeerLinksMessage);
 *  - monitoring on (a retired loop is not asked) and a loop type, only when they are not;
 *  - from the server readiness (the detail page reads it): signals the plant model does not hold (binding_provenance).
 *
 * Data arriving is shown per signal on the detail page, the analysis output on the analysis pages, and a system-wide condition
 * (analysis jobs not running, the binding service not answering) on Pipeline Health, so none of them is an item here.
 */
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import { inputContextOf, peerApplicabilityOf } from '../optionalInputs';
import { isMapped } from './loopFacts';

export type ReadinessKey = 'signals' | 'ranges' | 'vp' | 'links' | 'monitoring' | 'loopType' | 'plantModel';

export interface ReadinessItem {
  key: ReadinessKey;
  ok: boolean;
  title: string;
  /** Why it matters and how to fix it; only on a missing item. */
  why?: string;
}

export interface LoopReadiness { items: ReadinessItem[]; missing: number }

const SIGNALS: Array<[role: string, name: string]> = [['PV', 'process value'], ['SP', 'setpoint'], ['OP', 'output'], ['MODE', 'mode']];

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a", "a and b", "a, b and c". */
const listOf = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const set = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n);

function signalsItem(loop: CpmLoop): ReadinessItem {
  const missing = SIGNALS.filter(([role]) => !isMapped(loop, role)).map(([, name]) => name);
  if (missing.length === 0) return { key: 'signals', ok: true, title: 'Process value, setpoint, output and mode connected' };
  return {
    key: 'signals', ok: false, title: `${sentenceCase(listOf(missing))} not connected`,
    why: `Every check reads the process value, setpoint, output and mode. Connect ${missing.length === 1 ? 'it' : 'them'} in Edit loop.`,
  };
}

function rangesItem(loop: CpmLoop): ReadinessItem {
  const e = loop.engineering ?? {};
  const missing = [
    !e.pvUnit?.trim() && 'process value unit',
    !(set(e.pvMin) && set(e.pvMax)) && 'process value range',
    !(set(e.opMin) && set(e.opMax)) && 'output range',
  ].filter((w): w is string => !!w);
  if (missing.length === 0) return { key: 'ranges', ok: true, title: 'Units and ranges set' };
  return {
    key: 'ranges', ok: false, title: 'Units and ranges not set',
    why: `The checks judge the control error and the output against the ranges, and values are shown in the unit. Set the ${listOf(missing)} in Edit loop.`,
  };
}

/** The server readiness's unmet setup check the loop record cannot show: a signal the plant model does not hold. */
function plantModelItem(server: Pick<CpmReadiness, 'checks'> | undefined): ReadinessItem | null {
  const check = server?.checks.find(c => c.id === 'binding_provenance');
  if (!check || check.ok || /unreachable/i.test(check.message ?? '')) return null;
  return {
    key: 'plantModel', ok: false, title: 'Signals not in the plant model',
    why: 'Their data may not reach the analysis. Use Resend to analysis to add them to the plant model.',
  };
}

export function loopReadiness(loop: CpmLoop, server?: Pick<CpmReadiness, 'checks'>): LoopReadiness {
  const items: ReadinessItem[] = [signalsItem(loop), rangesItem(loop)];
  if (inputContextOf(loop)!.vp === 'EXPECTED') {
    items.push(isMapped(loop, 'VP')
      ? { key: 'vp', ok: true, title: 'Valve position connected' }
      : { key: 'vp', ok: false, title: 'Valve position not connected',
        why: 'The valve checks (sticking, wear) need it. Connect it in Edit loop, or mark the valve position as not fitted.' });
  }
  if (peerApplicabilityOf(loop) === 'EXPECTED') {
    items.push(loop.links.length > 0
      ? { key: 'links', ok: true, title: 'Linked loops set' }
      : { key: 'links', ok: false, title: 'No linked loops',
        why: 'Link its interacting loops in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop.' });
  }
  if (loop.isActive && !loop.monitoringEnabled) {
    items.push({ key: 'monitoring', ok: false, title: 'Monitoring off',
      why: 'The analysis skips this loop while monitoring is off. Turn it on in Edit loop.' });
  }
  const type = (loop.loopType ?? '').trim().toUpperCase();
  if (!type || type === 'UNKNOWN') {
    items.push({ key: 'loopType', ok: false, title: 'Loop type not set',
      why: 'The cycle-shape checks stay off without it. Choose the type in Edit loop if one fits.' });
  }
  const plant = plantModelItem(server);
  if (plant) items.push(plant);
  return { items, missing: items.filter(i => !i.ok).length };
}

export interface Pill { label: string; tone: 'muted' | 'warn'; glyph: string }

/** The readiness in one pill: a neutral "✓ Ready" (owner Q3: no green for a normal state), or "! n items to set" in amber. */
export const readinessPill = (missing: number): Pill => (missing === 0
  ? { label: 'Ready', tone: 'muted', glyph: '✓' }
  : { label: `${missing} ${missing === 1 ? 'item' : 'items'} to set`, tone: 'warn', glyph: '!' });
