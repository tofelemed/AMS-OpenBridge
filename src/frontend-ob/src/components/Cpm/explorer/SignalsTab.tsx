'use client';

/**
 * Explorer › Signals. Role → UNS path, with binding provenance.
 *
 * Two things left this file. The binding-provenance banner and the "no VP
 * mapping" note both duplicated text the workspace banner already carries; they
 * are now causes in that one consolidated banner, which deep-links back here.
 *
 * The pill also stopped lying about its scope: `binding_provenance` is a
 * LOOP-level check, so painting every role with it told you PV was unresolved
 * when only MODE was. It is now stated once, for the loop.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmReadiness } from '../../../hooks/useCpm';
import { EmptyState, PanelHead, QueryError, TonePill, loopTrendHref } from '../shared';

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

  const roles = useMemo(() => {
    const rank = (r: string) => {
      const i = SIGNAL_ORDER.indexOf(r);
      return i === -1 ? SIGNAL_ORDER.length : i; // unknown roles last, then A-Z
    };
    return Object.entries(loop.tags).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
  }, [loop.tags]);

  const href = loopTrendHref(loop.tags);

  return (
    <div>
      <PanelHead
        eyebrow="Signal mappings"
        title={`${roles.length} role(s) mapped`}
        right={
          <span className="cpm-signal-provenance">
            <span className="cpm-copy">Asset-model binding</span>
            <TonePill tone={provenance?.ok === true ? 'good' : provenance?.ok === false ? 'warn' : 'muted'}>
              {provenance?.ok === true ? 'RESOLVED'
                : provenance?.ok === false ? 'PATH FALLBACK' : 'UNCHECKED'}
            </TonePill>
          </span>
        }
      />

      {/* Readiness is what tells this tab whether a binding actually resolves.
          If the check itself failed, say so — silence here reads as "all clear". */}
      {readiness.isError && (
        <QueryError title="Binding provenance check unavailable"
          error={readiness.error} retry={() => void readiness.refetch()} />
      )}

      {roles.length === 0 && <EmptyState title="No signal mappings" />}

      {roles.length > 0 && href && (
        <div className="cpm-filter-row" style={{ marginBottom: 8 }}>
          {/* The workflow endpoint of the signal-asset projection: these paths
              resolve through the UNS to the loop's real data, so the standard
              Trend page can draw them — history and live tail. */}
          <ObcButton variant="raised" onClick={() => navigate(href)}>
            Open signals in Trend ›
          </ObcButton>
        </div>
      )}

      {roles.length > 0 && (
        <table className="cpm-signal-table">
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Meaning</th>
              <th scope="col">UNS path</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(([role, path]) => (
              <tr key={role}>
                <th scope="row">{role}</th>
                <td className="cpm-event-row__sub">{SIGNAL_MEANINGS[role] ?? role}</td>
                <td className="cpm-mono">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SignalsTab;
