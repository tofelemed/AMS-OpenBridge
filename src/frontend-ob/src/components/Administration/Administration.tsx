'use client';

/**
 * Administration: Users, Roles & permissions, Data sources, Plant model and Tag aliases, each on its own address.
 *
 * CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-proposal.html and the owner's answers
 * of 11 Nov 2026): the header is the eyebrow and the title, no ?; top right How to read (a dialog for the open tab, holding the
 * tabs' lone ? texts) and the open tab's own actions. Five plain tabs, then Audit log ↗ as a link at the end of the row
 * (Governance holds the audit trail; the tab that only redirected there is gone). System settings is hidden until a settings
 * service exists; its old address lands on the first tab the role may open. Each tab is one list with a panel for the selected
 * item (a drawer below 1280 px).
 */
import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { UserManagementConfig }  from './UserManagementConfig';
import { RolesConfig }           from './RolesConfig';
import { AlarmFeedConfig }       from './AlarmFeedConfig';
import { AlarmRulesConfig }      from './AlarmRulesConfig';
import { DataSourcesConfig }     from './DataSourcesConfig';
import { PlantModelConfig }      from './PlantModelConfig';
import { AliasConfig }           from './AliasConfig';
import { NotificationsConfig }   from './NotificationsConfig';
import { AdminActionsSlot }      from './AdminActions';
import { AdminHowToRead }        from './AdminHowToRead';
import { ADMIN_TABS, AUDIT_PERMISSION, adminLanding, visibleAdminTabs } from './adminTabs';
import { WorkspaceHeader }       from '../Cpm/shared';
import { governanceHref }        from '../Cpm/cpaHref';
import { Tabs, tabPanelProps }   from '../../ui/Tabs';
import { useAuthStore }          from '../../store/authStore';
import { isSliceAdminTab }       from '../../productSlice';
import { RestrictedRoute }       from '../../app/guards';

const Administration: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [guide, setGuide] = useState(false);
  const visibleTabs = visibleAdminTabs(hasPermission);
  const fallback = adminLanding(hasPermission);
  const open = ADMIN_TABS.find(t => location.pathname.startsWith(t.path));
  const active = open?.path ?? '';
  const guarded = (permission: string, page: React.ReactElement) => (hasPermission(permission) ? page : <RestrictedRoute />);
  const sliceOnly = (path: string, page: React.ReactElement) => (isSliceAdminTab(path) ? page : <Navigate to={fallback} replace />);

  return (
    <div className="cpm-screen cpm-admin">
      <WorkspaceHeader eyebrow="System" title="Administration"
        actions={<>
          {open?.howTo && <ObcButton variant="flat" onClick={() => setGuide(true)}>How to read</ObcButton>}
          <span ref={setSlot} className="cpm-admin-actions" />
        </>} />
      <div className="cpm-tabs-row cpm-admin-tabs">
        {visibleTabs.length > 0 && (
          <div className="cpm-tabs">
            <Tabs
              idBase="admin"
              label="Administration"
              options={visibleTabs.map(t => ({ value: t.path, label: t.label }))}
              value={active}
              onChange={path => navigate(path)}
            />
          </div>
        )}
        {hasPermission(AUDIT_PERMISSION) && (
          <div className="cpm-tabs-row__end">
            <ObcButton variant="flat" onClick={() => navigate(governanceHref())}>Audit log {'↗'}</ObcButton>
          </div>
        )}
      </div>
      <AdminActionsSlot.Provider value={slot}>
        <div className="cpm-admin__panel" {...tabPanelProps('admin', active)}>
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
            <Route index element={<Navigate to={fallback} replace />} />
            <Route path="*" element={<Navigate to={fallback} replace />} />
          </Routes>
        </div>
      </AdminActionsSlot.Provider>
      <AdminHowToRead tab={open?.howTo} open={guide} onClose={() => setGuide(false)} />
    </div>
  );
};

export default Administration;
