/**
 * CHG-141: the engine's own detail, closed: the window's full span, the family, G14, the reason, the disqualifiers and the
 * raw trace. CHG-051: the reason in words; an engine trace string ("selected_family=…") stays in the trace below it.
 * A window that was not judged shows its reason in the limits box, on screen, so it is not said again here.
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { CodeLabel } from '../CodeLabel';
import { conditionOf } from '../explorer/summary/summaryText';
import { EngineTrace } from '../evidence/views/engineTrace';
import { KvRow, TonePill } from '../shared';
import { codeLabel } from '../vocabulary';
import { windowSpan } from '../windowLabel';
import { confirmationLabel } from './confirmationCopy';

export const TechnicalDetails: React.FC<{ matrix: CpmGateMatrix; machineReason: string | null; windowKind: string; timeZone?: string }> = ({ matrix, machineReason, windowKind, timeZone }) => {
  const verdict = matrix.verdictV2;
  const { kind } = conditionOf(matrix.diagnosis);
  const judged = kind === 'finding' || kind === 'healthy';
  const inWords = machineReason && !machineReason.includes('=') && !matrix.familyDisqualifiers.includes(machineReason);
  return (
    <section className="cpm-surface">
      <details className="cpm-chart__more">
        <summary>Technical details &amp; engine trace</summary>
        <KvRow label="Window">{windowSpan({ ...matrix, windowKind }, timeZone)}</KvRow>
        <KvRow label="Selected family">{codeLabel(matrix.narrative?.selectedFamily)}</KvRow>
        <KvRow label="G14 confirmation">
          <TonePill tone={verdict?.confirmation?.state === 'CONFIRMED' ? 'bad' : verdict?.confirmation?.state === 'CONTRADICTED' ? 'good' : 'muted'}>
            {confirmationLabel(verdict?.confirmation, verdict?.legacy ?? true)}
          </TonePill>
        </KvRow>
        {judged && inWords && <KvRow label="Reason"><CodeLabel code={machineReason} /></KvRow>}
        {matrix.familyDisqualifiers.length > 0 && (
          <KvRow label="Disqualifiers">
            {matrix.familyDisqualifiers.map(d => <TonePill key={d} tone="warn"><CodeLabel code={d} /></TonePill>)}
          </KvRow>
        )}
        <EngineTrace open entries={[['diagnosis', matrix.diagnosis], ['leading_hypothesis', verdict?.leadingHypothesis],
          ['confirmation', verdict?.confirmation ? `${verdict.confirmation.state}${verdict.confirmation.reason ? ` / ${verdict.confirmation.reason}` : ''}` : null],
          ['machine_reason', machineReason], ['family_disqualifiers', matrix.familyDisqualifiers.join(', ')],
          ['status_reason', matrix.narrative?.statusReason], ['selected_family', matrix.narrative?.selectedFamily]]} />
      </details>
    </section>
  );
};

export default TechnicalDetails;
