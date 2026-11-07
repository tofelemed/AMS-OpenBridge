/**
 * Task 18: the Evidence package as one zip. manifest.json says what the package is and lists each file with its size and
 * what each part of it actually holds: `evidencePackage()` turns a failed KPI or evidence-manifest read into an error
 * note inside the JSON, so each part is read back and a part that failed or is empty is named, never claimed. Pure.
 */
import JSZip from 'jszip';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { zoneLabel } from '../evidence/timezone';

export const PACKAGE_FILE = 'evidence-package.json';

export interface ZipInput {
  loopId: string;
  displayName?: string | null;
  row: CpmGateMatrix;
  timeZone: string;
  /** The evidence package JSON, as `evidencePackage()` builds it. */
  packageJson: string;
  exported: string;
}

export interface PackagePart { part: string; status: 'included' | 'none held' | 'failed'; detail?: string }

const isNote = (v: unknown): v is { error: unknown } => !!v && typeof v === 'object' && 'error' in (v as object);

/** What the package JSON really holds for the two parts that can fail quietly. */
export function packageParts(packageJson: string): PackagePart[] {
  let pkg: { metrics?: unknown; evidence?: { manifests?: unknown } };
  try { pkg = JSON.parse(packageJson); } catch { return [{ part: 'package', status: 'failed', detail: 'it could not be read back' }]; }
  const part = (name: string, v: unknown): PackagePart =>
    isNote(v) ? { part: name, status: 'failed', detail: String(v.error) } : v == null ? { part: name, status: 'none held' } : { part: name, status: 'included' };
  return [part('metrics', pkg.metrics), part('evidence manifests', pkg.evidence?.manifests)];
}

export async function buildEvidenceZip(i: ZipInput): Promise<{ bytes: Uint8Array; parts: PackagePart[] }> {
  const { row: w } = i;
  const size = new TextEncoder().encode(i.packageJson).length;
  const parts = packageParts(i.packageJson);
  const manifest = {
    content: 'CPA evidence package - one evaluated window',
    exported: i.exported,
    loop: { loopId: i.loopId, displayName: i.displayName ?? null },
    window: {
      kind: w.windowKind, startUtc: w.windowStart, endUtc: w.windowEnd,
      timeZone: zoneLabel(i.timeZone, w.windowEnd ? Date.parse(w.windowEnd) : Date.now()),
    },
    run: {
      result: w.metadata?.replayId ? 'Re-run' : 'Original', replayId: w.metadata?.replayId ?? null,
      methodRunIds: w.methodRunIds ?? {}, bundleHash: w.bundleHash ?? null, resultRevision: w.resultRevision ?? null,
      computedAt: w.metadata?.computedAt ?? null,
    },
    engine: {
      calculationVersion: w.metadata?.calculationVersion ?? null, dynamicsProfileVersion: w.metadata?.dynamicsProfileVersion ?? null,
      sourceCommit: w.metadata?.sourceCommit ?? null, jarSha256: w.metadata?.jarSha256 ?? null,
    },
    files: [{
      name: PACKAGE_FILE, bytes: size,
      parts: [{ part: 'verdict and every gate', status: 'included' }, ...parts, { part: 'signal samples', status: 'included' }],
    }],
    note: 'This package records what was retained for the window. Retained evidence is not proof that it was sufficient.',
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(PACKAGE_FILE, i.packageJson);
  return { bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), parts };
}
