/**
 * Setup: one row of tabs around the old pages, each unchanged inside. Each tab keeps the rule of the
 * page it replaces, so nobody gains or loses a page (UI-005, UI-015, UI-078).
 */
import React from 'react';
import { ADMIN_PERMISSIONS } from '../../cpa/destinations';
import { AdminTab } from './AdminTab';
import { DestinationHost, type HostTab } from './DestinationHost';

const LoopRegistry = React.lazy(() => import('../../components/Cpm/LoopRegistry'));
const GateConfigurationWorkspace = React.lazy(() => import('../../components/Cpm/config/GateConfigurationWorkspace'));
const PlantModelConfig = React.lazy(() => import('../../components/Administration/PlantModelConfig'));
const DataSourcesConfig = React.lazy(() => import('../../components/Administration/DataSourcesConfig'));
const AliasConfig = React.lazy(() => import('../../components/Administration/AliasConfig'));

const TABS: HostTab[] = [
  { value: 'loops', label: 'Loops', permission: 'analytics.view', render: () => <LoopRegistry /> },
  {
    value: 'configuration', label: 'Configuration', permission: 'cpm.config.read', own: ['view', 'bundle', 'gate'],
    render: () => <GateConfigurationWorkspace tabParam="sub" />,
  },
  {
    value: 'plant-model', label: 'Plant model', permission: 'asset.view', anyOf: ADMIN_PERMISSIONS, own: ['search'],
    render: () => <AdminTab title="Plant model"><PlantModelConfig /></AdminTab>,
  },
  {
    value: 'data-sources', label: 'Data sources', permission: 'ingestion.view',
    render: () => <AdminTab title="Data sources"><DataSourcesConfig /></AdminTab>,
  },
  {
    value: 'tag-aliases', label: 'Tag aliases', permission: 'asset.view', anyOf: ADMIN_PERMISSIONS,
    render: () => <AdminTab title="Tag aliases"><AliasConfig /></AdminTab>,
  },
];

const SetupPage: React.FC = () => <DestinationHost label="Setup" tabs={TABS} />;

export default SetupPage;
