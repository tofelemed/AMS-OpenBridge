/**
 * The plant selector (SPEC §6.1): the one place to choose Site, Area and Unit (CHG-128). The scope
 * lives in the URL, so every page reads it. Below 1024 px the control is an icon, so a slim line
 * under the header names the scope whenever one is set.
 */
import React from 'react';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { ObiHome } from '@oicl/openbridge-webcomponents-react/icons/icon-home';
import { useAreaFilters, useSiteFilters, useUnitFilters } from '../../components/Cpm/plantLocation';
import { useCpmScope } from '../../components/Cpm/plantScope';
import { useCpmLoops } from '../../hooks/useCpm';
import { Popover } from '../Popover';

interface Option { name: string; segment: string }

const nameOf = (options: Option[] | undefined, segment: string) =>
  options?.find(o => o.segment === segment)?.name ?? segment;

const loopsText = (n: number) => `${n} ${n === 1 ? 'loop' : 'loops'}`;

function useScopeSummary() {
  const scope = useCpmScope();
  const sites = useSiteFilters();
  const areas = useAreaFilters(scope.site);
  const units = useUnitFilters(scope.site, scope.area);
  const loops = useCpmLoops();
  const path = [
    scope.site && nameOf(sites.data, scope.site),
    scope.area && nameOf(areas.data, scope.area),
    scope.unit && nameOf(units.data, scope.unit),
  ].filter(Boolean).join(' › ');
  const list = loops.data?.loops;
  return {
    scope, sites, areas, units,
    summary: path || 'All sites',
    count: list ? loopsText(list.filter(l => scope.matches(l)).length) : null,
  };
}

/** Under the header on small screens, only while a scope is set. */
export const PlantScopeLine: React.FC = () => {
  const { scope, summary, count } = useScopeSummary();
  if (!scope.active) return null;
  return (
    <div className="shell__scope-line" role="status">
      <span>{summary}{count && ` · ${count}`}</span>
      <button type="button" className="ui-control ui-control--ghost ui-control--icon" aria-label="Reset to all sites"
        onClick={() => scope.set({ site: '', area: '', unit: '' })}>
        <span className="ui-icon"><ObiCloseGoogle /></span>
      </button>
    </div>
  );
};

export const PlantSelector: React.FC<{ compact: boolean }> = ({ compact }) => {
  const { scope, sites, areas, units, summary, count } = useScopeSummary();

  return (
    <Popover
      label="Plant scope"
      trigger={t => (
        <button
          type="button"
          className={`ui-control shell-trigger shell-trigger--plant${compact ? ' ui-control--icon' : ''}`}
          aria-label={`Plant scope: ${summary}${count ? `, ${count}` : ''}`}
          {...t}
        >
          <span className="ui-icon"><ObiHome /></span>
          {!compact && <span className="shell-trigger__text">{summary}</span>}
          {!compact && count && <span className="shell-trigger__count">· {count}</span>}
          {!compact && <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>}
        </button>
      )}
    >
      {close => <div className="shell-form">
        <label className="ui-field">
          <span className="ui-field__label">Site</span>
          <select className="ui-select" value={scope.site} onChange={e => scope.set({ site: e.target.value })}>
            <option value="">All sites</option>
            {(sites.data ?? []).map(o => <option key={o.segment} value={o.segment}>{o.name}</option>)}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Area</span>
          <select className="ui-select" value={scope.area} disabled={!scope.site} onChange={e => scope.set({ area: e.target.value })}>
            <option value="">{scope.site ? 'All areas' : 'Select a site first'}</option>
            {(areas.data ?? []).map(o => <option key={o.segment} value={o.segment}>{o.name}</option>)}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-field__label">Unit</span>
          <select className="ui-select" value={scope.unit} disabled={!scope.site} onChange={e => scope.set({ unit: e.target.value })}>
            <option value="">{scope.site ? 'All units' : 'Select a site first'}</option>
            {(units.data ?? []).map(o => <option key={o.segment} value={o.segment}>{o.name}</option>)}
          </select>
        </label>
        {sites.isError && <p className="ui-field__error" role="alert">Plant locations are unavailable.</p>}
        {scope.active && (
          <button type="button" className="ui-link" onClick={() => { close(); scope.set({ site: '', area: '', unit: '' }); }}>Reset to all sites</button>
        )}
      </div>}
    </Popover>
  );
};
