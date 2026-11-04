/**
 * Setup (SPEC §5.6). Hosts the old pages until Phase 6 replaces them. Each tab keeps the guard its
 * old route had, so nobody gains or loses a page (UI-005, UI-015).
 */
import React from 'react';
import { DestinationHost, type HostTab } from './DestinationHost';

const LoopRegistry = React.lazy(() => import('../../components/Cpm/LoopRegistry'));
const GateConfigurationWorkspace = React.lazy(() => import('../../components/Cpm/config/GateConfigurationWorkspace'));

const TABS: HostTab[] = [
  { value: 'loops', label: 'Loops', permission: 'analytics.view', render: () => <LoopRegistry /> },
  {
    value: 'configuration', label: 'Configuration', permission: 'cpm.config.read',
    render: () => <GateConfigurationWorkspace tabParam="sub" />,
  },
];

const SetupPage: React.FC = () => <DestinationHost label="Setup" tabs={TABS} />;

export default SetupPage;
