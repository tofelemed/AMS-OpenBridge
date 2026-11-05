/**
 * A destination's tabs around the old pages it will replace (PRM-004 Phase 2). `tab` belongs to the
 * host, so a page with its own tabs reads `sub` instead (SPEC §2.3). A tab the role cannot open is
 * not offered. Reached by URL, it shows the restricted state.
 */
import React, { useId } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { RequirePermission, RouteFallback } from '../../app/guards';
import { carryKind, misplacedKind, settleKind, type KindTab } from '../../cpa/tabKind';
import { useAuthStore } from '../../store/authStore';
import { Tabs, tabPanelProps } from '../../ui/Tabs';

export interface HostTab extends KindTab {
  value: string;
  label: string;
  /** The page's own route guard, unchanged. */
  permission?: string;
  /** A count beside the label. */
  badge?: number;
  render: () => React.ReactNode;
}

export const DestinationHost: React.FC<{ label: string; tabs: HostTab[] }> = ({ label, tabs }) => {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const idBase = useId();
  const offered = tabs.filter(t => !t.permission || hasPermission(t.permission));
  const active = tabs.find(t => t.value === params.get('tab')) ?? offered[0] ?? tabs[0];

  const select = (value: string) => setParams(p => {
    carryKind(p, active, tabs.find(t => t.value === value) ?? active);
    p.set('tab', value);
    p.delete('sub');
    return p;
  });

  if (misplacedKind(params, active)) {
    const clean = new URLSearchParams(params);
    settleKind(clean, active);
    return <Navigate to={`${pathname}?${clean.toString()}`} replace />;
  }

  const page = <React.Suspense fallback={<RouteFallback />}>{active.render()}</React.Suspense>;

  return (
    <div className="dest">
      <Tabs idBase={idBase} label={label} options={offered} value={active.value} onChange={select} />
      <div {...tabPanelProps(idBase, active.value)}>
        {active.permission ? <RequirePermission permission={active.permission}>{page}</RequirePermission> : page}
      </div>
    </div>
  );
};
