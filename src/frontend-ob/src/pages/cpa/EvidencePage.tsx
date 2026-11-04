/** Evidence (SPEC §5.5). Hosts the old pages until Phase 6 replaces them. */
import React from 'react';
import { DestinationHost, type HostTab } from './DestinationHost';

const GateEvidenceWorkspace = React.lazy(() => import('../../components/Cpm/evidence/GateEvidenceWorkspace'));
const CpmReplay = React.lazy(() => import('../../components/Cpm/CpmReplay'));
const CpmWindows = React.lazy(() => import('../../components/Cpm/CpmWindows'));
const CpmCalculations = React.lazy(() => import('../../components/Cpm/CpmCalculations'));

const TABS: HostTab[] = [
  { value: 'gates', label: 'Gates', render: () => <GateEvidenceWorkspace /> },
  { value: 'replay', label: 'Replay', windowIsEnd: true, render: () => <CpmReplay /> },
  { value: 'windows', label: 'Windows', windowIsEnd: true, render: () => <CpmWindows /> },
  { value: 'calculations', label: 'Calculations', render: () => <CpmCalculations /> },
];

const EvidencePage: React.FC = () => <DestinationHost label="Evidence" tabs={TABS} />;

export default EvidencePage;
