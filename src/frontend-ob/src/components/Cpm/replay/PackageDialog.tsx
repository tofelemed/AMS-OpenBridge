/**
 * Task 18: Evidence package. Builds the window's package from the same inputs as the Historical page and downloads it as
 * one zip. A failure is said on screen, with its reason; nothing is downloaded then. A part that could not be read is named
 * after the download. Closing the dialog cancels a build in progress: no download fires.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { evidencePackage, type ExportContext } from '../historical/historyExports';
import { buildEvidenceZip, type PackagePart } from './packageZip';

const stamp = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace(/:/g, '') : 'window');

export const PackageDialog: React.FC<{
  open: boolean; onClose: () => void; loopId: string; loop?: CpmLoop; row: CpmGateMatrix; series: string; timeZone: string;
}> = ({ open, onClose, loopId, loop, row, series, timeZone }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<PackagePart[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const close = () => { abort.current?.abort(); onClose(); };

  const download = async () => {
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true); setError(null); setMissing([]);
    try {
      const ctx: ExportContext = {
        loopId, loop, timeZone, series,
        from: new Date(row.windowStart ?? Date.now()), to: new Date(row.windowEnd ?? Date.now()),
      };
      const packageJson = await evidencePackage(ctx, row, series, ctl.signal);
      if (ctl.signal.aborted) return;
      const { bytes, parts } = await buildEvidenceZip({ loopId, displayName: loop?.displayName, row, timeZone, packageJson, exported: new Date().toISOString() });
      if (ctl.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `cplm-${loopId}-${row.windowKind}-${stamp(row.windowEnd)}-evidence-package.zip`; a.click();
      URL.revokeObjectURL(url);
      setMissing(parts.filter(p => p.status !== 'included'));
    } catch (e) {
      if (!ctl.signal.aborted) setError(`Evidence package failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Evidence package"
      description="One zip of this window: its verdict, every gate, its metrics, the evidence manifests and the signal samples."
      footer={<>
        <ObcButton variant="flat" onClick={close}>Close</ObcButton>
        <ObcButton variant="raised" disabled={busy} onClick={() => void download()}>{busy ? 'Building…' : 'Download package'}</ObcButton>
      </>}>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
      {missing.length > 0 && (
        <p className="cpm-field__error" role="alert">
          Downloaded, but not complete: {missing.map(p => `${p.part} ${p.status === 'failed' ? `could not be read (${p.detail})` : 'is not held for this window'}`).join('; ')}. manifest.json says so.
        </p>
      )}
    </Dialog>
  );
};
