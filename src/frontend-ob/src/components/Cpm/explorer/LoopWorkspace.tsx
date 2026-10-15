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
import { ObcTabRow } from '@oicl/openbridge-webcomponents-react/components/tab-row/tab-row';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useCpmEvents, useCpmReadiness, useLatestGates } from '../../../hooks/useCpm';
import { PanelHead, toneFor } from '../shared';
import { useInstrumentHealth } from '../health/useInstrumentHealth';
import { TransmitterHealthPanel, loopHealthSummary } from '../health/TransmitterHealthPanel';
import { readinessCauses, type ExplorerTab } from './readinessCauses';
import ReadinessBar, { readinessLine } from './ReadinessBar';
import LoopSummaryCard from './summary/LoopSummaryCard';
import { FacetPill, instrumentHealthText } from '../FacetPill';
import { conditionOf } from './summary/summaryText';
import SummaryTab from './SummaryTab';
import SignalsTab from './SignalsTab';
import CalculationsTab from './CalculationsTab';
import RelationshipsTab from './RelationshipsTab';
import HistoryTab, { HISTORY_QUERY } from './HistoryTab';
import { locationLabel } from '../vocabulary';

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
  /** The fused window kind (`?window=`) the verdict pill and the Summary gate strip read; one query key for both. */
  windowKind: string;
  onTab: (t: ExplorerTab) => void;
}> = ({ loop, tab, windowKind, onTab }) => {
  const gates = useLatestGates(loop.loopId, windowKind);
  const readiness = useCpmReadiness(loop.loopId);
  // Same query key as HistoryTab's, so react-query serves the badge count and
  // the tab body from one fetch.
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });

  // A failed fetch is not a verdict: showing NOT_EVALUATED for a 500 says the
  // engine declined to judge this loop, when in fact nobody asked it.
  const gatesFailed = gates.isError && !isNoVerdictYet(gates.error);
  const diagnosis = gatesFailed ? 'VERDICT UNAVAILABLE' : gates.data?.diagnosis ?? 'NOT_EVALUATED';

  const summary = readinessCauses(readiness.data, loop.loopId);
  const readinessInCard = !!gates.data && !!summary && summary.blocking === 0;

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

  const crumbs = [locationLabel(loop.site, { site: true }), locationLabel(loop.area), locationLabel(loop.unit)].filter(Boolean);

  // v2.5 (1H.6): transmitter health beside the verdict. The pill is the worst-of across bound
  // roles; NOT CONFIGURED is an unavailable state (never OK). Click opens the drawer.
  const instrumentHealth = useInstrumentHealth(loop.loopId);
  const [healthOpen, setHealthOpen] = React.useState(false);
  const healthSummary = loopHealthSummary(instrumentHealth.data);

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
          <span className="cpm-head-pills">
            <button
              type="button"
              className="cpm-pill-button"
              aria-expanded={healthOpen}
              aria-controls="cpm-transmitter-health"
              title="Transmitter health (Instrumental NE107)"
              onClick={() => setHealthOpen(v => !v)}
            >
              <FacetPill facet="health" tone={healthSummary.tone}>{instrumentHealthText(healthSummary.label)}</FacetPill>
            </button>
            {/* CHG-098 (SME review 2 #20): the diagnosis is shown once — by the loop summary, which also pins its
                window on the trend (SME #12). Without a served row (failed / no verdict yet) the pill says why. */}
            {!gates.data && (
              <FacetPill facet="diagnosis" tone={gatesFailed ? 'warn' : toneFor(diagnosis)}>
                {gatesFailed ? 'Verdict unavailable' : conditionOf(diagnosis).label}
              </FacetPill>
            )}
          </span>
        }
      />

      {healthOpen && (
        <div id="cpm-transmitter-health" className="cpm-health-drawer">
          <TransmitterHealthPanel
            health={instrumentHealth.data}
            loading={instrumentHealth.isLoading}
            error={instrumentHealth.error}
          />
        </div>
      )}

      {/* SME #4: the loop summary heads every tab — condition, severity, cause, next check (CHG-098: basis behind a disclosure). */}
      {gates.data && (
        <LoopSummaryCard loop={loop} matrix={gates.data} windowKind={windowKind} healthLabel={healthSummary.label}
          more={readinessInCard && summary ? <ReadinessBar summary={summary} onTab={onTab} /> : undefined}
          moreLine={readinessInCard && summary ? readinessLine(summary) : undefined} />
      )}

      {/* CHG-098 (SME review 2 #20): a blocking readiness bar stays above the tabs; one that only limits the
          diagnosis sits in the summary's "Basis and limitations" disclosure, so the trend follows the summary. */}
      {summary && !readinessInCard && <ReadinessBar summary={summary} onTab={onTab} />}

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
        {tab === 'Summary' && <SummaryTab loop={loop} windowKind={windowKind} />}
        {tab === 'Signals' && <SignalsTab loop={loop} />}
        {tab === 'Calculations' && <CalculationsTab loop={loop} pageWindowKind={windowKind} />}
        {tab === 'Relationships' && <RelationshipsTab loop={loop} windowKind={windowKind} />}
        {tab === 'History' && <HistoryTab loop={loop} />}
      </div>
    </section>
  );
};

export default LoopWorkspace;
