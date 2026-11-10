'use client';

/**
 * Explorer › Signals. One table: the signal and what it means, its value and unit, and Show in trend ↗. The values come
 * from the same hook as the Summary row, so both show the same number. The foot carries Signal bindings → and Open
 * signals in Trend ↗.
 *
 * CHG-158 (owner review, the owner's design): the second line says what the signal is for this loop; the UNS path moved
 * to the hover of that line (Signal bindings → shows and changes it). The signal quality is on Summary, and whether the
 * bindings resolve is a readiness cause in Open details, so the foot no longer repeats them.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { EmptyState } from '../shared';
import { registryHref, trendHref } from '../cpaHref';
import { PEN_ROLES, loopPens } from '../../Designer/trend/loopPens';
import { useSignalValues } from './summary/useSignalValues';
import { signalDescription, signalName } from './signalMeaning';

/**
 * Required roles first, then optional — the order the registry contract lists
 * them in (CpmLoopRegistryService.RequiredRoles / OptionalRoles). Rendering
 * Object.entries order reshuffled the list between loops.
 */
const SIGNAL_ORDER = ['PV', 'SP', 'OP', 'MODE', 'VP', 'STATUS', 'QUALITY', 'UPSTREAM', 'UTILITY'];

export const SignalsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const values = useSignalValues(loop);

  const roles = useMemo(() => {
    const rank = (r: string) => {
      const i = SIGNAL_ORDER.indexOf(r);
      return i === -1 ? SIGNAL_ORDER.length : i; // unknown roles last, then A-Z
    };
    return Object.entries(loop.tags).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [loop.tags]);

  const shown = (role: string): { value: string; unit: string } => {
    if (role === 'MODE') return { value: values.mode.label, unit: '' };
    const s = values.signals.find(x => x.role === role);
    return { value: s?.value ?? '—', unit: s?.value != null ? s.unit : '' };
  };

  const href = loopPens(loop).length > 0 ? trendHref(loop.loopId, { range: '8h' }) : null;

  return (
    <div>
      {roles.length === 0 && (
        <EmptyState title="No signal mappings" copy="The loop registry maps no PV / SP / OP tags for this loop, so no signal can be read or evaluated."
          next={[{ label: 'Map its tags in the Loop Registry', to: registryHref(loop.loopId) }]} />
      )}

      {roles.length > 0 && (
        <table className="cpm-signal-table cpm-signal-table--signals">
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Value</th>
              <th scope="col">Unit</th>
              <th scope="col"><span className="ui-sr">Trend</span></th>
            </tr>
          </thead>
          <tbody>
            {roles.map(([role, path]) => {
              const v = shown(role);
              // One pen per row: the same helper as the foot link, given this signal alone.
              const rowHref = (PEN_ROLES as readonly string[]).includes(role) ? trendHref(loop.loopId, { roles: [role], range: '8h' }) : null;
              return (
                <tr key={role}>
                  <th scope="row">
                    <span className="cpm-signal-table__name"><strong>{role}</strong> {signalName(role)}</span>
                    <span className="cpm-signal-table__about" title={path}>{signalDescription(role, loop)}</span>
                  </th>
                  <td className="cpm-signal-table__value">{v.value}</td>
                  <td>{v.unit}</td>
                  <td>
                    {rowHref && (
                      <ObcButton variant="flat" onClick={() => navigate(rowHref)}>Show in trend ↗</ObcButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="cpm-explorer-foot">
        <span className="cpm-explorer-foot__links">
          <ObcButton variant="flat" onClick={() => navigate(registryHref(loop.loopId))}>Signal bindings →</ObcButton>
          {href && (
            // The workflow endpoint of the signal-asset projection: these paths resolve through the UNS to the
            // loop's real data, so the standard Trend page can draw them: history and live tail.
            <ObcButton variant="flat" onClick={() => navigate(href)}>Open signals in Trend ↗</ObcButton>
          )}
        </span>
      </div>
    </div>
  );
};

export default SignalsTab;
