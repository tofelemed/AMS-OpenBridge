/**
 * System: one row of tabs around the old pages, each unchanged inside. Each tab keeps the rule of the
 * page it replaces, so nobody gains or loses a page (UI-078).
 */
import React from 'react';
import { ADMIN_PERMISSIONS } from '../../cpa/destinations';
import { AdminTab } from './AdminTab';
import { DestinationHost, type HostTab } from './DestinationHost';

const CpmPipeline = React.lazy(() => import('../../components/Cpm/CpmPipeline'));
const CpmGovernance = React.lazy(() => import('../../components/Cpm/CpmGovernance'));
const UserManagementConfig = React.lazy(() => import('../../components/Administration/UserManagementConfig'));
const RolesConfig = React.lazy(() => import('../../components/Administration/RolesConfig'));
const SystemSettingsConfig = React.lazy(() => import('../../components/Administration/SystemSettingsConfig')
  .then(m => ({ default: m.SystemSettingsConfig })));

const TABS: HostTab[] = [
  { value: 'pipeline', label: 'Pipeline', permission: 'system.manage', render: () => <CpmPipeline /> },
  // Holds the one audit trail, so it opens for Audit log's rule too. Its other panels stay with system.manage.
  { value: 'governance', label: 'Governance', anyOf: ['system.manage', ...ADMIN_PERMISSIONS], render: () => <CpmGovernance /> },
  {
    value: 'users', label: 'Users', permission: 'admin.users.edit',
    render: () => <AdminTab title="Users"><UserManagementConfig /></AdminTab>,
  },
  {
    value: 'roles', label: 'Roles', permission: 'rbac.manage',
    render: () => <AdminTab title="Roles"><RolesConfig /></AdminTab>,
  },
  {
    value: 'settings', label: 'Settings', anyOf: ADMIN_PERMISSIONS,
    render: () => <AdminTab title="Settings"><SystemSettingsConfig /></AdminTab>,
  },
];

const SystemPage: React.FC = () => <DestinationHost label="System" tabs={TABS} />;

export default SystemPage;
