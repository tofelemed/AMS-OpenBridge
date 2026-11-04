/**
 * The application frame (SPEC §6.1, guide p.6): a 64 px header, a 220 px sidebar with a 64 px rail,
 * a drawer below 1024 px, a skip link and one `main`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { ObiMenu } from '@oicl/openbridge-webcomponents-react/icons/icon-menu';
import { ObiPaletteDay } from '@oicl/openbridge-webcomponents-react/icons/icon-palette-day';
import { ObiPaletteNight } from '@oicl/openbridge-webcomponents-react/icons/icon-palette-night';
import { ObiSearch } from '@oicl/openbridge-webcomponents-react/icons/icon-search';
import CommandPalette, { openCommandPalette, type PaletteNavItem } from '../../components/CommandPalette';
import { cpaHref } from '../../components/Cpm/cpaHref';
import { navItems } from '../../components/nav/navItems';
import { setActiveZone } from '../../cpa/activeZone';
import { DESTINATIONS } from '../../cpa/destinations';
import { useCpaContext } from '../../cpa/useCpaContext';
import { useContextCarry } from '../../cpa/useContextCarry';
import useDialogA11y from '../../hooks/useDialogA11y';
import { isSliceNavPath } from '../../productSlice';
import { useTheme } from '../../theme/ThemeContext';
import { PlantSelector } from './PlantSelector';
import { ShellNav } from './ShellNav';
import { useShellBand, useSidebarExpanded } from './shellHooks';
import { TimeRangeControl } from './TimeRangeControl';
import { UserMenu } from './UserMenu';
import './shell.css';

/** Build-time label, for example "Lab". Nothing is shown when the build does not set it. */
const ENVIRONMENT = (import.meta.env.VITE_ENV_LABEL as string | undefined)?.trim();

const PALETTE_ITEMS: PaletteNavItem[] = [
  ...DESTINATIONS.map(d => ({ path: d.path, label: d.label, group: 'CPA', anyOf: [...d.showTo] })),
  ...navItems.filter(i => isSliceNavPath(i.path) && !DESTINATIONS.some(d => d.path === i.path)),
];

const ThemeSwitch: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const night = theme === 'night';
  return (
    <button
      type="button"
      className="ui-control ui-control--ghost ui-control--icon"
      data-theme-switch
      aria-pressed={night}
      aria-label="Night mode"
      onClick={() => setTheme(night ? 'day' : 'night')}
    >
      <span className="ui-icon">{night ? <ObiPaletteNight /> : <ObiPaletteDay />}</span>
    </button>
  );
};

const NavDrawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const ref = useDialogA11y<HTMLDivElement>(onClose);
  return (
    <div className="shell-drawer">
      <div className="shell-drawer__scrim" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="shell-drawer__panel" role="dialog" aria-modal="true" aria-label="Navigation">
        <button type="button" className="ui-control ui-control--ghost ui-control--icon shell-drawer__close" aria-label="Close navigation" onClick={onClose}>
          <span className="ui-icon"><ObiCloseGoogle /></span>
        </button>
        <ShellNav rail={false} />
      </div>
    </div>
  );
};

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const band = useShellBand();
  const location = useLocation();
  const [expanded, toggleExpanded] = useSidebarExpanded();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useContextCarry();
  // Before the page renders, so old formatters print the zone the header names.
  setActiveZone(useCpaContext().zone.id);
  const compact = band === 'drawer';
  const rail = band === 'rail' || (band === 'wide' && !expanded);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useEffect(closeDrawer, [location.pathname, closeDrawer]);

  return (
    <div className={`shell${rail ? ' shell--rail' : ''}${compact ? ' shell--drawer' : ''}`}>
      <a className="shell__skip" href="#main-content" onClick={e => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <CommandPalette navItems={PALETTE_ITEMS} />

      <header className="shell__header">
        {compact && (
          <button type="button" className="ui-control ui-control--ghost ui-control--icon" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <span className="ui-icon"><ObiMenu /></span>
          </button>
        )}
        <Link to={cpaHref('/cpm', location.search)} className="shell__brand" aria-label="Traverse CPA, Overview">
          <span className="shell__wordmark">Traverse</span>
          <span className="shell__module">CPA</span>
        </Link>
        <PlantSelector compact={compact} />
        <button
          type="button"
          className={`ui-control shell__search${compact ? ' ui-control--icon' : ''}`}
          aria-label="Search loops, tags and records"
          aria-keyshortcuts="Control+K"
          onClick={openCommandPalette}
        >
          <span className="ui-icon"><ObiSearch /></span>
          {!compact && <span className="shell__search-text">Search loops, tags and records</span>}
          {!compact && <kbd className="shell__kbd">Ctrl K</kbd>}
        </button>
        <TimeRangeControl compact={compact} />
        {ENVIRONMENT && <span className="shell__env">{ENVIRONMENT}</span>}
        <ThemeSwitch />
        <UserMenu compact={compact} />
      </header>

      {!compact && (
        <aside className="shell__sidebar">
          <ShellNav rail={rail} onToggle={band === 'wide' ? toggleExpanded : undefined} />
        </aside>
      )}
      {compact && drawerOpen && <NavDrawer onClose={closeDrawer} />}

      <main ref={mainRef} id="main-content" tabIndex={-1} className="shell__main">
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
};
