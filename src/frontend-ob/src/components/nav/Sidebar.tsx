/**
 * The application sidebar (moved out of App.tsx 2026-10-05).
 *
 * Loop Performance entries render under task sub-headings with a tooltip that
 * says what the page answers, and moving between them keeps the selected loop
 * and plant scope (cpmTasks.ts, SME review points 1-2).
 */
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';
import { useAuthStore } from '../../store/authStore';
import { isSliceNavPath } from '../../productSlice';
import { navItems } from './navItems';
import { cpmNavHref } from './cpmTasks';

// Collapsed nav groups persist across navigation and reload, so an operator who
// closes the sections they don't use keeps them closed. Stored as the list of
// COLLAPSED group names (default: nothing collapsed → same as before).
const NAV_COLLAPSED_KEY = 'ams-nav-collapsed-groups';
function readCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(NAV_COLLAPSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

const Sidebar: React.FC<{ unackedCount: number }> = ({ unackedCount }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  // `anyOf` (e.g. the single Administration entry) shows when the user holds ANY
  // of the listed permissions; otherwise fall back to the single `permission`.
  const visibleNavItems = navItems.filter(i => {
    if (!isSliceNavPath(i.path)) return false;
    if (i.anyOf) return i.anyOf.some(p => hasPermission(p));
    return !i.permission || hasPermission(i.permission);
  });
  const groups = [...new Set(visibleNavItems.map(i => i.group))];

  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsedGroups);

  // Exactly one entry is active: the LONGEST nav path the location sits under. A plain
  // segment-boundary test kept '/cpm' (Overview) lit on every '/cpm/*' page, so the sidebar
  // showed two active entries (2026-09-17 UI audit).
  const matches = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
  const activePath = visibleNavItems.map(i => i.path).filter(matches).sort((a, b) => b.length - a.length)[0];
  const isActivePath = (path: string) => path === activePath;
  const activeGroup = visibleNavItems.find(i => i.path === activePath)?.group;

  const toggleGroup = (group: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      try { localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <nav style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
      {groups.map(group => {
        // The group holding the current page is always shown, even if the user
        // collapsed it — so navigation (e.g. via ⌘K) never lands on a hidden item.
        const open = !collapsed.has(group) || group === activeGroup;
        const groupItems = visibleNavItems.filter(i => i.group === group);
        return (
          <div key={group} className="nav-section">
            <button
              type="button"
              className="nav-section__title nav-section__title--toggle"
              onClick={() => toggleGroup(group)}
              aria-expanded={open}
            >
              <span>{group}</span>
              <span className="nav-section__chevron">
                {open ? <ObiChevronDownGoogle /> : <ObiChevronRightGoogle />}
              </span>
            </button>
            {open && groupItems.map((item, idx) => {
              const isActive = isActivePath(item.path);
              const startsSubgroup = item.subgroup && item.subgroup !== groupItems[idx - 1]?.subgroup;
              return (
                <React.Fragment key={item.path}>
                  {startsSubgroup && <div className="nav-subsection__title">{item.subgroup}</div>}
                  <button
                    className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                    title={item.hint}
                    onClick={() => navigate(cpmNavHref(item.path, location.pathname, location.search))}
                  >
                    {/* OpenBridge icons, not emoji: emoji render differently per-OS, ignore the theme, and
                        are not part of the design system. Where OpenBridge has no matching icon we use
                        ObiPlaceholder rather than inventing one. */}
                    <span className="nav-item__icon"><item.Icon /></span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.badge === 'alarms' && unackedCount > 0 && (
                      <span className="nav-item__badge">{unackedCount}</span>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
};

export default Sidebar;
