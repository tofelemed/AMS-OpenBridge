import React, { useId } from 'react';

interface PermissionCheckboxProps {
  permissionKey: string;
  description?: string | null;
  checked: boolean;
  onToggle: () => void;
}

/**
 * One role permission (DEC-002 RD12). A native checkbox inside its label, so each one is announced
 * by its permission key; the OpenBridge checkbox announced every one as "Checkbox item".
 * CHG-172 (owner review): what the permission allows is on screen under the key (it was a hover title only), outside the label
 * so the name stays the key, and tied to the box as its description.
 */
const PermissionCheckbox: React.FC<PermissionCheckboxProps> = ({ permissionKey, description, checked, onToggle }) => {
  const id = useId();
  return (
    <div className="cpm-admin-perm">
      <label className="cpm-admin-perm__key">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-describedby={description ? id : undefined} />
        <span className="cpm-mono">{permissionKey}</span>
      </label>
      {description && <span id={id} className="cpm-admin-perm__what">{description}</span>}
    </div>
  );
};

export default PermissionCheckbox;
