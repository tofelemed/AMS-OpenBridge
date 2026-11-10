/**
 * The sidebar: suite modules in order, absent ones hidden, then CPA's 17 pages under their six
 * headings. A heading with nothing the role may open is not shown. The rail keeps the icons and
 * drops the headings. The selected rule is written in shell.css (guide p.28). CHG-161 (owner
 * review): the list scrolls on a short screen, rail or not, and Collapse / Expand sits under it,
 * outside the scroll, so the menu can always be opened again; a rail tip is placed beside its entry
 * with fixed positioning, so the scrolling list cannot clip it.
 */
import React, { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ObiChart } from '@oicl/openbridge-webcomponents-react/icons/icon-chart';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { ObiCommandLocked } from '@oicl/openbridge-webcomponents-react/icons/icon-command-locked';
import { ObiDashboard } from '@oicl/openbridge-webcomponents-react/icons/icon-dashboard';
import { ObiDatabase } from '@oicl/openbridge-webcomponents-react/icons/icon-database';
import { ObiHistoryGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-history-google';
import { ObiListAltCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-list-alt-check-google';
import { ObiMediaPlay } from '@oicl/openbridge-webcomponents-react/icons/icon-media-play';
import { ObiMonitoring } from '@oicl/openbridge-webcomponents-react/icons/icon-monitoring';
import { ObiNotification } from '@oicl/openbridge-webcomponents-react/icons/icon-notification';
import { ObiSearch } from '@oicl/openbridge-webcomponents-react/icons/icon-search';
import { ObiSettingsIec } from '@oicl/openbridge-webcomponents-react/icons/icon-settings-iec';
import { ObiSpeed } from '@oicl/openbridge-webcomponents-react/icons/icon-speed';
import { ObiTable } from '@oicl/openbridge-webcomponents-react/icons/icon-table';
import { ObiTimerGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-timer-google';
import { ObiTrend } from '@oicl/openbridge-webcomponents-react/icons/icon-trend';
import { ObiUserSettings } from '@oicl/openbridge-webcomponents-react/icons/icon-user-settings';
import { ObiWrench } from '@oicl/openbridge-webcomponents-react/icons/icon-wrench';
import { cpaHref } from '../../components/Cpm/cpaHref';
import { SUITE_MODULES, destinationFor, visibleDestinations, type Destination, type DestinationId } from '../../cpa/destinations';
import { useAuthStore } from '../../store/authStore';

const ICONS: Record<DestinationId, React.ComponentType> = {
  overview: ObiDashboard,
  performance: ObiChart,
  events: ObiNotification,
  explorer: ObiDatabase,
  historical: ObiHistoryGoogle,
  investigation: ObiSearch,
  workbench: ObiListAltCheckGoogle,
  replay: ObiMediaPlay,
  windows: ObiTimerGoogle,
  calculations: ObiTable,
  response: ObiSpeed,
  registry: ObiWrench,
  config: ObiSettingsIec,
  trend: ObiTrend,
  pipeline: ObiMonitoring,
  administration: ObiUserSettings,
  governance: ObiCommandLocked,
};

/** Keeps the list's order, so each heading sits above its own entries. */
/** The rail's tip is fixed beside its entry: the list scrolls, and a scroller would clip a tip inside it. */
const placeTip = (e: React.SyntheticEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--nav-tip-top', `${r.top + r.height / 2}px`);
};

const byGroup = (items: Destination[]): Array<[string, Destination[]]> => {
  const groups = new Map<string, Destination[]>();
  for (const d of items) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  return [...groups.entries()];
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
      <div className="shell-nav__scroll">
      {modules.map(m => (
        <div key={m.id} className="shell-nav__module">
          <div className="shell-nav__module-name">{m.label}</div>
          {byGroup(items).map(([group, entries]) => (
            <div key={group} role="group" className="shell-nav__group" aria-label={group}>
              {!rail && <h2 className="shell-nav__group-name">{group}</h2>}
              <ul className="shell-nav__list">
                {entries.map(d => {
                  const Icon = ICONS[d.id];
                  return (
                    <li key={d.id} className="shell-nav__entry" onMouseEnter={placeTip} onFocus={placeTip}>
                      <Link
                        to={cpaHref(d.path, location.search)}
                        className="shell-nav__item"
                        aria-current={d.id === current ? 'page' : undefined}
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
        </div>
      ))}
      </div>
      {onToggle && (
        <button type="button" className="shell-nav__toggle" onClick={onToggle} aria-label={rail ? 'Expand navigation' : 'Collapse navigation'}>
          <span className="ui-icon">{rail ? <ObiChevronRightGoogle /> : <ObiChevronLeftGoogle />}</span>
          <span className="shell-nav__label">Collapse</span>
        </button>
      )}
    </nav>
  );
};
