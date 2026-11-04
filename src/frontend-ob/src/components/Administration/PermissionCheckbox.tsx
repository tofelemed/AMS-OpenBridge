import React from 'react';
import { T } from '../../styles/theme';

interface PermissionCheckboxProps {
  permissionKey: string;
  description?: string | null;
  checked: boolean;
  onToggle: () => void;
}

/**
 * One role permission (DEC-002 RD12). A native checkbox inside its label, so each one is announced
 * by its permission key; the OpenBridge checkbox announced every one as "Checkbox item".
 */
const PermissionCheckbox: React.FC<PermissionCheckboxProps> = ({ permissionKey, description, checked, onToggle }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
    <input type="checkbox" checked={checked} onChange={onToggle} style={{ width: 16, height: 16, margin: 0 }} />
    <span style={{ fontSize: 12.5, color: T.textPrimary }} title={description ?? ''}>
      {permissionKey}
    </span>
  </label>
);

export default PermissionCheckbox;
