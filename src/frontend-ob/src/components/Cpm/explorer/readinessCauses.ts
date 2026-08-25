/**
 * Readiness → a list of structured causes, each routed to the tab that owns it.
 *
 * The screen used to render `readiness.blockers` / `readiness.warnings` — two
 * arrays of flattened prose — as one wall of text at the top of the workspace,
 * and then repeat halves of that same text inside the Signals tab (twice) and
 * the Relationships empty state. Same facts, four surfaces, and the only
 * actionable sentence buried mid-paragraph.
 *
 * `readiness.checks` is the structured form the API already returns
 * (`{id, label, ok, message}`), so causes are built from that instead. The one
 * thing checks do NOT carry is the server's `blocking` flag, so the set below
 * mirrors CpmReadinessController.Check(..., blocking:) — keep the two in step.
 */
import type { CpmReadiness } from '../../../api/cpmApi';

/** Mirrors `blocking: true` in cplm-api's CpmReadinessController. */
const BLOCKING_IDS = new Set([
  'registry_row', 'monitoring_enabled', 'cplm_jobs',
  'tag_pv', 'tag_sp', 'tag_op', 'tag_mode',
]);

export type ExplorerTab = 'Summary' | 'Signals' | 'Calculations' | 'Relationships' | 'History';

export type CauseTarget =
  | { kind: 'tab'; tab: ExplorerTab; label: string }
  | { kind: 'route'; href: string; label: string };

/** Which surface can actually do something about each failing check. */
function targetFor(id: string, loopId: string): CauseTarget | null {
  if (id.startsWith('tag_')) return { kind: 'tab', tab: 'Signals', label: 'Signals' };
  switch (id) {
    case 'binding_provenance':
      return { kind: 'tab', tab: 'Signals', label: 'Signals' };
    case 'peer_links':
      return { kind: 'tab', tab: 'Relationships', label: 'Relationships' };
    case 'evidence_verdict':
      return { kind: 'tab', tab: 'Calculations', label: 'Calculations' };
    case 'loop_type':
    case 'monitoring_enabled':
    case 'registry_row':
      return {
        kind: 'route',
        href: `/cpm/registry?loop=${encodeURIComponent(loopId)}`,
        label: 'Loop Registry',
      };
    case 'evidence_short':
    case 'cplm_jobs':
      return { kind: 'route', href: '/cpm/pipeline', label: 'Pipeline Health' };
    default:
      return null;
  }
}

export interface ReadinessCause {
  id: string;
  label: string;
  message: string;
  blocking: boolean;
  target: CauseTarget | null;
}

export interface ReadinessSummary {
  causes: ReadinessCause[];
  blocking: number;
  /** Headline: a loop producing nothing is a different problem from a capped one. */
  headline: string;
}

export function readinessCauses(
  readiness: CpmReadiness | undefined, loopId: string,
): ReadinessSummary | null {
  if (!readiness) return null;
  const failing = readiness.checks.filter(c => !c.ok);
  if (failing.length === 0) return null;

  const causes: ReadinessCause[] = failing.map(c => ({
    id: c.id,
    label: c.label,
    message: c.message ?? '',
    blocking: BLOCKING_IDS.has(c.id),
    target: targetFor(c.id, loopId),
  }));
  // Blocking first: the reason there is no verdict outranks the reason the
  // verdict is weaker than it could be.
  causes.sort((a, b) => Number(b.blocking) - Number(a.blocking));

  const blocking = causes.filter(c => c.blocking).length;
  return {
    causes,
    blocking,
    headline: blocking > 0 ? 'Not producing verdicts' : 'Degraded evidence',
  };
}
