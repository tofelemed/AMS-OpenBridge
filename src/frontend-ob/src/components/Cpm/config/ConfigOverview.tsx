/**
 * 2026-09-18 Gate Configuration redesign: the landing. Two paged, searchable panels for the scope -
 * "Configuration by loop" (what each loop runs under: the factory layer or a bundle by level / version /
 * hash, from ONE fleet read) and "Bundles in progress" (every draft, validated, shadowed, approved or
 * failed bundle of the site, from summary rows). Each row is a link into the loop's page or the editor.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { EmptyState, PanelHead, QueryError, TonePill, fmtDateTime } from '../shared';
import { usePagedSlice } from '../../shared/ListPager';
import type { BundleSummary, EffectiveSummaryLoop } from '../../../api/cpm/config';
import { bundleLabel, bundleStateTone, shortHash } from './configSupport';

const PAGE = 20;
const SETTLED = new Set(['ACTIVE_VERIFIED', 'SUPERSEDED', 'ROLLED_BACK']);

export const loopHref = (loopId: string, view: 'effective' | 'bundles' = 'effective') => `/cpm/config?loop=${encodeURIComponent(loopId)}&view=${view}`;
export const editorHref = (b: { bundleId: string; scopeKind: string; scopeRef: string | null }) =>
  `/cpm/config?${b.scopeKind === 'LOOP' && b.scopeRef ? `loop=${encodeURIComponent(b.scopeRef)}&` : ''}view=editor&bundle=${encodeURIComponent(b.bundleId)}`;

export interface ConfigOverviewProps {
  loops: EffectiveSummaryLoop[];
  loopsLoading: boolean;
  loopsError: unknown;
  bundles: BundleSummary[];
  bundlesLoading: boolean;
  bundlesError: unknown;
  onRetry: () => void;
}

export const ConfigOverview: React.FC<ConfigOverviewProps> = ({ loops, loopsLoading, loopsError, bundles, bundlesLoading, bundlesError, onRetry }) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [query]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => loops.filter(l => !q || l.loopId.toLowerCase().includes(q) || l.displayName.toLowerCase().includes(q) || l.profileId.toLowerCase().includes(q) || (l.unit ?? '').toLowerCase().includes(q)), [loops, q]);
  const { pageCount, safePage, pageItems } = usePagedSlice(filtered, page, PAGE);
  const governed = loops.filter(l => l.bundle).length;
  const inProgress = useMemo(() => bundles.filter(b => !SETTLED.has(b.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [bundles]);

  return (
    <>
      <section className="cpm-surface">
        <PanelHead eyebrow="Overview" title="Configuration by loop"
          right={loops.length ? <span className="cpm-copy">{governed} of {loops.length} loops run a governed bundle; the rest run the factory layer</span> : undefined} />
        <div className="cpm-config-effective__bar">
          <label className="cpm-field cpm-field--compact">
            <span className="cpm-field__label">Find a loop</span>
            <input type="search" className="cpm-input" aria-label="Find a loop" placeholder="loop, service, profile or unit" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <span className="cpm-filter-count">{filtered.length} loop(s)</span>
        </div>
        {loopsLoading && loops.length === 0 && <div className="cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading what each loop runs under…</span></div>}
        {loopsError != null && <QueryError title="Configuration summary unavailable" error={loopsError} retry={onRetry} />}
        {!loopsLoading && loopsError == null && loops.length > 0 && governed === 0 && (
          <p className="cpm-copy">No loop runs a governed bundle yet — every loop runs the factory layer (the class packs). Pick a loop to draft one.</p>
        )}
        {filtered.length > 0 && (
          <div className="cpm-config-table__wrap">
            <table className="cpm-table cpm-config-overview" aria-label="Configuration by loop">
              <thead><tr><th>loop</th><th>profile</th><th>runs under</th><th>effective from</th></tr></thead>
              <tbody>
                {pageItems.map(l => (
                  <tr key={l.loopId} data-state={l.state}>
                    <td><Link className="cpm-link cpm-mono" to={loopHref(l.loopId)}>{l.loopId}</Link><span className="cpm-config-property__meta cpm-config-table__from">{l.displayName}{l.unit ? ` · ${l.unit}` : ''}</span></td>
                    <td className="cpm-mono">{l.profileId}</td>
                    <td>
                      <TonePill tone={l.bundle ? bundleStateTone(l.state) : 'muted'}>{l.bundle ? l.state : 'factory layer'}</TonePill>
                      {l.bundle && <span className="cpm-config-property__meta cpm-config-table__from">{bundleLabel(l.bundle)}</span>}
                    </td>
                    <td>{l.bundle?.effectiveFrom ? fmtDateTime(l.bundle.effectiveFrom) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loopsLoading && loopsError == null && loops.length > 0 && filtered.length === 0 && <EmptyState title="No loop matches" copy={`Nothing in scope matches "${query}".`} />}
        {pageCount > 1 && (
          <div className="cpm-pager">
            <ObcButton variant="flat" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0}>← Prev</ObcButton>
            <span className="cpm-event-row__sub">Page {safePage + 1} of {pageCount}</span>
            <ObcButton variant="flat" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>Next →</ObcButton>
          </div>
        )}
      </section>

      <section className="cpm-surface">
        <PanelHead eyebrow="Lifecycle" title="Bundles in progress" right={<span className="cpm-copy">drafts, validated, shadowed, approved or failed - active and superseded ones live on their loop's page</span>} />
        {bundlesLoading && bundles.length === 0 && <div className="cpm-skeleton" role="status" aria-busy="true"><span className="cpm-skeleton__label">Loading the bundles…</span></div>}
        {bundlesError != null && <QueryError title="Bundles unavailable" error={bundlesError} retry={onRetry} />}
        {!bundlesLoading && bundlesError == null && inProgress.length === 0 && <p className="cpm-copy">Nothing in progress in this scope.</p>}
        {inProgress.length > 0 && (
          <div className="cpm-config-table__wrap">
            <table className="cpm-table cpm-config-overview" aria-label="Bundles in progress">
              <thead><tr><th>scope</th><th>version</th><th>state</th><th>class</th><th>updated</th></tr></thead>
              <tbody>
                {inProgress.map(b => (
                  <tr key={b.bundleId} data-state={b.state}>
                    <td><Link className="cpm-link" to={editorHref(b)}>{b.scopeKind}{b.scopeRef ? ` ${b.scopeRef}` : ` ${b.site}`}</Link>{b.note ? <span className="cpm-config-property__meta cpm-config-table__from">{b.note}</span> : null}</td>
                    <td className="cpm-mono">v{b.version} · {shortHash(b.contentHash, 8)}</td>
                    <td><TonePill tone={bundleStateTone(b.state)}>{b.state}</TonePill>{b.validationErrors ? <span className="cpm-config-property__meta cpm-config-table__from">{b.validationErrors} validation error{b.validationErrors === 1 ? '' : 's'}</span> : null}</td>
                    <td><TonePill tone={b.changeClass === 'DEPLOYMENT' ? 'bad' : b.changeClass === 'STATE_BOUNDARY' ? 'warn' : 'muted'}>{b.changeClass}</TonePill></td>
                    <td>{fmtDateTime(b.updatedAt)} · {b.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};
