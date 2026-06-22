import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Modal, FormField } from '../shared/Modal';

// ============================================================
// User Management & RBAC Configuration
// Manages users and roles mapping (Admin, Engineer, Operator).
// ============================================================

interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: 'Administrator' | 'Engineer' | 'Operator' | 'Read-Only';
  status: 'Active' | 'Suspended';
  lastLogin: string;
}

export const UserManagementConfig: React.FC = () => {
  const [users, setUsers] = useState<User[]>([
    { id: 'usr-1', username: 'admin', fullName: 'System Administrator', email: 'admin@plant.local', role: 'Administrator', status: 'Active', lastLogin: '10 mins ago' },
    { id: 'usr-2', username: 'jdoe', fullName: 'John Doe', email: 'jdoe@plant.local', role: 'Engineer', status: 'Active', lastLogin: '2 hours ago' },
    { id: 'usr-3', username: 'operator1', fullName: 'Control Room 1', email: 'cr1@plant.local', role: 'Operator', status: 'Active', lastLogin: 'Just now' },
    { id: 'usr-4', username: 'jsmith', fullName: 'Jane Smith', email: 'jsmith@plant.local', role: 'Read-Only', status: 'Suspended', lastLogin: '2 days ago' },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({
    username: '', fullName: '', email: '', role: 'Operator', status: 'Active'
  });

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ ...user });
    } else {
      setEditingUser(null);
      setFormData({ username: '', fullName: '', email: '', role: 'Operator', status: 'Active' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.username || !formData.fullName) {
      toast.error("Username and Full Name are required.");
      return;
    }
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600)); // Simulating network
    
    if (editingUser) {
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...formData } as User : u));
      toast.success("User updated successfully.");
    } else {
      setUsers([...users, { ...formData, id: `usr-${Date.now()}`, lastLogin: 'Never' } as User]);
      toast.success("New user created.");
    }
    
    setIsSaving(false);
    setIsModalOpen(false);
  };

  const toggleStatus = (id: string) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        const newStatus = u.status === 'Active' ? 'Suspended' : 'Active';
        toast.info(`User ${u.username} ${newStatus === 'Active' ? 'activated' : 'suspended'}.`);
        return { ...u, status: newStatus };
      }
      return u;
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>User Management & RBAC</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Manage operators, engineers, and access control policies.</p>
        </div>
        <button className="btn btn--primary" onClick={() => handleOpenModal()} style={{ fontSize: '13px' }}>
          + Add User
        </button>
      </div>

      <div style={{
        background: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        flex: 1
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Username</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Full Name</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Last Login</th>
              <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: u.status === 'Active' ? 1 : 0.6 }}>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: u.status === 'Active' ? 'var(--color-success)' : 'var(--alarm-critical)',
                      boxShadow: u.status === 'Active' ? '0 0 8px var(--color-success)' : 'none'
                    }} />
                    <span>{u.status}</span>
                  </div>
                </td>
                <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>{u.username}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>{u.fullName}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <span style={{ 
                    padding: '2px 8px', 
                    background: u.role === 'Administrator' ? 'rgba(255,23,68,0.1)' : 'var(--color-bg-elevated)', 
                    color: u.role === 'Administrator' ? 'var(--alarm-critical)' : 'var(--text-primary)',
                    border: '1px solid var(--color-border)', 
                    borderRadius: '12px', 
                    fontSize: '11px', 
                    fontWeight: 600 
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-muted)' }}>{u.lastLogin}</td>
                <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button className="btn btn--ghost" onClick={() => handleOpenModal(u)} style={{ padding: '4px 8px', fontSize: '12px' }}>Edit</button>
                    <button className="btn btn--ghost" onClick={() => toggleStatus(u.id)} style={{ padding: '4px 8px', fontSize: '12px', color: u.status === 'Active' ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {u.status === 'Active' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSaving && setIsModalOpen(false)}
        title={editingUser ? 'Edit User' : 'Add User'}
        icon="👤"
        width="500px"
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save User'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <FormField label="Username" required>
            <input type="text" className="input-field" value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} disabled={!!editingUser} />
          </FormField>
          <FormField label="Full Name" required>
            <input type="text" className="input-field" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
          </FormField>
          <FormField label="Email Address">
            <input type="email" className="input-field" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </FormField>
          <FormField label="System Role" required>
            <select className="input-field" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as User['role'] })}>
              <option value="Operator">Operator (Acknowledge & Monitor)</option>
              <option value="Engineer">Engineer (Shelve, Suppress & Config)</option>
              <option value="Administrator">Administrator (Full Access)</option>
              <option value="Read-Only">Read-Only View</option>
            </select>
          </FormField>
        </div>
      </Modal>
    </div>
  );
};
