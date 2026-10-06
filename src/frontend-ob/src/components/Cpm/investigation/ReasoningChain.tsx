/**
 * The Eligibility → Performance → Evidence → Confirmation/fusion chain over the 17 gates,
 * with the machine reason code. Split out of CpmInvestigation in v2.5 (1E.2).
 */
import React from 'react';
import type { CpmGateMatrix } from '../../../api/cpmApi';
import { KvRow, TonePill } from '../shared';
import { gateTone } from '../gateStatus';

/** Reasoning-chain stages over the 17 gates. */
const CHAIN: { label: string; gates: string[]; question: string }[] = [
  { label: 'Eligibility', gates: ['G0', 'G1', 'G2', 'G2r'], question: 'Is the window evaluable at all?' },
  { label: 'Performance', gates: ['G3', 'G4'], question: 'Is control effective, and at what actuator cost?' },
  { label: 'Diagnostic evidence', gates: ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11'], question: 'What failure signature does the data carry?' },
  { label: 'Confirmation & fusion', gates: ['G12', 'G13', 'G14', 'G15'], question: 'Does measured context confirm it, and what verdict fuses out?' },
];

/**
 * Worst tone across a chain stage. It used to classify gate statuses inline — a
 * FOURTH vocabulary, and one that disagreed with the others: STRONG read as warn
 * here while the Performance matrix, the Explorer and Replay all read it as bad.
 * Same gate, same window, a different colour depending on which screen you were
 * on. It now defers to `gateTone`, the single source.
 */
export function stageTone(matrix: CpmGateMatrix | undefined, gates: string[]): 'good' | 'warn' | 'bad' | 'muted' {
  if (!matrix) return 'muted';
  const tones = gates.map(g => gateTone(matrix.gates.find(c => c.key === g)?.status));
  if (tones.includes('bad')) return 'bad';
  if (tones.includes('warn')) return 'warn';
  if (tones.every(t => t === 'muted')) return 'muted';
  return 'good';
}

export const ReasoningChain: React.FC<{ matrix: CpmGateMatrix; machineReason: string | null }> = ({ matrix, machineReason }) => (
  <>
    {/* The heading is the CollapsibleSection that holds this chain (CHG-050). */}
    {CHAIN.map((c, i) => {
      const tone = stageTone(matrix, c.gates);
      return (
        <div key={c.label} className="cpm-window-row">
          <strong>{i + 1}. {c.label} <TonePill tone={tone}>{tone.toUpperCase()}</TonePill></strong>
          <span className="cpm-event-row__sub">{c.question}</span>
          <span className="cpm-event-row__sub">
            {c.gates.map(g => {
              const cell = matrix.gates.find(x => x.key === g);
              const status = (cell?.status ?? '—').replace(/_/g, ' ');
              // G14's reason is the confirmation reason (NO_VP, NO_POSITIVE_EVIDENCE, …).
              return g === 'G14' && cell?.reason ? `${g}:${status} (${cell.reason})` : `${g}:${status}`;
            }).join(' · ')}
          </span>
        </div>
      );
    })}
    <KvRow label="Machine reason code">
      <span className="cpm-mono">{machineReason ?? 'none — verdict fused cleanly'}</span>
    </KvRow>
  </>
);

export default ReasoningChain;
