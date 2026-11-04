/** System (SPEC §5.7). Hosts the old pages until Phase 6 replaces them. */
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { DestinationHost, type HostTab } from './DestinationHost';

const CpmPipeline = React.lazy(() => import('../../components/Cpm/CpmPipeline'));
const CpmGovernance = React.lazy(() => import('../../components/Cpm/CpmGovernance'));

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users', anyOf: ['admin.users.edit'] },
  { to: '/admin/roles', label: 'Roles and permissions', anyOf: ['rbac.manage'] },
  { to: '/admin/data-sources', label: 'Data sources', anyOf: ['ingestion.view'] },
  { to: '/admin/plant-model', label: 'Plant model', anyOf: ['asset.view'] },
  { to: '/admin/aliases', label: 'Tag aliases', anyOf: ['asset.view'] },
  { to: '/admin/audit', label: 'Audit log', anyOf: ['admin.audit.view'] },
];

const AdministrationLinks: React.FC = () => {
  const hasPermission = useAuthStore(s => s.hasPermission);
  return (
    <ul className="dest__links">
      {ADMIN_LINKS.filter(l => l.anyOf.some(hasPermission)).map(l => (
        <li key={l.to}><Link className="ui-link" to={l.to}>{l.label}</Link></li>
      ))}
    </ul>
  );
};

const TABS: HostTab[] = [
  { value: 'pipeline', label: 'Pipeline', render: () => <CpmPipeline /> },
  { value: 'governance', label: 'Governance', render: () => <CpmGovernance /> },
  { value: 'administration', label: 'Administration', render: () => <AdministrationLinks /> },
];

const SystemPage: React.FC = () => <DestinationHost label="System" tabs={TABS} />;

export default SystemPage;
