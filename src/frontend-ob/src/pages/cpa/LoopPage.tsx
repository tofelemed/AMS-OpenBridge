/** Loop (SPEC §5.4). Hosts the old pages until Phase 5 replaces them. */
import React from 'react';
import { DestinationHost, type HostTab } from './DestinationHost';

const CpmExplorer = React.lazy(() => import('../../components/Cpm/CpmExplorer'));
const CpmInvestigation = React.lazy(() => import('../../components/Cpm/CpmInvestigation'));
const ResponseWorkspace = React.lazy(() => import('../../components/Cpm/response/ResponseWorkspace'));

const TABS: HostTab[] = [
  { value: 'performance', label: 'Performance', render: () => <CpmExplorer tabParam="sub" /> },
  { value: 'diagnosis', label: 'Diagnosis', windowIsEnd: true, render: () => <CpmInvestigation /> },
  { value: 'model', label: 'Model', render: () => <ResponseWorkspace /> },
  { value: 'signals', label: 'Signals', render: () => <CpmExplorer tabParam="sub" defaultTab="Signals" /> },
];

const LoopPage: React.FC = () => <DestinationHost label="Loop" tabs={TABS} />;

export default LoopPage;
