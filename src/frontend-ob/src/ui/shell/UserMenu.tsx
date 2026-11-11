/**
 * The user control (SPEC §6.1). It also holds the route to Administration: the sidebar's System
 * entry needs `system.manage`, so a user administrator without it would otherwise lose the page.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiUser } from '@oicl/openbridge-webcomponents-react/icons/icon-user';
import { ADMINISTRATION_PERMISSIONS } from '../../cpa/destinations';
import { useAuthStore } from '../../store/authStore';
import { Popover } from '../Popover';

export const UserMenu: React.FC<{ compact: boolean }> = ({ compact }) => {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const hasPermission = useAuthStore(s => s.hasPermission);
  const navigate = useNavigate();
  const name = user?.full_name || user?.username || 'Signed in';
  const canAdmin = ADMINISTRATION_PERMISSIONS.some(p => hasPermission(p));

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Popover
      label="User"
      align="end"
      trigger={t => (
        <button
          type="button"
          className={`ui-control ui-control--ghost shell-trigger shell-trigger--user${compact ? ' ui-control--icon' : ''}`}
          aria-label={`User: ${name}`}
          {...t}
        >
          <span className="ui-icon"><ObiUser /></span>
          {!compact && <span className="shell-trigger__text">{name}</span>}
          {!compact && <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>}
        </button>
      )}
    >
      {close => (
        <div className="shell-user">
          <p className="shell-user__name">{name}</p>
          {user?.role && <p className="ui-meta">{user.role}</p>}
          {canAdmin && <Link className="ui-link" to="/admin" onClick={close}>Administration</Link>}
          <ObcButton variant="flat" onClick={() => void signOut()}>Sign out</ObcButton>
        </div>
      )}
    </Popover>
  );
};
