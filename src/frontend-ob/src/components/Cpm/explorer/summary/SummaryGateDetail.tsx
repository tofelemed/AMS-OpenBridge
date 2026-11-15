'use client';

/**
 * Explorer › Summary (and Calculations) › one gate of the latest fused window, in the shared gate dialog. The status comes
 * from the served cell through `gateMark`, beside the loop's result, because a gate can differ from the result. Previous and
 * next walk the gates in tier order. Evidence Workbench → (the primary) opens this gate's immutable run; Window Inspector ↗
 * opens this window. Loaded lazily, and only when a tile is selected.
 * CHG-191 (owner review item 3): the same wide, two-column dialog as Performance; the catalogue's definition sits under
 * "What this gate asks" in the second column, so that heading is said once.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmLoop } from '../../../../api/cpmApi';
import type { CpmGateMatrix } from '../../../../api/cpm/gates';
import { useGateCatalogue } from '../../../../hooks/useCpm';
import GateDialog, { GateActions, GateSteps, gateWindowLine } from '../../blocks/GateDialog';
import { EvidenceAbout, EvidenceLinks, EvidenceState, useGateEvidence } from '../../GateEvidencePanel';
import { ReasonedButton } from '../../ReasonedButton';
import { TonePill } from '../../shared';
import { windowsHref } from '../../cpaHref';
import { evidenceScoreText } from '../../evidenceScore';
import { workbenchHref } from '../../evidence/selection';
import { hasVerdict } from '../../metricAvailability';
import { codeLabel } from '../../vocabulary';
import { conditionOf } from './summaryText';

export interface SummaryGateDetailProps {
  loop: CpmLoop;
  gate: string;
  matrix: CpmGateMatrix;
  windowKind: string;
  /** Ordered gate keys, so previous and next walk the pathway in tier order. */
  gateKeys: string[];
  flags?: readonly string[] | null;
  onSelectGate: (gate: string) => void;
  onClose: () => void;
}

export const SummaryGateDetail: React.FC<SummaryGateDetailProps> = ({
  loop, gate, matrix, windowKind, gateKeys, flags, onSelectGate, onClose,
}) => {
  const navigate = useNavigate();
  const ev = useGateEvidence(loop.loopId, gate, windowKind);
  const cell = matrix.gates.find(g => g.key === gate);
  const runId = cell?.methodRunId ?? matrix.methodRunIds?.[gate] ?? null;
  const catalogue = useGateCatalogue();
  const entry = catalogue.data?.gates.find(g => g.gate === gate);
  const condition = conditionOf(matrix.diagnosis);
  const score = hasVerdict(matrix.diagnosis) ? evidenceScoreText(matrix.confidence) : '';
  const idx = gateKeys.indexOf(gate);
  const prev = idx > 0 ? gateKeys[idx - 1] : null;
  const next = idx >= 0 && idx < gateKeys.length - 1 ? gateKeys[idx + 1] : null;
  const rows = [
    ...(cell?.reason ? [{ label: 'Reason', value: codeLabel(cell.reason) }] : []),
    { label: 'Samples', value: matrix.sampleCount ?? '—' },
  ];

  return (
    <GateDialog
      open onClose={onClose} loop={loop.loopId} gate={gate} status={cell?.status} flags={flags}
      loopResult={(
        <>
          <TonePill tone={condition.tone}>{condition.label}</TonePill>
          {score && <span className="cpm-event-row__sub"> {score}</span>}
        </>
      )}
      windowLine={gateWindowLine(windowKind, matrix.windowStart, matrix.windowEnd)}
      rows={rows}
      aside={<EvidenceAbout ev={ev} gateKey={gate} definition={entry?.definition} />}
      actions={(
        <GateActions
          steps={<GateSteps prev={prev} next={next} onSelect={onSelectGate} />}
          links={(
            <>
              <EvidenceLinks ev={ev} loopId={loop.loopId} gateKey={gate} windowKind={windowKind} withWorkbench={false} />
              <ObcButton className="ui-link" variant="flat" onClick={() => navigate(windowsHref(loop.loopId, { profile: windowKind, window: matrix.windowEnd }))}>
                Window Inspector ↗
              </ObcButton>
            </>
          )}
          primary={(
            // CHG-098: the reason it is disabled is on screen.
            <ReasonedButton variant="raised" disabled={!runId}
              reason="Stored before analysis runs were kept, so there is no run to open"
              onClick={() => { if (runId) navigate(workbenchHref(loop.loopId, runId, gate)); }}>
              Evidence Workbench →
            </ReasonedButton>
          )}
        />
      )}
    >
      <EvidenceState ev={ev} windowKind={windowKind} />
    </GateDialog>
  );
};

export default SummaryGateDetail;
