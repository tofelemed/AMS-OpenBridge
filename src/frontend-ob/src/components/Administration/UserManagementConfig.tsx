'use client';

import React, { useState } from 'react';
import { Modal, FormField } from '../shared/Modal';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

const T = {
  blue: '#31598F', blueLight: '#EAF2FF', blueMuted: '#C4D8F0',
  bg: '#F6F8FB', card: '#FFFFFF', border: '#DDE3EA', borderLight: '#EEF2F7',
  textPrimary: '#1F2937', textSecondary: '#6B7280', textMuted: '#9CA3AF',
  success: '#2E8B57', successBg: '#ECFDF5', successBorder: '#A7F3D0',
  critical: '#D64545', criticalBg: '#FEF2F2', criticalBorder: '#FCA5A5',
  warning: '#B45309', warningBg: '#FFFBEB', warningBorder: '#FDE68A',
  radius: '12px', radiusSm: '8px',
  shadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05)',
} as const;

interface User {
  id: string; username: string; fullName: string; email: string;
  role: 'Administrator' | 'Engineer' | 'Operator' | 'Read-Only';
  status: 'Active' | 'Suspended'; lastLogin: string;
}

const ROLE_STYLES: Record<User['role'], { bg: string; color: string; border: string }> = {
  'Administrator': { bg: T.criticalBg,  color: T.critical, border: T.criticalBorder },
  'Engineer':      { bg: T.warningBg,   color: T.warning,  border: T.warningBorder },
  'Operator':      { bg: T.blueLight,   color: T.blue,     border: T.blueMuted },
  'Read-Only':     { bg: T.bg,          color: T.textMuted, border: T.border },
};

