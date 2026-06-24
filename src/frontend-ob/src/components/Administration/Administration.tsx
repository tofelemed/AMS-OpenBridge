'use client';

import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { UserManagementConfig }  from './UserManagementConfig';
import { AlarmFeedConfig }       from './AlarmFeedConfig';
import { AlarmRulesConfig }      from './AlarmRulesConfig';
import { NotificationsConfig }   from './NotificationsConfig';
import { SystemSettingsConfig }  from './SystemSettingsConfig';
import AuditExplorer             from './AuditExplorer';

/* Design tokens (shared with Dashboard) */
const T = {
  blue:          '#31598F',
  blueLight:     '#EAF2FF',
  blueMuted:     '#C4D8F0',
  bg:            '#F6F8FB',
  card:          '#FFFFFF',
  border:        '#DDE3EA',
  textPrimary:   '#1F2937',
  textSecondary: '#6B7280',
  textMuted:     '#9CA3AF',
  radius:        '12px',
  radiusSm:      '8px',
  shadow:        '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

const TABS = [
  { path: '/admin/users',         label: 'User Management', icon: '👤' },
  { path: '/admin/alarm-feed',    label: 'Alarm Feed',      icon: '📡' },
  { path: '/admin/alarm-rules',   label: 'Alarm Rules',     icon: '⚙' },
  { path: '/admin/notifications', label: 'Notifications',   icon: '🔔' },
  { path: '/admin/audit',         label: 'Audit Log',       icon: '🔒' },
  { path: '/admin/system',        label: 'System Settings', icon: '🛠' },
];

const Administration: React.FC = () => {
  const location = useLocation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px', padding: '4px 0' }}>

      {/* ── Page header ──────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, margin: 0, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            System Administration
          </h1>
          <p style={{ color: T.textSecondary, fontSize: '13.5px', margin: '5px 0 0' }}>
            User management, alarm configuration, and system settings
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
        {TABS.map(t => {
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
              <span style={{ fontSize: '14px' }}>{t.icon}</span>
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
          <Route path="users"         element={<UserManagementConfig />} />
          <Route path="alarm-feed"    element={<AlarmFeedConfig />} />
          <Route path="opc-servers"   element={<AlarmFeedConfig />} />
          <Route path="alarm-rules"   element={<AlarmRulesConfig />} />
          <Route path="notifications" element={<NotificationsConfig />} />
          <Route path="audit"         element={<AuditExplorer />} />
          <Route path="system"        element={<SystemSettingsConfig />} />
        </Routes>
      </div>

    </div>
  );
};

export default Administration;
