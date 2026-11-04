/**
 * The sidebar (SPEC §6.1, RD4): suite modules in order, absent ones hidden, then CPA's
 * destinations. The selected rule is written in shell.css (guide p.28).
 */
import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ObiChart } from '@oicl/openbridge-webcomponents-react/icons/icon-chart';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ObiDashboard } from '@oicl/openbridge-webcomponents-react/icons/icon-dashboard';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { cpaHref } from '../../components/Cpm/cpaHref';
import { SUITE_MODULES, destinationFor, visibleDestinations, type DestinationId } from '../../cpa/destinations';
import { useAuthStore } from '../../store/authStore';

const ICONS: Record<DestinationId, React.ComponentType> = {
  overview: ObiDashboard,
  performance: ObiChart,
  episodes: ObiNotification,
  loop: ObiDatabase,
  evidence: ObiListAltCheckGoogle,
  setup: ObiWrench,
  system: ObiMonitoring,
};

export const ShellNav: React.FC<{
  rail: boolean;
  /** Absent in the drawer, which closes instead of collapsing. */
  onToggle?: () => void;
}> = ({ rail, onToggle }) => {
  const location = useLocation();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const current = destinationFor(location.pathname)?.id;
  const items = visibleDestinations(hasPermission);
  const navRef = useRef<HTMLElement>(null);
  const modules = SUITE_MODULES.filter(m => m.deployed);

  return (
    <nav
      ref={navRef}
      className={`shell-nav${rail ? ' shell-nav--rail' : ''}`}
      aria-label="Traverse modules"
      onKeyDown={e => { if (e.key === 'Escape') navRef.current?.classList.add('shell-nav--tips-off'); }}
      onPointerMove={() => navRef.current?.classList.remove('shell-nav--tips-off')}
    >
      {modules.map(m => (
        <div key={m.id} className="shell-nav__module">
          <div className="shell-nav__module-name">{m.label}</div>
          <ul className="shell-nav__list">
            {items.map(d => {
              const Icon = ICONS[d.id];
              const selected = d.id === current;
              return (
                <li key={d.id} className="shell-nav__entry">
                  <Link
                    to={cpaHref(d.path, location.search)}
                    className="shell-nav__item"
                    aria-current={selected ? 'page' : undefined}
                    aria-label={d.label}
                    aria-describedby={`nav-tip-${d.id}`}
                  >
                    <span className="ui-icon"><Icon /></span>
                    <span className="shell-nav__label">{d.label}</span>
                  </Link>
                  <span id={`nav-tip-${d.id}`} role="tooltip" className="shell-nav__tip">
                    {rail && <strong>{d.label}</strong>}
                    {d.purpose}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {onToggle && (
        <button type="button" className="shell-nav__toggle" onClick={onToggle} aria-label={rail ? 'Expand navigation' : 'Collapse navigation'}>
          <span className="ui-icon">{rail ? <ObiChevronRightGoogle /> : <ObiChevronLeftGoogle />}</span>
          <span className="shell-nav__label">Collapse</span>
        </button>
      )}
    </nav>
  );
};
