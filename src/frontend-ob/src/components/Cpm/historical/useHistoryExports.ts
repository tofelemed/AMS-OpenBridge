/**
 * CHG-097 (SME review 2 #17): the Historical page's downloads — signal samples, evaluated windows (CSV / JSON) and the
 * selected window's evidence package — with a busy state while the slices are read and the reason when one fails.
 */
import { useState } from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import {
  evidencePackage, fetchSamples, sampleBucketS, samplesCsv, windowsCsv, windowsJson, type ExportContext,
} from './historyExports';

export type HistoryExportKind = 'samples' | 'windows-csv' | 'windows-json' | 'package';

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

const stampOf = (d: Date) => d.toISOString().slice(0, 16).replace(/[:]/g, '');

export function useHistoryExports(args: {
  loopId?: string; loop?: CpmLoop; series?: string; from: Date; to: Date; timeZone: string;
  windows: CpmGateMatrix[]; truncated: boolean; cap: number; selected?: CpmGateMatrix;
}) {
  const [busy, setBusy] = useState<HistoryExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: HistoryExportKind) => {
    const { loopId, loop, series, from, to, timeZone, windows, truncated, cap, selected } = args;
    if (!loopId || !series) return;
    const ctx: ExportContext = { loopId, loop, from, to, timeZone, series };
    const period = `${stampOf(from)}-${stampOf(to)}`;
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'windows-csv') download(`cplm-${loopId}-evaluated-windows-${period}.csv`, 'text/csv', windowsCsv(ctx, windows, truncated, cap));
      else if (kind === 'windows-json') download(`cplm-${loopId}-evaluated-windows-${period}.json`, 'application/json', windowsJson(ctx, windows, truncated, cap));
      else if (kind === 'samples') {
        const { bucketS, coarsened } = sampleBucketS(from, to, loop?.model?.acquisition?.gridSeconds);
        const points = await fetchSamples(series, from, to, bucketS);
        download(`cplm-${loopId}-signal-samples-${period}.csv`, 'text/csv', samplesCsv(ctx, points, bucketS, coarsened));
      } else if (selected) {
        const body = await evidencePackage(ctx, selected, series);
        download(`cplm-${loopId}-${selected.windowKind}-${stampOf(new Date(selected.windowEnd ?? to))}-evidence-package.json`, 'application/json', body);
      }
    } catch (e) {
      setError(`${kind === 'samples' ? 'Signal samples' : kind === 'package' ? 'Evidence package' : 'Export'} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, run, clearError: () => setError(null) };
}
