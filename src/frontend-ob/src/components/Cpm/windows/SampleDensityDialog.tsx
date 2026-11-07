/**
 * The window's sample density across the selected window, from the raw historian slice (it was a section of the old
 * sub-page; Task 19 fix round 1 returns it as a dialog). The slice is read only while the dialog is open, so selecting
 * a window reads nothing. W1: the budget uses the engine's per-window sample period when the row carries one.
 * W2: when the raw page is capped, buckets past the last fetched sample are UNKNOWN, not empty.
 */
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmKpiRow } from '../../../api/cpmApi';
import { useRawWindow } from '../../../hooks/useCpm';
import { loopSeries } from '../../../utils/loopSeries';
import { Dialog } from '../../../ui/Dialog';
import { EmptyState, QueryError } from '../shared';

const BUCKETS = 24;
/** The engine normalizes samples onto a 5 s grid; used only when the row reports no sample period. */
const FALLBACK_PERIOD_S = 5;

export const SampleDensityDialog: React.FC<{ open: boolean; onClose: () => void; row: CpmKpiRow; loopId: string }> = ({
  open, onClose, row, loopId,
}) => {
  if (!open) return null;
  return createPortal(<Body onClose={onClose} row={row} loopId={loopId} />, document.body);
};

const Body: React.FC<{ onClose: () => void; row: CpmKpiRow; loopId: string }> = ({ onClose, row, loopId }) => {
  const winStart = row.window_start ? new Date(row.window_start) : undefined;
  const winEnd = row.window_end ? new Date(row.window_end) : undefined;
  const raw = useRawWindow(loopSeries(loopId), winStart, winEnd, 'pv', 5000);
  const served = typeof row.sample_period_sec === 'number' && row.sample_period_sec > 0;
  const gridPeriodS = served ? (row.sample_period_sec as number) : FALLBACK_PERIOD_S;
  const rawCapped = raw.data?.hasMore === true;

  const density = useMemo(() => {
    if (!winStart || !winEnd) return [];
    const span = winEnd.getTime() - winStart.getTime();
    if (span <= 0) return [];
    const counts = new Array<number>(BUCKETS).fill(0);
    let lastTs = winStart.getTime();
    for (const p of raw.data?.points ?? []) {
      const i = Math.min(BUCKETS - 1, Math.floor(((p.ts - winStart.getTime()) / span) * BUCKETS));
      if (i >= 0) counts[i] += 1;
      if (p.ts > lastTs) lastTs = p.ts;
    }
    const fetchedUpTo = rawCapped
      ? Math.min(BUCKETS - 1, Math.floor(((lastTs - winStart.getTime()) / span) * BUCKETS))
      : BUCKETS - 1;
    const expectedPerBucket = span / 1000 / gridPeriodS / BUCKETS;
    return counts.map((c, i) => ({
      count: c, ratio: expectedPerBucket > 0 ? c / expectedPerBucket : 0, fetched: i <= fetchedUpTo,
    }));
  }, [raw.data, rawCapped, gridPeriodS, winStart?.getTime(), winEnd?.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps -- Date identity is unstable; time values are the real deps

  /** Spoken form of the strip (its role="img" label). */
  const summary = useMemo(() => {
    if (density.length === 0) return 'Sample density unavailable.';
    const fetched = density.filter(b => b.fetched);
    const empty = fetched.filter(b => b.count === 0).length;
    const sparse = fetched.filter(b => b.count > 0 && b.ratio < 0.6).length;
    const unfetched = density.length - fetched.length;
    return `Sample density across ${density.length} buckets: `
      + `${fetched.length - empty - sparse} at or near the sample budget, `
      + `${sparse} sparse, ${empty} empty`
      + (unfetched ? `, ${unfetched} not fetched so coverage is unknown` : '') + '.';
  }, [density]);

  return (
    <Dialog open onClose={onClose} title="Sample density" footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      {raw.data && <p className="cpm-copy">{raw.data.count.toLocaleString()} raw points{rawCapped ? ' (first page)' : ''}</p>}
      {raw.isLoading && <EmptyState title="Counting raw samples…" />}
      {raw.isError && <QueryError title="Raw slice unavailable" error={raw.error} retry={() => void raw.refetch()} />}
      {!raw.isLoading && !raw.isError && density.length === 0 && (
        <EmptyState title="No raw samples for this window"
          copy="No historian samples were stored for this loop over this window, so there is nothing to count. Check the loop's signal mapping in the Loop Registry." />
      )}
      {density.length > 0 && (
        <>
          <div className="cpm-density" role="img" aria-label={summary}>
            {density.map((b, i) => (
              <div key={i}
                className={`cpm-density__bucket${
                  !b.fetched ? ' cpm-density__bucket--unfetched'
                    : b.count === 0 ? ' cpm-density__bucket--empty'
                      : b.ratio < 0.6 ? ' cpm-density__bucket--sparse' : ''}`}
                style={{ height: !b.fetched ? '100%' : `${Math.max(4, Math.min(100, b.ratio * 100))}%` }}
                title={!b.fetched
                  ? 'not fetched: beyond the raw page cap, unknown coverage'
                  : `${b.count} sample(s) · ${(b.ratio * 100).toFixed(0)}% of the ${gridPeriodS} s-grid expectation`} />
            ))}
          </div>
          <p className="cpm-copy">
            {BUCKETS} buckets · full height = 100% of the {gridPeriodS} s-grid budget{served ? ' (engine-reported)' : ' (assumed)'}
            {' '}· amber = sparse · grey = empty{rawCapped ? ' · hatched = not fetched (raw page cap): unknown, not missing' : ''}.
          </p>
        </>
      )}
    </Dialog>
  );
};

export default SampleDensityDialog;
