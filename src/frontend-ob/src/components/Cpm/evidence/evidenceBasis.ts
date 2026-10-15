/**
 * CHG-099 (SME review 2 #18): what the evidence on screen IS. A reconstruction is stored beside the run's retained proof
 * (cplm-api), so the workbench always says which set it shows:
 *   - RETAINED       the live engine's own arrays (the run's proof);
 *   - REBUILT_LOST   no retained proof is complete (expired, failed or never kept), so the newest reconstruction is shown
 *                    by default — labelled as rebuilt (cplm-api stores every reconstruction beside the run's own set);
 *   - RECONSTRUCTION a reconstruction viewed beside the retained proof: its differing artifacts replace the originals in the
 *                    view; identical ones are the retained bytes (never stored twice).
 * Historian context (the signal lanes) is neither: it is labelled where it is drawn. Pure (unit-tested).
 */
import type { EvidenceArtifactMeta, EvidenceManifest, EvidenceReconstruction } from '../../../api/cpm/evidence';
import { formatInZone } from './timezone';

export type BasisKind = 'RETAINED' | 'REBUILT_LOST' | 'RECONSTRUCTION' | 'NONE';

export interface EvidenceBasis { kind: BasisKind; label: string; detail: string; tone: 'muted' | 'warn' }

const sourceText = (s: string | null | undefined) =>
  s === 'iotdb' ? 'the historian' : s === 'kafka' ? 'the samples topic' : 'a source not recorded (run before CHG-099)';

const keyOf = (a: EvidenceArtifactMeta) => `${a.kind}|${a.roleOrPath ?? ''}`;

/** The reconstruction a view names (?view=<analysisRunId>), if the manifest lists it WITH arrays (a superseded or
 * all-identical run has none to show). */
export const reconstructionOf = (m: EvidenceManifest | undefined, view: string | null | undefined): EvidenceReconstruction | undefined =>
  view ? m?.reconstructions?.find(r => r.analysisRunId === view && r.artifacts.length > 0) : undefined;

export const TERMINAL_RUN_STATES: ReadonlySet<string> = new Set(['FINISHED', 'FAILED', 'CANCELED', 'SUBMIT_FAILED']);

/** The reconstruction on screen: the one the URL names, else the newest one with arrays when no retained proof is complete. */
export function effectiveView(m: EvidenceManifest | undefined, view: string | null | undefined): { id: string | null; auto: boolean } {
  if (view && reconstructionOf(m, view)) return { id: view, auto: false };
  if (m && !m.artifacts.some(a => a.readiness === 'COMPLETE')) {
    const r = m.reconstructions?.find(x => x.artifacts.length > 0);
    if (r) return { id: r.analysisRunId, auto: true };
  }
  return { id: null, auto: false };
}

/** The manifest as the view shows it: a reconstruction's differing artifacts in place of the originals of the same kind / role. */
export function viewedManifest(m: EvidenceManifest | undefined, view: string | null | undefined): EvidenceManifest | undefined {
  const eff = effectiveView(m, view);
  const r = reconstructionOf(m, eff.id);
  if (!m || !r || r.artifacts.length === 0) return m;
  const rebuilt = new Map(r.artifacts.map(a => [keyOf(a), a]));
  // nothing retained: the expired tombstones are not shown beside the rebuild
  const base = eff.auto ? m.artifacts.filter(a => a.readiness !== 'EXPIRED') : m.artifacts;
  const artifacts = base.map(a => rebuilt.get(keyOf(a)) ?? a);
  for (const a of r.artifacts) if (!base.some(o => keyOf(o) === keyOf(a))) artifacts.push(a);
  const ready = artifacts.every(a => a.readiness === 'COMPLETE');
  return { ...m, artifacts, count: artifacts.length, readiness: ready ? 'COMPLETE' : r.readiness === 'FAILED' ? 'FAILED' : 'PENDING' };
}

export function reconstructionSummary(r: EvidenceReconstruction, timeZone: string): string {
  const when = formatInZone(Date.parse(r.createdAt), timeZone);
  const parts = [`Reconstructed ${when} from ${sourceText(r.source)}`];
  if (r.readiness === 'PENDING') parts.push('still running');
  else if (r.readiness === 'SUPERSEDED') parts.push('superseded by a newer reconstruction');
  else if (r.readiness === 'NONE') parts.push(r.state === 'UNTRACKED' ? 'its outcome was not recorded' : 'it produced no evidence for this run');
  else if (r.readiness === 'FAILED' && r.artifacts.length === 0) parts.push('the run failed');
  else {
    if (r.differing > 0) parts.push(`${r.differing} artifact(s) differ from the retained proof`);
    if (r.identical > 0) parts.push(`${r.identical} identical`);
    if (r.readiness === 'FAILED') parts.push('a rebuilt artifact failed verification');
  }
  return parts.join(' · ');
}

/** What the evidence on screen is, in words. */
export function basisOf(m: EvidenceManifest | undefined, view: string | null | undefined, timeZone: string): EvidenceBasis {
  if (!m || (m.artifacts.length === 0 && !m.reconstructions?.some(x => x.artifacts.length > 0))) return { kind: 'NONE', label: 'No arrays held', detail: 'Neither retained proof nor a reconstruction is stored for this run.', tone: 'muted' };
  const eff = effectiveView(m, view);
  const r = reconstructionOf(m, eff.id);
  if (r && eff.auto) {
    return { kind: 'REBUILT_LOST', label: 'Rebuilt evidence', tone: 'warn',
      detail: `No retained proof is held for this run, so the rebuilt arrays are shown. ${reconstructionSummary(r, timeZone)}. The verdict was computed by the live engine.` };
  }
  if (r) {
    return { kind: 'RECONSTRUCTION', label: 'Reconstructed evidence', tone: 'warn',
      detail: `${reconstructionSummary(r, timeZone)}. Built by ${r.sourceCommit ? `commit ${r.sourceCommit.slice(0, 8)}` : 'an unrecorded build'}; the retained proof is unchanged.` };
  }
  // rows rebuilt in place before CHG-099 (CHG-076) carry the reconstruction's run id in the run's own set
  if (m.artifacts.some(a => a.basis === 'RECONSTRUCTED')) {
    return { kind: 'REBUILT_LOST', label: 'Rebuilt evidence', tone: 'warn',
      detail: 'These arrays were rebuilt on request by an earlier version, which wrote them over the run\'s original arrays; the originals are no longer held. The verdict was computed by the live engine.' };
  }
  return { kind: 'RETAINED', label: 'Retained proof', tone: 'muted', detail: 'The live engine\'s own arrays for this run, kept by the retention policy.' };
}

/** A pending reconstruction is settled once the manifest lists it with a final readiness (cplm-api keeps it PENDING
 * until the run itself ended, so a half-arrived set never reads as settled). */
export const reconstructionSettled = (m: EvidenceManifest | undefined, analysisRunId: string | undefined): boolean => {
  if (!analysisRunId) return true;
  const r = m?.reconstructions?.find(x => x.analysisRunId === analysisRunId);
  return !!r && r.readiness !== 'PENDING';
};

/** The disabled Reconstruct button's reason, from the API's reconstruction.reason code. */
export function reconstructRefusal(reason: string | null | undefined): string {
  if (reason === 'NOT_RECONSTRUCTABLE_EVENT_KEYED')
    return 'G12 evidence is keyed by response event, not by window: rebuild it from the System Response workspace.';
  return reason ? `Reconstruction is not available for this run (${reason.toLowerCase().replace(/_/g, ' ')}).` : 'Reconstruction is not available for this run.';
}
