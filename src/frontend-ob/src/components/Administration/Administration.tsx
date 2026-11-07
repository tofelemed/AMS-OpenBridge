'use client';

import React from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { UserManagementConfig }  from './UserManagementConfig';
import { RolesConfig }           from './RolesConfig';
import { AlarmFeedConfig }       from './AlarmFeedConfig';
import { AlarmRulesConfig }      from './AlarmRulesConfig';
import { DataSourcesConfig }     from './DataSourcesConfig';
import { PlantModelConfig }      from './PlantModelConfig';
import { AliasConfig }           from './AliasConfig';
import { NotificationsConfig }   from './NotificationsConfig';
import { SystemSettingsConfig }  from './SystemSettingsConfig';
import { AuditLogLink }          from './AuditLogLink';
import { WorkspaceHeader }       from '../Cpm/shared';
import { Tabs, tabPanelProps }   from '../../ui/Tabs';
import { useAuthStore }          from '../../store/authStore';
import { HOME_PATH, isSliceAdminTab } from '../../productSlice';
import { RestrictedRoute } from '../../app/guards';

/** The reference's order. Alarm feed, Alarm rules and Notifications are outside the CPA slice and follow, so a full build keeps them. */
const TABS = [
  { path: '/admin/users',         label: 'Users',                 permission: 'admin.users.edit' },
  { path: '/admin/roles',         label: 'Roles & permissions',   permission: 'rbac.manage' },
  { path: '/admin/data-sources',  label: 'Data sources',          permission: 'ingestion.view' },
  // Reads gate on asset.view (any role); writes inside the pages need asset.edit.
  { path: '/admin/plant-model',   label: 'Plant model',           permission: 'asset.view' },
  { path: '/admin/aliases',       label: 'Tag aliases',           permission: 'asset.view' },
  { path: '/admin/audit',         label: 'Audit log',             permission: 'admin.audit.view' },
  { path: '/admin/system',        label: 'System settings' },
  { path: '/admin/alarm-feed',    label: 'Alarm feed' },
  { path: '/admin/alarm-rules',   label: 'Alarm rules' },
  { path: '/admin/notifications', label: 'Notifications' },
];

const Administration: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const visibleTabs = TABS.filter(t => isSliceAdminTab(t.path) && (!t.permission || hasPermission(t.permission)));
  const fallback = visibleTabs[0]?.path ?? HOME_PATH;
  const active = TABS.find(t => location.pathname.startsWith(t.path))?.path ?? fallback;
  const guarded = (permission: string, page: React.ReactElement) => (hasPermission(permission) ? page : <RestrictedRoute />);
  const sliceOnly = (path: string, page: React.ReactElement) => (isSliceAdminTab(path) ? page : <Navigate to={fallback} replace />);

  return (
    <div className="cpm-screen cpm-admin">
      <WorkspaceHeader eyebrow="System" title="Administration" />
      <Tabs
        idBase="admin"
        label="Administration"
        options={visibleTabs.map(t => ({ value: t.path, label: t.label }))}
        value={active}
        onChange={path => navigate(path)}
      />
      <div className="cpm-surface cpm-admin__panel" {...tabPanelProps('admin', active)}>
        <Routes>
          <Route path="users" element={guarded('admin.users.edit', <UserManagementConfig />)} />
          <Route path="roles" element={guarded('rbac.manage', <RolesConfig />)} />
          <Route path="alarm-feed"    element={sliceOnly('/admin/alarm-feed', <AlarmFeedConfig />)} />
          <Route path="opc-servers"   element={sliceOnly('/admin/alarm-feed', <AlarmFeedConfig />)} />
          <Route path="data-sources" element={guarded('ingestion.view', <DataSourcesConfig />)} />
          <Route path="plant-model" element={guarded('asset.view', <PlantModelConfig />)} />
          <Route path="aliases" element={guarded('asset.view', <AliasConfig />)} />
          <Route path="alarm-rules"   element={sliceOnly('/admin/alarm-rules', <AlarmRulesConfig />)} />
          <Route path="notifications" element={sliceOnly('/admin/notifications', <NotificationsConfig />)} />
          <Route path="audit"         element={<AuditLogLink />} />
          <Route path="system"        element={<SystemSettingsConfig />} />
          <Route index element={<Navigate to={fallback} replace />} />
          <Route path="*" element={<Navigate to={fallback} replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default Administration;
