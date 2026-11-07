/**
 * Task 18: the Evidence package as one zip. manifest.json says what the package is and lists each file with its size; the
 * other file is the window's evidence package (verdict, every gate, metrics, evidence manifests, signal samples). Pure.
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

export async function buildEvidenceZip(i: ZipInput): Promise<Uint8Array> {
  const { row: w } = i;
  const size = new TextEncoder().encode(i.packageJson).length;
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
    files: [{ name: PACKAGE_FILE, bytes: size, holds: 'verdict, every gate, metrics, evidence manifests, signal samples' }],
    note: 'This package records what was retained for the window. Retained evidence is not proof that it was sufficient.',
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(PACKAGE_FILE, i.packageJson);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
