/**
 * CHG-168 (owner review, the approved sample, badge 7): Is the loop ready to be evaluated? One row each for the valve position
 * (G14) and the peer links (G13), the server's advice behind a ?; any other observability flag in a row of its own; then every
 * other readiness check that is not met, by name with its message. It merged the Valve position and Peer links facts, the
 * Observability pills and the readiness list, which said each gap three times. Loading and error as before.
 */
import React from 'react';
import type { CpmLoop, CpmReadiness } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { CodeLabel } from '../CodeLabel';
import { KvRow, QueryError, TonePill } from '../shared';
import { missingFields, otherChecks, otherFlags, peerFact, vpFact, type Fact } from './loopPanelFacts';

interface ReadinessQuery {
  data?: Pick<CpmReadiness, 'checks'>;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => unknown;
}

const FactValue: React.FC<{ fact: Fact; adviceLabel: string }> = ({ fact, adviceLabel }) => {
  if ('text' in fact) return <>{fact.text}</>;
  const [tone, glyph, word] = fact.pill;
  return (
    <span className="cpm-title-row cpm-reg-fact">
      <TonePill tone={tone} glyph={glyph}>{word}</TonePill>
      {fact.advice && <Toggletip variant="how-to" label={adviceLabel}><p>{fact.advice}</p></Toggletip>}
    </span>
  );
};

export const LoopReadiness: React.FC<{ loop: CpmLoop; readiness: ReadinessQuery }> = ({ loop, readiness }) => {
  const checks = readiness.data;
  const flags = otherFlags(loop);
  return (
    <section className="cpm-events-panel__sect" aria-label="Readiness">
      <h3 className="cpm-panel-title">Readiness</h3>
      <KvRow label="Valve position (G14)"><FactValue fact={vpFact(loop, checks)} adviceLabel="Valve position advice" /></KvRow>
      <KvRow label="Peer links (G13)"><FactValue fact={peerFact(loop, checks)} adviceLabel="Peer links advice" /></KvRow>
      {flags.length > 0 && (
        <KvRow label="Observability">
          {flags.map(f => <TonePill key={f} tone="warn" glyph="!"><CodeLabel code={f} /></TonePill>)}
        </KvRow>
      )}
      {otherChecks(checks).map(c => <KvRow key={c.id} label={c.label}>{c.message ?? 'Missing'}</KvRow>)}
      {readiness.isError && <QueryError title="Readiness unavailable" error={readiness.error} retry={() => void readiness.refetch?.()} />}
      {!readiness.isError && readiness.isLoading && <p className="cpm-copy">Checking readiness…</p>}
      {!readiness.isError && checks && missingFields(checks).length === 0 && (
        <p className="cpm-reg-nothing"><TonePill tone="good" glyph="✓">Nothing missing</TonePill></p>
      )}
    </section>
  );
};

export default LoopReadiness;
