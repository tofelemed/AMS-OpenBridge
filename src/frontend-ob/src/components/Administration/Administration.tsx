'use client';

import React from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { UserManagementConfig }  from './UserManagementConfig';
import { RolesConfig }           from './RolesConfig';
import { AlarmFeedConfig }       from './AlarmFeedConfig';
import { AlarmRulesConfig }      from './AlarmRulesConfig';
import { DataSourcesConfig }     from './DataSourcesConfig';
import { PlantModelConfig }      from './PlantModelConfig';
import { AliasConfig }           from './AliasConfig';
import { NotificationsConfig }   from './NotificationsConfig';
import { SystemSettingsConfig }  from './SystemSettingsConfig';
import AuditExplorer             from './AuditExplorer';
import { useAuthStore }          from '../../store/authStore';
import { HOME_PATH, isSliceAdminTab } from '../../productSlice';
import { T } from '../../styles/theme';
// obi-* icons (closest-semantic — no exact shield/lock icon exists in OpenBridge).
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ObiSettingsUserIec } from '@oicl/openbridge-webcomponents-react/icons/icon-settings-user-iec';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiClipboard } from '@oicl/openbridge-webcomponents-react/icons/icon-clipboard';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
// Closest-semantic obi icons for the UNS pages: a structural grid for the plant
// model tree, an id-tag for the OT tag→path aliases.
import { ObiChartGridIec } from '@oicl/openbridge-webcomponents-react/icons/icon-chart-grid-iec';
import { ObiIdTag } from '@oicl/openbridge-webcomponents-react/icons/icon-id-tag';

/* Design tokens (shared with Dashboard) */

const TABS = [
  { path: '/admin/users',         label: 'User Management',     Icon: ObiUser, permission: 'admin.users.edit' },
  { path: '/admin/roles',         label: 'Roles & Permissions', Icon: ObiSettingsUserIec, permission: 'rbac.manage' },
  { path: '/admin/alarm-feed',    label: 'Alarm Feed',          Icon: ObiMonitoring },
  { path: '/admin/data-sources',  label: 'Data Sources',        Icon: ObiDatabase, permission: 'ingestion.view' },
  // Reads gate on asset.view (any role); writes inside the pages need asset.edit.
  { path: '/admin/plant-model',   label: 'Plant Model',         Icon: ObiChartGridIec, permission: 'asset.view' },
  { path: '/admin/aliases',       label: 'Tag Aliases',         Icon: ObiIdTag, permission: 'asset.view' },
  { path: '/admin/alarm-rules',   label: 'Alarm Rules',         Icon: ObiListAltCheckGoogle },
  { path: '/admin/notifications', label: 'Notifications',       Icon: ObiNotification },
  { path: '/admin/audit',         label: 'Audit Log',           Icon: ObiClipboard },
  { path: '/admin/system',        label: 'System Settings',     Icon: ObiWrench },
];

const Administration: React.FC = () => {
  const location = useLocation();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canManageUsers = hasPermission('admin.users.edit');
  const canManageRbac = hasPermission('rbac.manage');
  const visibleTabs = TABS.filter(t => isSliceAdminTab(t.path) && (!t.permission || hasPermission(t.permission)));
  const fallback = visibleTabs[0]?.path ?? HOME_PATH;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '4px 0' }}>

      {/* ── Page header ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            System Administration
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
            User management, plant model, data sources, and audit
          </p>
        </div>
      </div>

      {/* ── Tab navigation ───────────────────────── */}
      <div style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: '6px 8px',
        boxShadow: T.shadow,
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
      }}>
        {visibleTabs.map(t => {
          const isActive = location.pathname.startsWith(t.path);
          return (
            <Link
              key={t.path}
              to={t.path}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                padding: '8px 16px',
                borderRadius: T.radiusSm,
                fontSize: '13px', fontWeight: isActive ? 700 : 500,
                color: isActive ? T.blue : T.textSecondary,
                background: isActive ? T.blueLight : 'transparent',
                border: isActive ? `1.5px solid ${T.blueMuted}` : '1.5px solid transparent',
                textDecoration: 'none',
                transition: 'all 140ms ease',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = T.blueLight;
                  (e.currentTarget as HTMLAnchorElement).style.color = T.blue;
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color = T.textSecondary;
                }
              }}
            >
              <span className="admin-tab-icon" style={{ display: 'inline-flex' }}><t.Icon /></span>
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ── Content area ─────────────────────────── */}
      <div style={{
        background: T.card,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: '24px',
        flex: 1,
        overflow: 'auto',
        boxShadow: T.shadow,
      }}>
        <Routes>
          <Route
            path="users"
            element={canManageUsers ? <UserManagementConfig /> : <Navigate to={fallback} replace />}
          />
          <Route
            path="roles"
            element={canManageRbac ? <RolesConfig /> : <Navigate to={fallback} replace />}
          />
          <Route path="alarm-feed"    element={isSliceAdminTab('/admin/alarm-feed') ? <AlarmFeedConfig /> : <Navigate to={fallback} replace />} />
          <Route path="opc-servers"   element={isSliceAdminTab('/admin/alarm-feed') ? <AlarmFeedConfig /> : <Navigate to={fallback} replace />} />
          <Route
            path="data-sources"
            element={hasPermission('ingestion.view') ? <DataSourcesConfig /> : <Navigate to={fallback} replace />}
          />
          <Route
            path="plant-model"
            element={hasPermission('asset.view') ? <PlantModelConfig /> : <Navigate to={fallback} replace />}
          />
          <Route
            path="aliases"
            element={hasPermission('asset.view') ? <AliasConfig /> : <Navigate to={fallback} replace />}
          />
          <Route path="alarm-rules"   element={isSliceAdminTab('/admin/alarm-rules') ? <AlarmRulesConfig /> : <Navigate to={fallback} replace />} />
          <Route path="notifications" element={isSliceAdminTab('/admin/notifications') ? <NotificationsConfig /> : <Navigate to={fallback} replace />} />
          <Route path="audit"         element={<AuditExplorer />} />
          <Route path="system"        element={<SystemSettingsConfig />} />
          <Route index element={<Navigate to={fallback} replace />} />
          <Route path="*" element={<Navigate to={fallback} replace />} />
        </Routes>
      </div>

    </div>
  );
};

export default Administration;
