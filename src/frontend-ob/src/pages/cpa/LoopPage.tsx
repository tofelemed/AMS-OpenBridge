/**
 * Loop: one row of tabs around the old pages, each unchanged inside, with its own filter row
 * (page-plan.md, UI-063). The loop and the plant scope stay selected in the address.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { HISTORY_QUERY } from '../../components/Cpm/explorer/historyQuery';
import { chosenKind } from '../../cpa/tabKind';
import { useCpmEvents, useCpmLoops, useLatestGates } from '../../hooks/useCpm';
import { DestinationHost, type HostTab } from './DestinationHost';

const CpmExplorer = React.lazy(() => import('../../components/Cpm/CpmExplorer'));
const CpmHistorical = React.lazy(() => import('../../components/Cpm/CpmHistorical'));
const CpmInvestigation = React.lazy(() => import('../../components/Cpm/CpmInvestigation'));
const ResponseWorkspace = React.lazy(() => import('../../components/Cpm/response/ResponseWorkspace'));

const TABS: HostTab[] = [
  { value: 'summary', label: 'Summary', kindParam: 'window', render: () => <CpmExplorer hostTab="Summary" /> },
  { value: 'historical', label: 'Historical', kindParam: 'kind', windowIsEnd: true, own: ['window', 'focus'], render: () => <CpmHistorical /> },
  { value: 'diagnosis', label: 'Diagnosis', kindParam: 'profile', windowIsEnd: true, own: ['window'], render: () => <CpmInvestigation /> },
  { value: 'model', label: 'Model', own: ['event', 'methodRun'], render: () => <ResponseWorkspace /> },
  { value: 'signals', label: 'Signals', kindParam: 'window', render: () => <CpmExplorer hostTab="Signals" /> },
  { value: 'history', label: 'History', kindParam: 'window', render: () => <CpmExplorer hostTab="History" /> },
  { value: 'calculations', label: 'Calculations', kindParam: 'window', render: () => <CpmExplorer hostTab="Calculations" /> },
];

/**
 * The counts the Explorer's own tabs carried. Gates and episodes read the cache and start no request,
 * so a count stays empty until a tab has loaded it (UI-066). A failed read shows 0, as those tabs did.
 */
function useLoopTabCounts(): Record<string, number | undefined> {
  const [params] = useSearchParams();
  const wanted = (params.get('loop') ?? '').toLowerCase();
  const loop = useCpmLoops().data?.loops.find(l => l.loopId.toLowerCase() === wanted);
  const gates = useLatestGates(loop?.loopId, chosenKind(params), false);
  const events = useCpmEvents({ loopId: loop?.loopId, ...HISTORY_QUERY }, 30_000, false);
  if (!loop) return {};
  return {
    signals: Object.keys(loop.tags).length,
    calculations: gates.data?.gates.length ?? (gates.isError ? 0 : undefined),
    history: events.data?.events.length ?? (events.isError ? 0 : undefined),
  };
}

const LoopPage: React.FC = () => {
  const counts = useLoopTabCounts();
  return <DestinationHost label="Loop" tabs={TABS.map(t => ({ ...t, badge: counts[t.value] }))} />;
};

export default LoopPage;
