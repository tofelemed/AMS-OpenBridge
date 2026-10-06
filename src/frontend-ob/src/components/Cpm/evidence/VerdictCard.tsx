/**
 * v2.5 workbench: the answer first. The verdict card opens the reading column with the gate's
 * status, one plain sentence and the key numbers as tiles; the flags card closes it with the
 * window's observability flags, family disqualifiers and the insufficient-evidence reason.
 */
import React from 'react';
import { KpiTile, PanelHead, TonePill } from '../shared';
import { gateTone } from '../gateStatus';
import type { GateState } from './GateResultState';
import type { Headline } from './views/headlines';
import { codeLabel } from '../vocabulary';
import { CodeLabel } from '../CodeLabel';

export interface VerdictCardProps {
  gate: string;
  name: string;
  status: string | null;
  reason: string | null;
  state: GateState;
  sentence: string;
  headline: Headline[];
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ gate, name, status, state, sentence, headline }) => {
  const tone = status ? gateTone(status, gate) : 'muted';
  return (
    <section className={`cpm-surface cpm-verdict cpm-tone-${tone}`} role="region" aria-label="Verdict">
      <PanelHead eyebrow="Verdict" title={`${gate} · ${name}`} right={status ? <TonePill tone={tone}>{codeLabel(status)}</TonePill> : undefined} />
      <p className="cpm-verdict__sentence">{sentence}</p>
      {state.kind === 'READY' && headline.length > 0 && (
        <div className="cpm-verdict__tiles">
          {headline.map(h => (
            <KpiTile key={h.label} caption={h.label} tone={h.tone}
              value={<span title={h.raw && h.raw !== h.value ? h.raw : undefined}>{h.unit ? `${h.value} ${h.unit}` : h.value}</span>} />
          ))}
        </div>
      )}
      {state.kind !== 'READY' && state.kind !== 'LOADING' && <p className="cpm-copy cpm-verdict__state">{state.title}</p>}
    </section>
  );
};

export interface WindowFlagsRow {
  observabilityFlags?: string[] | null;
  familyDisqualifiers?: string[] | null;
  insufficientEvidenceReason?: string | null;
}

export const WindowFlags: React.FC<{ row: WindowFlagsRow | undefined }> = ({ row }) => {
  const flags = row?.observabilityFlags ?? [];
  const disq = row?.familyDisqualifiers ?? [];
  const insufficient = row?.insufficientEvidenceReason ?? null;
  const empty = flags.length === 0 && disq.length === 0 && !insufficient;
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="Observability" title="Flags on this window" />
      {!row ? (
        <p className="cpm-copy">This run's window is not among the loaded windows, so its flags are not shown here.</p>
      ) : empty ? (
        <p className="cpm-copy">No flags on this window.</p>
      ) : (
        <div className="cpm-flag-row">
          {flags.map(f => <TonePill key={f} tone={f.startsWith('HAS_') ? 'good' : 'warn'}><CodeLabel code={f} /></TonePill>)}
          {disq.map(d => <TonePill key={d} tone="muted"><CodeLabel code={d} /></TonePill>)}
          {insufficient && <TonePill tone="warn"><CodeLabel code={insufficient} /></TonePill>}
        </div>
      )}
    </section>
  );
};
