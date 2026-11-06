'use client';

/**
 * Explorer › Signals. One table: the signal, its value and unit, and Show in trend ↗; the UNS path is the second
 * line of the signal. The values come from the same hook as the Summary row, so both show the same number. The
 * foot carries the signal quality, the binding state, Signal bindings → and Open signals in Trend ↗.
 *
 * The binding state is a LOOP-level check (`binding_provenance`), so it is stated once, for the loop, not on each
 * role. Binding provenance and the "no VP mapping" note are causes in the workspace banner.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmReadiness } from '../../../hooks/useCpm';
import { EmptyState, QueryError, TonePill, loopTrendHref } from '../shared';
import { FacetPill } from '../FacetPill';
import { registryHref } from '../cpaHref';
import { useSignalValues } from './summary/useSignalValues';

const SIGNAL_MEANINGS: Record<string, string> = {
  PV: 'Process variable',
  SP: 'Setpoint',
  OP: 'Controller output',
  MODE: 'Controller mode',
  VP: 'Valve position feedback',
  QUALITY: 'Source quality',
  UPSTREAM: 'Upstream context signal',
  STATUS: 'Status signal',
  UTILITY: 'Utility signal',
};

/**
 * Required roles first, then optional — the order the registry contract lists
 * them in (CpmLoopRegistryService.RequiredRoles / OptionalRoles). Rendering
 * Object.entries order reshuffled the list between loops.
 */
const SIGNAL_ORDER = ['PV', 'SP', 'OP', 'MODE', 'VP', 'STATUS', 'QUALITY', 'UPSTREAM', 'UTILITY'];

export const SignalsTab: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const navigate = useNavigate();
  const readiness = useCpmReadiness(loop.loopId);
  const provenance = readiness.data?.checks.find(c => c.id === 'binding_provenance');
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

  const href = loopTrendHref(loop.tags);

  return (
    <div>
      {/* Readiness is what tells this tab whether a binding actually resolves.
          If the check itself failed, say so — silence here reads as "all clear". */}
      {readiness.isError && (
        <QueryError title="Binding provenance check unavailable"
          error={readiness.error} retry={() => void readiness.refetch()} />
      )}

      {roles.length === 0 && (
        <EmptyState title="No signal mappings" copy="The loop registry maps no PV / SP / OP tags for this loop, so no signal can be read or evaluated."
          next={[{ label: 'Map its tags in the Loop Registry', to: registryHref(loop.loopId) }]} />
      )}

      {roles.length > 0 && (
        <table className="cpm-signal-table">
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
              const rowHref = loopTrendHref({ [role]: path });
              return (
                <tr key={role}>
                  <th scope="row">
                    <span>{role}</span>{' '}
                    <span className="cpm-event-row__sub">{SIGNAL_MEANINGS[role] ?? role}</span>
                    <span className="cpm-signal-path cpm-mono">{path}</span>
                  </th>
                  <td className="cpm-mono">{v.value}</td>
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
        <FacetPill facet="signal" tone={values.quality.tone}>{values.quality.text}</FacetPill>
        <span className="cpm-signal-provenance">
          <span className="cpm-copy">Asset-model binding</span>
          <TonePill tone={provenance?.ok === true ? 'good' : provenance?.ok === false ? 'warn' : 'muted'}>
            {provenance?.ok === true ? 'RESOLVED'
              : provenance?.ok === false ? 'PATH FALLBACK' : 'UNCHECKED'}
          </TonePill>
        </span>
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
