/**
 * CHG-141: the Next checks, chosen by what the window is. Links only: a tick could not be saved, so there is none. Each
 * says what to do and where, and the page runs the action, so a check never loses the loop or the window. Links use
 * the helpers in `cpaHref`.
 */
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { explorerHref, historicalHref, pipelineHref, registryHref, windowsHref } from '../cpaHref';
import { conditionOf } from '../explorer/summary/summaryText';
import { QUIET, TIER_GROUPS, gateMark } from '../gateStatus';

export type CheckAction =
  | { kind: 'link'; to: string }
  | { kind: 'signals' }
  | { kind: 'gate'; gate: string }
  | { kind: 'proof'; gate: string }
  | { kind: 'hypotheses' }
  | { kind: 'compare' }
  | { kind: 'mode' };

export interface NextCheck { label: string; link: string; action: CheckAction }

const SIGNALS: NextCheck = { label: 'Compare PV, SP and OP over the same window', link: 'Signals ↗', action: { kind: 'signals' } };

const speaking = (matrix: CpmGateMatrix, keys: readonly string[]): string[] =>
  keys.filter(gate => !QUIET.has(gateMark(matrix.gates.find(c => c.key === gate)?.status, gate).meaning));

const tierKeys = (label: string) => TIER_GROUPS.find(t => t.label === label)?.keys ?? [];

/** The gates behind a finding: its symptoms, else its performance checks, else the decision. */
function contributing(matrix: CpmGateMatrix): string[] {
  const symptoms = speaking(matrix, tierKeys('Diagnostic evidence'));
  if (symptoms.length) return symptoms;
  const performance = speaking(matrix, tierKeys('Performance'));
  return performance.length ? performance : ['G15'];
}

function excludedChecks(matrix: CpmGateMatrix, historical: CheckAction): NextCheck[] {
  const limit: NextCheck[] = speaking(matrix, ['G10']).length
    ? [{ label: 'Review the open output-limit condition', link: 'G10 proof ↗', action: { kind: 'proof', gate: 'G10' } }]
    : [];
  if ((matrix.diagnosis ?? '').toUpperCase() === 'EXCLUDED_MODE') {
    return [
      { label: 'Confirm whether manual operation was intended', link: 'Mode context ↗', action: { kind: 'mode' } },
      { label: 'Review how this loop entered manual mode', link: 'Historical ↗', action: historical },
      ...limit,
    ];
  }
  const gate = TIER_GROUPS.flatMap(t => t.keys).find(k => gateMark(matrix.gates.find(c => c.key === k)?.status, k).meaning === 'excluded') ?? 'G1';
  return [
    { label: 'Review why this window was excluded', link: `${gate} proof ↗`, action: { kind: 'proof', gate } },
    { label: 'Review this period', link: 'Historical ↗', action: historical },
    ...limit,
  ];
}

export function nextChecks(matrix: CpmGateMatrix, opts: { loopId: string; windowKind: string; /** The user may open Pipeline Health. */ canPipeline?: boolean }): NextCheck[] {
  const { loopId, windowKind } = opts;
  const historical: CheckAction = {
    kind: 'link',
    to: historicalHref(loopId, { from: matrix.windowStart, to: matrix.windowEnd, window: matrix.windowEnd, kind: windowKind }),
  };
  switch (conditionOf(matrix.diagnosis).kind) {
    case 'finding': {
      const gates = contributing(matrix);
      return [
        SIGNALS,
        { label: 'Inspect the checks contributing to this diagnosis', link: `${gates.join(' / ')} ↗`, action: { kind: 'gate', gate: gates[0] } },
        { label: 'Review evidence for the physical cause', link: 'Hypotheses ↗', action: { kind: 'hypotheses' } },
      ];
    }
    case 'excluded': return excludedChecks(matrix, historical);
    case 'insufficient': return [
      { label: 'See the samples each window received', link: 'Window Inspector ↗', action: { kind: 'link', to: windowsHref(loopId, { profile: windowKind, window: matrix.windowEnd }) } },
      { label: 'Check the signal mapping', link: 'Loop Registry ↗', action: { kind: 'link', to: registryHref(loopId) } },
      { label: 'Review when the data stopped', link: 'Historical ↗', action: historical },
    ];
    case 'not-evaluated': return [
      { label: 'Check what the loop is still missing', link: 'Loop Explorer ↗', action: { kind: 'link', to: explorerHref(loopId, { tab: 'Summary', kind: windowKind }) } },
      ...(opts.canPipeline ? [{ label: 'Check that the analysis engine is running', link: 'Pipeline Health ↗', action: { kind: 'link' as const, to: pipelineHref() } }] : []),
    ];
    default: return [
      SIGNALS,
      { label: 'Review earlier windows', link: 'Compare windows ↗', action: { kind: 'compare' } },
    ];
  }
}
