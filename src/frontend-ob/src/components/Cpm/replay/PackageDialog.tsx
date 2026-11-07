/**
 * Task 18: Evidence package. Builds the window's package from the same inputs as the Historical page and downloads it as
 * one zip. A failure is said on screen, with its reason; nothing is downloaded then.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { Dialog } from '../../../ui/Dialog';
import { evidencePackage, type ExportContext } from '../historical/historyExports';
import { buildEvidenceZip, PACKAGE_FILE } from './packageZip';

const stamp = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace(/:/g, '') : 'window');

export const PackageDialog: React.FC<{
  open: boolean; onClose: () => void; loopId: string; loop?: CpmLoop; row: CpmGateMatrix; series: string; timeZone: string;
}> = ({ open, onClose, loopId, loop, row, series, timeZone }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true); setError(null);
    try {
      const ctx: ExportContext = {
        loopId, loop, timeZone, series,
        from: new Date(row.windowStart ?? Date.now()), to: new Date(row.windowEnd ?? Date.now()),
      };
      const packageJson = await evidencePackage(ctx, row, series);
      const bytes = await buildEvidenceZip({ loopId, displayName: loop?.displayName, row, timeZone, packageJson, exported: new Date().toISOString() });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = `cplm-${loopId}-${row.windowKind}-${stamp(row.windowEnd)}-evidence-package.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Evidence package failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Evidence package"
      description="One zip of this window: its verdict, every gate, its metrics, the evidence manifests and the signal samples."
      footer={<>
        <ObcButton variant="flat" onClick={onClose}>Close</ObcButton>
        <ObcButton variant="raised" disabled={busy} onClick={() => void download()}>{busy ? 'Building…' : 'Download package'}</ObcButton>
      </>}>
      <ul className="cpm-copy">
        <li><code>manifest.json</code></li>
        <li><code>{PACKAGE_FILE}</code></li>
      </ul>
      {error && <p className="cpm-field__error" role="alert">{error}</p>}
    </Dialog>
  );
};
