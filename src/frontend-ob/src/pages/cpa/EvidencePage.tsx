/**
 * Evidence: one row of tabs around the old pages, each unchanged inside, with its own filter row
 * (page-plan.md). `gate` is a selection on Gates and Replay, but a filter on Calculations.
 */
import React from 'react';
import { DestinationHost, type HostTab } from './DestinationHost';

const GateEvidenceWorkspace = React.lazy(() => import('../../components/Cpm/evidence/GateEvidenceWorkspace'));
const CpmReplay = React.lazy(() => import('../../components/Cpm/CpmReplay'));
const CpmWindows = React.lazy(() => import('../../components/Cpm/CpmWindows'));
const CpmCalculations = React.lazy(() => import('../../components/Cpm/CpmCalculations'));

const TABS: HostTab[] = [
  {
    value: 'gates', label: 'Gates', kindParam: 'kind', own: ['methodRun', 'analysisRun', 'mode', 'view', 'before'],
    render: () => <GateEvidenceWorkspace />,
  },
  { value: 'replay', label: 'Replay', kindParam: 'kind', windowIsEnd: true, own: ['window'], render: () => <CpmReplay /> },
  { value: 'windows', label: 'Windows', windowIsEnd: true, own: ['window'], render: () => <CpmWindows /> },
  { value: 'calculations', label: 'Calculations', kindParam: 'window', own: ['gate', 'metric'], render: () => <CpmCalculations /> },
];

const EvidencePage: React.FC = () => <DestinationHost label="Evidence" tabs={TABS} />;

export default EvidencePage;
