/**
 * One loop KPI in a dialog: its value, the gate that judges it and the
 * meaning the card leaves out. The way on is Inspect Gn → (the gate's own dialog) and, related, where the number is
 * proven, so the drill-down every KPI owes stays one click away. Rendered on the page body, so the tab panel cannot clip it.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import ReasonedButton from '../../ReasonedButton';
import { Dialog } from '../../../../ui/Dialog';
import { gateName } from '../../gateStatus';
import { KvRow } from '../../shared';
import type { LoopKpiCardModel } from '../../kpi/loopKpiView';

export const LoopKpiDialog: React.FC<{
  card: LoopKpiCardModel;
  proof: { label: string; href: string };
  /** The gates the served row carries; absent while it loads. A gate it lacks cannot be opened. */
  gateKeys?: string[];
  onInspect: (gate: string) => void;
  onClose: () => void;
}> = ({ card, proof, gateKeys, onInspect, onClose }) => {
  const navigate = useNavigate();
  const measured = card.value !== '—';
  const missing = !!gateKeys && !gateKeys.includes(card.gate);
  return createPortal(
    <Dialog open onClose={onClose} title={card.label}
      footer={(
        <>
          <ObcButton variant="flat" onClick={() => { onClose(); navigate(proof.href); }}>{proof.label}</ObcButton>
          <ReasonedButton variant="raised" disabled={missing} reason={`No ${card.gate} result in this window`}
            onClick={() => onInspect(card.gate)}>Inspect {card.gate} →</ReasonedButton>
        </>
      )}>
      <KvRow label="Value">{measured ? card.value : 'Not measured in this window'}</KvRow>
      <KvRow label={card.judged ? 'Judged by' : 'Related gate'}>{card.gate} {gateName(card.gate)}</KvRow>
      <KvRow label="Meaning">{card.title}{card.relevant ? " Bears on this loop's current finding." : ''}</KvRow>
    </Dialog>,
    document.body,
  );
};

export default LoopKpiDialog;
