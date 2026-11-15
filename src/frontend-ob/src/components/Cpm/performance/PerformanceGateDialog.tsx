/**
 * A gate of one Performance row, opened in the shared gate dialog (CHG-135; it replaced the column docked beside
 * the matrix). The status comes from the same row as the cell that was clicked, through `gateMark`, so the two always
 * agree. The loop's result sits beside it: a gate can differ from the result, and an older verdict is named as last,
 * never as current. Previous and next walk the gates in order.
 * CHG-156: short Prev / Next / Review labels (the loop is in the title); the result is said once.
 * CHG-191 (owner review item 3): wide, two columns, each fact once: the window is one line, there is no Gate role row and
 * no caps label; the foot is Prev / Next, then the "↗" links, then Review, the one primary.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Button } from '../../../ui/Button';
import GateDialog, { GateActions, GateSteps, gateWindowLine } from '../blocks/GateDialog';
import { EvidenceAbout, EvidenceLinks, EvidenceState, useGateEvidence } from '../GateEvidencePanel';
import { TonePill, toneFor } from '../shared';
import { investigationHref, windowsHref } from '../cpaHref';
import { isSameVerdict, staleVerdictLine } from '../verdictAge';
import { diagnosisLabel } from '../vocabulary';
import { evidenceScore } from '../evidenceScore';
import { hasVerdict } from '../metricAvailability';
import type { CpmHeatmapLoop } from '../../../api/cpmApi';

export const PerformanceGateDialog: React.FC<{
  row: CpmHeatmapLoop;
  gate: string;
  windowKind: string;
  /** Ordered gate keys, so previous and next walk the pathway in tier order. */
  gateKeys: string[];
  flags?: readonly string[] | null;
  onSelectGate: (gate: string) => void;
  onClose: () => void;
}> = ({ row, gate, windowKind, gateKeys, flags, onSelectGate, onClose }) => {
  const navigate = useNavigate();
  const ev = useGateEvidence(row.loopId, gate, windowKind);
  const idx = gateKeys.indexOf(gate);
  const prev = idx > 0 ? gateKeys[idx - 1] : null;
  const next = idx >= 0 && idx < gateKeys.length - 1 ? gateKeys[idx + 1] : null;
  // CHG-156: the same verdict is said once; its time is the window line's
  const older = isSameVerdict(row, row.lastVerdict) ? null : staleVerdictLine(row.lastVerdict);
  const score = hasVerdict(row.diagnosis) ? evidenceScore(row.confidence) : null;
  const reason = ev.cell?.reason;
  const rows = [
    ...(reason ? [{ label: 'Reason', value: reason }] : []),
    { label: 'Samples', value: ev.matrix?.sampleCount ?? '—' },
  ];

  return (
    <GateDialog
      open onClose={onClose} loop={row.loopId} gate={gate} status={row.gates[gate]} flags={flags}
      loopResult={(
        <>
          <TonePill tone={toneFor(row.diagnosis)}>{diagnosisLabel(row.diagnosis)}</TonePill>
          {score != null && <span className="cpm-event-row__sub"> evidence score {score}</span>}
          {older && <span className="cpm-event-row__sub"> {older}</span>}
        </>
      )}
      windowLine={gateWindowLine(windowKind, ev.matrix?.windowStart, ev.matrix?.windowEnd ?? row.windowEnd)}
      rows={rows}
      aside={<EvidenceAbout ev={ev} gateKey={gate} />}
      actions={(
        <GateActions
          steps={<GateSteps prev={prev} next={next} onSelect={onSelectGate} />}
          links={(
            <>
              <EvidenceLinks ev={ev} loopId={row.loopId} gateKey={gate} windowKind={windowKind} />
              <ObcButton className="ui-link" variant="flat" onClick={() => navigate(windowsHref(row.loopId, { profile: windowKind }))}>
                Window Inspector ↗
              </ObcButton>
            </>
          )}
          primary={(
            <Button variant="primary" onClick={() => navigate(investigationHref(row.loopId, { kind: windowKind, gate }))}>
              Review →
            </Button>
          )}
        />
      )}
    >
      <EvidenceState ev={ev} windowKind={windowKind} />
    </GateDialog>
  );
};

export default PerformanceGateDialog;
