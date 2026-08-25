'use client';

/**
 * Explorer › the selected loop's workspace.
 *
 * Three changes over the previous version:
 *
 * 1. Real tabs. Five ObcButtons in a flex row are not a tablist — no
 *    aria-selected, no arrow-key movement, five tab stops, and no stated
 *    relationship to the panel below. ObcTabRow is the OpenBridge component for
 *    this, and its badge support lets each tab carry its own count, so
 *    "Relationships 0" answers itself without a click.
 * 2. One readiness banner instead of four repetitions of the same prose, with
 *    each cause routed to the surface that can fix it.
 * 3. A breadcrumb. "CONTROL LOOP · SITE1" did not say where in the hierarchy
 *    you were, which is the one thing an asset-centric screen owes you.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useCpmEvents, useCpmReadiness, useLatestGates } from '../../../hooks/useCpm';
import { PanelHead, TonePill, toneFor } from '../shared';
import { readinessCauses, type ExplorerTab } from './readinessCauses';
import SummaryTab from './SummaryTab';
import SignalsTab from './SignalsTab';
import CalculationsTab from './CalculationsTab';
import RelationshipsTab from './RelationshipsTab';
import HistoryTab, { HISTORY_QUERY } from './HistoryTab';

export const TABS: ExplorerTab[] = ['Summary', 'Signals', 'Calculations', 'Relationships', 'History'];

/**
 * gates/latest answers 404 when a loop has no fused window yet — a legitimate
 * "nothing to show", not a failure. Every other status IS a failure and must not
 * render as emptiness.
 */
const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

export const LoopWorkspace: React.FC<{
  loop: CpmLoop;
  tab: ExplorerTab;
  onTab: (t: ExplorerTab) => void;
}> = ({ loop, tab, onTab }) => {
  const navigate = useNavigate();
  const gates = useLatestGates(loop.loopId, '24h');
  const readiness = useCpmReadiness(loop.loopId);
  // Same query key as HistoryTab's, so react-query serves the badge count and
  // the tab body from one fetch.
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });

  // A failed fetch is not a verdict: showing NOT_EVALUATED for a 500 says the
  // engine declined to judge this loop, when in fact nobody asked it.
  const gatesFailed = gates.isError && !isNoVerdictYet(gates.error);
  const diagnosis = gatesFailed ? 'VERDICT UNAVAILABLE' : gates.data?.diagnosis ?? 'NOT_EVALUATED';

  const summary = readinessCauses(readiness.data, loop.loopId);
  const [causesOpen, setCausesOpen] = React.useState(false);

  const signalCount = Object.keys(loop.tags).length;
  const gateCount = gates.data?.gates.length ?? 0;
  const linkCount = loop.links.length;
  const episodeCount = events.data?.events.length ?? 0;

  // Memoised on the counts themselves: `tabs` is a PROPERTY on a Lit element, so
  // a fresh array each render would re-render the tab row on every parent tick.
  const tabs = React.useMemo(() => {
    const counts: Partial<Record<ExplorerTab, number>> = {
      Signals: signalCount,
      Calculations: gateCount,
      Relationships: linkCount,
      History: episodeCount,
    };
    return TABS.map(t => ({
      id: t,
      title: t,
      hasLeadingIcon: false,
      hasBadge: counts[t] != null,
      badgeCount: counts[t] ?? 0,
      badgeShowNumber: true,
    }));
  }, [signalCount, gateCount, linkCount, episodeCount]);

  const crumbs = [loop.site, loop.area, loop.unit].filter(Boolean) as string[];

  return (
    <section className="cpm-surface">
      <nav className="cpm-crumbs" aria-label="Plant location">
        {crumbs.map((c, i) => (
          <React.Fragment key={`${c}-${i}`}>
            {i > 0 && <span className="cpm-crumbs__sep" aria-hidden>›</span>}
            <span>{c}</span>
          </React.Fragment>
        ))}
        {crumbs.length > 0 && <span className="cpm-crumbs__sep" aria-hidden>›</span>}
        <strong>{loop.loopId}</strong>
      </nav>

      <PanelHead
        eyebrow={loop.displayName}
        title={loop.loopId}
        right={
          <TonePill tone={gatesFailed ? 'warn' : toneFor(diagnosis)}>
            {diagnosis.replace(/_/g, ' ')}
          </TonePill>
        }
      />

      {summary && (
        <div className={`cpm-causes${summary.blocking > 0 ? ' cpm-causes--blocking' : ''}`}>
          <button
            type="button"
            className="cpm-causes__head"
            aria-expanded={causesOpen}
            onClick={() => setCausesOpen(v => !v)}
          >
            <strong>{summary.headline}</strong>
            <span className="cpm-event-row__sub">
              {summary.causes.length} cause(s)
              {summary.blocking > 0 ? ` · ${summary.blocking} blocking` : ''}
            </span>
            <span className="cpm-causes__caret" aria-hidden>{causesOpen ? '▾' : '▸'}</span>
          </button>

          {causesOpen && (
            <ul className="cpm-causes__list">
              {summary.causes.map(c => (
                <li key={c.id} className="cpm-causes__item">
                  <TonePill tone={c.blocking ? 'bad' : 'warn'}>
                    {c.blocking ? 'BLOCKING' : 'DEGRADED'}
                  </TonePill>
                  <span className="cpm-causes__text">
                    <strong>{c.label}</strong>
                    {c.message && <span className="cpm-event-row__sub">{c.message}</span>}
                  </span>
                  {c.target && (
                    <button
                      type="button"
                      className="cpm-causes__action"
                      onClick={() => {
                        if (c.target?.kind === 'tab') onTab(c.target.tab);
                        else if (c.target?.kind === 'route') navigate(c.target.href);
                      }}
                    >
                      {c.target.label} ›
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="cpm-tabs">
        {/* `hug` is required, not cosmetic: obc-tab-item is width:240px /
            max-width:240px by default, so five tabs demand 1200px and overflow
            the workspace column — the last tab was clipped off the surface.
            hug propagates to each item as width:fit-content (min 140px). The
            container scrolls for the case where even that does not fit. */}
        <ObcTabRow
          hug
          tabs={tabs}
          selectedTabId={tab}
          onTabSelected={(e: CustomEvent<{ id: string }>) => {
            // Guard the payload the same way the toggle groups are guarded: an
            // id that is not one of ours must not reach the panel router.
            if (TABS.includes(e.detail.id as ExplorerTab)) onTab(e.detail.id as ExplorerTab);
          }}
        />
      </div>

      {/* The panel is height-bounded so switching from the tall Summary chart to
          an empty Relationships tab no longer collapses the page under the
          cursor. */}
      <div className="cpm-tabpanel" role="tabpanel" aria-label={`${tab} for ${loop.loopId}`}>
        {tab === 'Summary' && <SummaryTab loop={loop} />}
        {tab === 'Signals' && <SignalsTab loop={loop} />}
        {tab === 'Calculations' && <CalculationsTab loop={loop} />}
        {tab === 'Relationships' && <RelationshipsTab loop={loop} />}
        {tab === 'History' && <HistoryTab loop={loop} />}
      </div>
    </section>
  );
};

export default LoopWorkspace;
