/**
 * A destination's tabs around the old pages it will replace (PRM-004 Phase 2). `tab` belongs to the
 * host, so a page with its own tabs reads `sub` instead (SPEC §2.3). A tab the role cannot open is
 * not offered. Reached by URL, it shows the restricted state.
 */
import React, { useId, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { RestrictedRoute, RouteFallback } from '../../app/guards';
import { TabEndContext } from '../../cpa/tabEnd';
import { carryKind, misplacedKind, settleKind, type KindTab } from '../../cpa/tabKind';
import { useAuthStore } from '../../store/authStore';
import { Tabs, tabPanelProps } from '../../ui/Tabs';

export interface HostTab extends KindTab {
  value: string;
  label: string;
  /** The rule of the page this tab replaces, unchanged. With both set, both must hold. */
  permission?: string;
  anyOf?: readonly string[];
  /** A count beside the label. */
  badge?: number;
  render: () => React.ReactNode;
}

export const DestinationHost: React.FC<{ label: string; tabs: HostTab[] }> = ({ label, tabs }) => {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const idBase = useId();
  const [tabEnd, setTabEnd] = useState<HTMLElement | null>(null);
  const canOpen = (t: HostTab) => (!t.permission || hasPermission(t.permission)) && (!t.anyOf || t.anyOf.some(hasPermission));
  const offered = tabs.filter(canOpen);
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
      <div className="dest__tabrow">
        <Tabs idBase={idBase} label={label} options={offered} value={active.value} onChange={select} />
        <div className="dest__tabend" ref={setTabEnd} />
      </div>
      <div {...tabPanelProps(idBase, active.value)}>
        <TabEndContext.Provider value={tabEnd}>
          {canOpen(active) ? page : <RestrictedRoute />}
        </TabEndContext.Provider>
      </div>
    </div>
  );
};
