/** Operating region tab of a loop page: the region, the PV range and where the region comes from. Edit region is the page head's. */
import React from 'react';
import { KvRow, QueryError } from '../shared';
import { useRegions } from './useConfigRegions';

const range = (lo: number | null | undefined, hi: number | null | undefined) => (lo == null || hi == null ? '—' : `${lo} – ${hi}`);
const FROM: Record<string, string> = { LOOP: 'This loop', PROFILE: 'Loop type', SITE: 'Plant', FACTORY: 'Factory' };

export const RegionTab: React.FC<{ site: string; loopId: string }> = ({ site, loopId }) => {
  const q = useRegions(site);
  if (q.isLoading) return <p className="cpm-copy" role="status">Loading…</p>;
  if (q.isError) return <QueryError error={q.error} retry={() => void q.refetch()} />;
  const row = q.data?.loops.find(l => l.loopId === loopId);
  const hasRegion = row?.regionMin != null && row?.regionMax != null;
  return (
    <div className="cpm-config-region">
      <KvRow label="Region">{range(row?.regionMin, row?.regionMax)}</KvRow>
      <KvRow label="PV range">{range(row?.pvRangeMin, row?.pvRangeMax)}</KvRow>
      <KvRow label="From">{hasRegion ? FROM[row!.source] ?? '—' : '—'}</KvRow>
    </div>
  );
};

export default RegionTab;
