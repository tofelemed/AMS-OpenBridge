import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import AuditExplorer from './AuditExplorer';
import { AlarmFeedConfig } from './AlarmFeedConfig';
import { AlarmRulesConfig } from './AlarmRulesConfig';
import { SystemSettingsConfig } from './SystemSettingsConfig';
import { UserManagementConfig } from './UserManagementConfig';
import { NotificationsConfig } from './NotificationsConfig';

// ============================================================
// Administration Module Stub
// ============================================================

const Administration: React.FC = () => {
  const location = useLocation();

  const tabs = [
    { path: '/admin/users', label: 'User Management' },
    { path: '/admin/alarm-feed', label: 'Alarm Feed' },
    { path: '/admin/alarm-rules', label: 'Alarm Rules' },
    { path: '/admin/notifications', label: 'Notifications' },
    { path: '/admin/audit', label: 'Audit Log' },
    { path: '/admin/system', label: 'System Settings' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--space-4)', gap: 'var(--space-4)' }}>
      
      <div style={{ background: 'var(--color-bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: 'var(--space-4)' }}>System Administration</h2>
        
        <div style={{ display: 'flex', gap: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
          {tabs.map(t => (
            <Link 
              key={t.path} 
              to={t.path}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                color: location.pathname.startsWith(t.path) ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                borderBottom: location.pathname.startsWith(t.path) ? '2px solid var(--accent-blue)' : '2px solid transparent',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '13px',
                marginBottom: '-1px'
              }}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, background: 'var(--color-bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 'var(--space-4)' }}>
        <Routes>
          <Route path="users" element={<UserManagementConfig />} />
          <Route path="alarm-feed" element={<AlarmFeedConfig />} />
          <Route path="opc-servers" element={<AlarmFeedConfig />} />
          <Route path="alarm-rules" element={<AlarmRulesConfig />} />
          <Route path="notifications" element={<NotificationsConfig />} />
          <Route path="audit" element={<AuditExplorer />} />
          <Route path="system" element={<SystemSettingsConfig />} />
        </Routes>
      </div>

    </div>
  );
};

const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
    <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>{title}</h3>
    <p style={{ fontSize: '13px' }}>This administrative module is pending full implementation.</p>
  </div>
);

export default Administration;