export const UserManagementConfig: React.FC = () => {
  const [users, setUsers] = useState<User[]>([
    { id: 'usr-1', username: 'admin',     fullName: 'System Administrator', email: 'admin@plant.local',    role: 'Administrator', status: 'Active',    lastLogin: '10 mins ago' },
    { id: 'usr-2', username: 'jdoe',      fullName: 'John Doe',             email: 'jdoe@plant.local',     role: 'Engineer',      status: 'Active',    lastLogin: '2 hours ago' },
    { id: 'usr-3', username: 'operator1', fullName: 'Control Room 1',       email: 'cr1@plant.local',      role: 'Operator',      status: 'Active',    lastLogin: 'Just now' },
    { id: 'usr-4', username: 'jsmith',    fullName: 'Jane Smith',           email: 'jsmith@plant.local',   role: 'Read-Only',     status: 'Suspended', lastLogin: '2 days ago' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser,  setEditingUser]  = useState<User | null>(null);
  const [isSaving,     setIsSaving]     = useState(false);
  const [formData,     setFormData]     = useState<Partial<User>>({ username: '', fullName: '', email: '', role: 'Operator', status: 'Active' });

  const handleOpenModal = (user?: User) => {
    setEditingUser(user ?? null);
    setFormData(user ? { ...user } : { username: '', fullName: '', email: '', role: 'Operator', status: 'Active' });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.username || !formData.fullName) return;
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    if (editingUser) {
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...formData } as User : u));
    } else {
      setUsers([...users, { ...formData, id: `usr-${Date.now()}`, lastLogin: 'Never' } as User]);
    }
    setIsSaving(false);
    setIsModalOpen(false);
  };

  const toggleStatus = (id: string) =>
    setUsers(users.map(u => u.id === id ? { ...u, status: u.status === 'Active' ? 'Suspended' : 'Active' } : u));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Sub-header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: T.textPrimary, margin: 0 }}>
            User Management & RBAC
          </h3>
          <p style={{ fontSize: '13px', color: T.textSecondary, margin: '4px 0 0' }}>
            Manage operators, engineers, and access control policies.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: T.blue, color: '#fff', border: 'none',
            borderRadius: T.radiusSm, padding: '8px 18px',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#4069A5')}
          onMouseLeave={e => (e.currentTarget.style.background = T.blue)}
        >
          + Add User
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Total Users',   value: users.length },
          { label: 'Active',        value: users.filter(u => u.status === 'Active').length,    color: T.success },
          { label: 'Suspended',     value: users.filter(u => u.status === 'Suspended').length, color: T.critical },
          { label: 'Administrators',value: users.filter(u => u.role === 'Administrator').length,color: T.warning },
        ].map(s => (
          <div key={s.label} style={{ background: T.bg, border: `1px solid ${T.borderLight}`, borderRadius: T.radiusSm, padding: '12px 16px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: s.color ?? T.textPrimary, fontVariantNumeric: 'tabular-nums', marginTop: '3px' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: T.bg }}>
              {['Status', 'Username', 'Full Name', 'Email', 'Role', 'Last Login', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '11px 16px', textAlign: 'left',
                  fontSize: '10.5px', fontWeight: 700, color: T.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: `1.5px solid ${T.border}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const role = ROLE_STYLES[u.role];
              return (
                <tr
                  key={u.id}
                  style={{ opacity: u.status === 'Active' ? 1 : 0.55, borderBottom: `1px solid ${T.borderLight}`, background: T.card }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.blueLight)}
                  onMouseLeave={e => (e.currentTarget.style.background = T.card)}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                        background: u.status === 'Active' ? T.success : T.critical,
                        boxShadow: u.status === 'Active' ? `0 0 5px ${T.success}` : 'none',
                      }} />
                      <span style={{ fontSize: '12px', color: u.status === 'Active' ? T.success : T.critical, fontWeight: 600 }}>
                        {u.status}
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: T.textPrimary, fontFamily: "'Noto Sans Mono', monospace" }}>
                    {u.username}
                  </td>
                  <td style={{ padding: '12px 16px', color: T.textPrimary }}>{u.fullName}</td>
                  <td style={{ padding: '12px 16px', color: T.textSecondary, fontSize: '12px' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '3px 10px', borderRadius: '20px',
                      fontSize: '11px', fontWeight: 700,
                      background: role.bg, color: role.color,
                      border: `1px solid ${role.border}`,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: T.textMuted, fontSize: '12px' }}>{u.lastLogin}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <ActionBtn onClick={() => handleOpenModal(u)}>Edit</ActionBtn>
                      <ActionBtn onClick={() => toggleStatus(u.id)} danger={u.status === 'Active'}>
                        {u.status === 'Active' ? 'Suspend' : 'Activate'}
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add New User'}
        icon="👤"
        width="500px"
        footer={
          <>
            <ObcButton variant="flat" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</ObcButton>
            <ObcButton variant="raised" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save User'}
            </ObcButton>
          </>
        }
      >
        <FormField label="Username" required>
          <input type="text" className="ob-input" style={{ width: '100%' }} value={formData.username}
            onChange={e => setFormData({ ...formData, username: e.target.value })} disabled={!!editingUser} />
        </FormField>
        <FormField label="Full Name" required>
          <input type="text" className="ob-input" style={{ width: '100%' }} value={formData.fullName}
            onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
        </FormField>
        <FormField label="Email Address">
          <input type="email" className="ob-input" style={{ width: '100%' }} value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })} />
        </FormField>
        <FormField label="System Role" required>
          <select className="ob-input" style={{ width: '100%' }} value={formData.role}
            onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}>
            <option value="Operator">Operator — Acknowledge & Monitor</option>
            <option value="Engineer">Engineer — Shelve, Suppress & Config</option>
            <option value="Administrator">Administrator — Full Access</option>
            <option value="Read-Only">Read-Only View</option>
          </select>
        </FormField>
      </Modal>
    </div>
  );
};

const ActionBtn: React.FC<{ onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ onClick, danger, children }) => (
  <button
    onClick={onClick}
    style={{
      padding: '5px 12px', fontSize: '11.5px', fontWeight: 600,
      borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${danger ? '#FCA5A5' : T.border}`,
      background: danger ? T.criticalBg : T.bg,
      color: danger ? T.critical : T.textSecondary,
      transition: 'all 120ms ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.background = danger ? T.critical : T.blueLight;
      e.currentTarget.style.color = danger ? '#fff' : T.blue;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.background = danger ? T.criticalBg : T.bg;
      e.currentTarget.style.color = danger ? T.critical : T.textSecondary;
    }}
  >
    {children}
  </button>
);
