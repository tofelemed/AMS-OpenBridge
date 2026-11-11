/**
 * The editor after saving: the loop's readiness (U10, the prototype's draft step). CHG-168 (owner review): one heading,
 * "Readiness" with the state as a pill (✓ Ready / ! Ready · degraded / ✕ Blocked / Checking…); one row per check, ✓ OK, a
 * plant fact (Not applicable / Not installed) muted, or ! Missing with the server's message behind its ? (long messages sat
 * inside pills). The eyebrow "Activation result" and the repeated tag went.
 */
import React from 'react';
import type { CpmReadiness } from '../../../../api/cpmApi';
import { Toggletip } from '../../../../ui/Toggletip';
import { factStateLabel } from '../../optionalInputs';
import { KvRow, TonePill } from '../../shared';
import { Part } from './editorParts';

function statePill(r: CpmReadiness | undefined): React.ReactNode {
  if (!r) return <TonePill tone="muted">Checking…</TonePill>;
  if (!r.ready) return <TonePill tone="bad" glyph="✕">Blocked</TonePill>;
  return r.degraded ? <TonePill tone="warn" glyph="!">Ready · degraded</TonePill> : <TonePill tone="good" glyph="✓">Ready</TonePill>;
}

export const SavedReadiness: React.FC<{ readiness: CpmReadiness | undefined }> = ({ readiness }) => (
  <Part title="Readiness" end={statePill(readiness)}>
    {(readiness?.checks ?? []).map(c => (
      <KvRow key={c.id} label={c.label}>
        {c.ok && factStateLabel(c.state)
          ? <TonePill tone="muted" glyph="—">{factStateLabel(c.state)}</TonePill>
          : c.ok
            ? <TonePill tone="good" glyph="✓">OK</TonePill>
            : (
              <span className="cpm-title-row cpm-reg-fact">
                <TonePill tone="warn" glyph="!">Missing</TonePill>
                {c.message && <Toggletip variant="how-to" label={c.label}><p>{c.message}</p></Toggletip>}
              </span>
            )}
      </KvRow>
    ))}
  </Part>
);

export default SavedReadiness;
