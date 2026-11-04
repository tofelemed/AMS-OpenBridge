/**
 * The plant selector (SPEC §6.1). It reads and writes the same URL scope as `useCpmScope`, so an
 * old page's own Site, Area and Unit selects and this control are one scope, never two.
 */
import React from 'react';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiHome } from '@oicl/openbridge-webcomponents-react/icons/icon-home';
import { useAreaFilters, useSiteFilters, useUnitFilters } from '../../components/Cpm/plantLocation';
import { useCpmScope } from '../../components/Cpm/plantScope';
import { Popover } from '../Popover';

interface Option { name: string; segment: string }

const nameOf = (options: Option[] | undefined, segment: string) =>
  options?.find(o => o.segment === segment)?.name ?? segment;

export const PlantSelector: React.FC<{ compact: boolean }> = ({ compact }) => {
  const scope = useCpmScope();
  const sites = useSiteFilters();
  const areas = useAreaFilters(scope.site);
  const units = useUnitFilters(scope.site, scope.area);

  const path = [
    scope.site && nameOf(sites.data, scope.site),
    scope.area && nameOf(areas.data, scope.area),
    scope.unit && nameOf(units.data, scope.unit),
  ].filter(Boolean).join(' › ');
  const summary = path || 'All sites';

  return (
    <Popover
      label="Plant scope"
      trigger={t => (
        <button
          type="button"
          className={`ui-control shell-trigger shell-trigger--plant${compact ? ' ui-control--icon' : ''}`}
          aria-label={`Plant scope: ${summary}`}
          {...t}
        >
          <span className="ui-icon"><ObiHome /></span>
          {!compact && <span className="shell-trigger__text">{summary}</span>}
          {!compact && <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>}
        </button>
      )}
    >
      <div className="shell-form">
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
          <button type="button" className="ui-link" onClick={() => scope.set({ site: '', area: '', unit: '' })}>Reset to all sites</button>
        )}
      </div>
    </Popover>
  );
};
