'use client';

/**
 * Explorer › the selected loop's workspace: five real tabs, each with its own count, so "Relationships 0"
 * answers itself without a click. The heading sits above the page, and the result and readiness in the
 * band above the tabs, on Summary only (LoopSummaryRow).
 */
import React from 'react';
import { Tabs, tabPanelProps } from '../../../ui/Tabs';
import type { CpmLoop } from '../../../api/cpmApi';
import { ApiError } from '../../../api/apiFetch';
import { useCpmEvents, useLatestGates } from '../../../hooks/useCpm';
import type { ExplorerTab } from './readinessCauses';
import SummaryTab from './SummaryTab';
import SignalsTab from './SignalsTab';
import CalculationsTab from './CalculationsTab';
import RelationshipsTab from './RelationshipsTab';
import HistoryTab from './HistoryTab';
import { LoopModelLink } from './LoopModelCard';
import { HISTORY_QUERY } from './historyQuery';

export const TABS: ExplorerTab[] = ['Summary', 'Signals', 'Calculations', 'Relationships', 'History'];

/**
 * gates/latest answers 404 when a loop has no fused window yet — a legitimate
 * "nothing to show", not a failure. Every other status IS a failure and must not
 * render as emptiness.
 */
export const isNoVerdictYet = (e: unknown) => e instanceof ApiError && e.status === 404;

interface LoopWorkspaceProps {
  loop: CpmLoop;
  tab: ExplorerTab;
  /** The fused window kind (`?window=`) the Summary gate strip reads. */
  windowKind: string;
  onTab: (t: ExplorerTab) => void;
}

/** The tabs of one loop. The result sits in the band above them, on Summary only, with its details behind Open details. */
export const LoopWorkspace: React.FC<LoopWorkspaceProps> = ({ loop, tab, windowKind, onTab }) => {
  // The same query keys as the tabs, so a count and its tab share one fetch.
  const gates = useLatestGates(loop.loopId, windowKind);
  const events = useCpmEvents({ loopId: loop.loopId, ...HISTORY_QUERY });
  const counts: Partial<Record<ExplorerTab, number>> = {
    Signals: Object.keys(loop.tags).length,
    Calculations: gates.data?.gates.length ?? 0,
    Relationships: loop.links.length,
    History: events.data?.events.length ?? 0,
  };
  const tabs = TABS.map(t => ({ value: t, label: t, badge: counts[t] }));

  return (
    <section className="cpm-surface">
      <div className="cpm-tabs-row">
        <div className="cpm-tabs">
          {/* The container scrolls for the case where the tabs do not fit the workspace column. */}
          <Tabs idBase="loop-workspace" label={loop.loopId} options={tabs} value={tab} onChange={onTab} />
        </div>
        {/* CHG-158 (owner review): at the end of the tab row on Summary, as the owner's design shows */}
        {tab === 'Summary' && <div className="cpm-tabs-row__end"><LoopModelLink loop={loop} /></div>}
      </div>

      {/* The panel is height-bounded so switching from the tall Summary chart to
          an empty Relationships tab no longer collapses the page under the
          cursor. */}
      <div className="cpm-tabpanel" {...tabPanelProps('loop-workspace', tab)}>
        {tab === 'Summary' && <SummaryTab loop={loop} windowKind={windowKind} onTab={onTab} />}
        {tab === 'Signals' && <SignalsTab loop={loop} />}
        {tab === 'Calculations' && <CalculationsTab loop={loop} pageWindowKind={windowKind} />}
        {tab === 'Relationships' && <RelationshipsTab loop={loop} windowKind={windowKind} />}
        {tab === 'History' && <HistoryTab loop={loop} />}
      </div>
    </section>
  );
};

export default LoopWorkspace;
