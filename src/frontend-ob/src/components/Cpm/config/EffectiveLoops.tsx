/**
 * Effective with no loop: what each loop runs under (the overview's "Configuration by loop" before CHG-169), from ONE fleet read
 * the page holds only while this list is open.
 * CHG-169 (owner review, the approved sample docs/theme/redesign/samples/gate-configuration-proposal.html): one list card. Search
 * first, no label ("Loop, service, profile or unit"), then one dropdown "All loops 243 · Governed bundle 1 · Factory layer 242"
 * (owner answer 2c: client side, counted from the fleet read) in place of the count sentence; rows Loop (the service under the
 * tag, the tag said once), Profile in words, Runs under ("✓ Active (verified)" over "LOOP v6", or "○ Factory layer"), Effective
 * from; 20 a page, governed first then by loop id, the shared pager; a row opens the loop. The foot holds Build details (the
 * Technical details disclosure, as a dialog).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, QueryError, TonePill } from '../shared';
import { Pagination } from '../../../ui/forms/Pagination';
import { codeLabel, locationLabel } from '../vocabulary';
import { serviceName } from '../loopName';
import { stamp, zoneTag } from '../events/eventTime';
import type { ConfigCatalogue, EffectiveSummaryLoop } from '../../../api/cpm/config';
import { BundleStatePill } from './configBits';
import { DetailsDialog, buildRows } from './DetailsDialog';

const PAGE = 20;
type Shown = 'all' | 'governed' | 'factory';

export interface EffectiveLoopsProps {
  loops: EffectiveSummaryLoop[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  catalogue: ConfigCatalogue | undefined;
  onOpenLoop: (loopId: string) => void;
}

const matches = (l: EffectiveSummaryLoop, q: string) =>
  !q || l.loopId.toLowerCase().includes(q) || l.displayName.toLowerCase().includes(q) || l.profileId.toLowerCase().includes(q) || (l.unit ?? '').toLowerCase().includes(q);

export const EffectiveLoops: React.FC<EffectiveLoopsProps> = ({ loops, loading, error, onRetry, catalogue, onOpenLoop }) => {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Shown>('all');
  const [page, setPage] = useState(1);
  const [build, setBuild] = useState(false);
  useEffect(() => { setPage(1); }, [query, shown]);
  const q = query.trim().toLowerCase();
  const governed = useMemo(() => loops.filter(l => l.bundle).length, [loops]);
  // governed loops first (the answer to "who runs a bundle" is on page 1), then by loop id
  const filtered = useMemo(() => loops
    .filter(l => matches(l, q) && (shown === 'all' || (shown === 'governed') === !!l.bundle))
    .sort((a, b) => Number(!!b.bundle) - Number(!!a.bundle) || a.loopId.localeCompare(b.loopId)), [loops, q, shown]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pageCount);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const showAll = () => { setQuery(''); setShown('all'); };

  return (
    <section className="cpm-surface cpm-config-list cpm-config-list--foot" aria-label="Loops">
      <div className="cpm-compact cpm-config-filters" role="group" aria-label="Loop filters">
        <input type="search" className="cpm-input" aria-label="Find a loop" placeholder="Loop, service, profile or unit" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="cpm-select" aria-label="Loops shown" value={shown} onChange={e => setShown(e.target.value as Shown)}>
          <option value="all">All loops {loops.length}</option>
          <option value="governed">Governed bundle {governed}</option>
          <option value="factory">Factory layer {loops.length - governed}</option>
        </select>
      </div>
      {loading && loops.length === 0 && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading what each loop runs under…</span></div>}
      {error != null && <QueryError title="Configuration summary unavailable" error={error} retry={onRetry} />}
      {!loading && error == null && loops.length > 0 && governed === 0 && (
        <p className="cpm-copy">No loop runs a governed bundle yet — every loop runs the factory layer (the class packs). Pick a loop to draft one.</p>
      )}
      <table className="cpm-table cpm-config-rows">
        <thead><tr><th>Loop</th><th>Profile</th><th>Runs under</th><th>Effective from · {zoneTag()}</th></tr></thead>
        <tbody>
          {rows.map(l => (
            <tr key={l.loopId} className="cpm-reg-row" data-state={l.state} onClick={() => onOpenLoop(l.loopId)}>
              <td>
                <button type="button" className="cpm-config-rowbtn" onClick={e => { e.stopPropagation(); onOpenLoop(l.loopId); }}><strong>{l.loopId}</strong></button>
                <div className="cpm-event-row__sub">{[serviceName(l), locationLabel(l.unit)].filter(Boolean).join(' · ')}</div>
              </td>
              <td title={l.profileId}>{codeLabel(l.profileId)}</td>
              <td>
                {l.bundle ? <BundleStatePill state={l.state} /> : <TonePill tone="muted" glyph="○">Factory layer</TonePill>}
                {l.bundle && <div className="cpm-event-row__sub">{l.bundle.scopeKind} v{l.bundle.version}</div>}
              </td>
              <td>{l.bundle?.effectiveFrom ? stamp(l.bundle.effectiveFrom) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && error == null && loops.length > 0 && filtered.length === 0 && (
        <EmptyState title={q ? `No loop matches “${query.trim()}”` : 'No loop matches this filter'} action={{ label: 'Show all loops', onClick: showAll }} />
      )}
      {pageCount > 1 && <div className="cpm-events-pager"><Pagination page={current} pageCount={pageCount} onChange={setPage} label="Loop pages" /></div>}
      <div className="cpm-config-foot">
        <ObcButton variant="flat" onClick={() => setBuild(true)}>Build details</ObcButton>
      </div>
      <DetailsDialog title="Build details" open={build} onClose={() => setBuild(false)} rows={buildRows(catalogue)} />
    </section>
  );
};

export default EffectiveLoops;
