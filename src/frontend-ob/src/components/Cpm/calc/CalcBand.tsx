/**
 * CHG-166 (owner review, the approved sample and its answer 1): the Calculations controls in the loop band, after the loop. The
 * window kind ("12h fused" / "24h fused", it was the header's 12h / 24h), the window list the Workbench, Replay and Investigation
 * read with ‹ › (‹ newer, › older; past the oldest loaded, › loads older windows). The verdict sits in that dropdown, as on the
 * Workbench and Replay (the owner's answer 1), so the band no longer repeats it in a pill; "Verdict unavailable" still says
 * when it could not be read. The window span and the versions left the band (the foot strip, Run details).
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import type { CpmGateMatrix } from '../../../api/cpm/gates';
import { TonePill } from '../shared';
import { diagnosisLabel } from '../vocabulary';
import { EvidenceWindowSelect, WindowKindSelect, type WindowKindOption } from '../evidence/EvidenceToolbar';
import type { EvidenceWindows } from '../evidence/useEvidenceWindows';
import { sameInstant } from '../evidence/useWindowAt';
import { WINDOW_KINDS } from '../useWindowKind';
import { shortState, windowPick } from '../windowLabel';

const KINDS: WindowKindOption[] = WINDOW_KINDS.map(k => ({ kind: k, tier: 'fused', label: `${k} — fused verdict` }));

export const CalcBand: React.FC<{
  loopId: string;
  kind: string;
  onKind: (kind: string) => void;
  list: EvidenceWindows;
  /** The fused row of the window shown: the newest, or the one ?window= names. */
  matrix: CpmGateMatrix | undefined;
  timeZone: string;
  /** The newest verdict could not be read: say so instead of showing none. */
  verdictFailed: boolean;
  onWindow: (end: string) => void;
}> = ({ loopId, kind, onKind, list, matrix, timeZone, verdictFailed, onWindow }) => {
  // ‹ › step among the windows the dropdown can open
  const openable = list.options.filter(w => w.hasRunIds);
  const index = matrix ? openable.findIndex(w => sameInstant(w.windowEnd, matrix.windowEnd)) : -1;
  const newer = index > 0 ? openable[index - 1] : undefined;
  const older = index >= 0 ? openable[index + 1] : undefined;
  const notListed = 'This window is not in the listed windows';
  return (
    <>
      <WindowKindSelect kind={kind} kinds={KINDS} onKind={onKind} />
      <EvidenceWindowSelect loopId={loopId} kind={kind} windows={list.options} windowsLoading={list.isLoading} windowsError={list.error}
        currentMethodRunId={matrix?.methodRunIds?.G15} currentEnd={matrix?.windowEnd}
        runWindow={matrix ? `${windowPick(matrix, timeZone)} · ${shortState(diagnosisLabel(matrix.diagnosis))}` : null}
        onWindow={w => onWindow(w.windowEnd)} />
      {list.error ? <ObcButton variant="flat" onClick={list.refetch}>Retry</ObcButton> : null}
      {matrix && (
        // the reason a stepper is disabled rides on a wrapping span: ObcButton takes no title
        <span className="cpm-step-pair">
          <span title={index < 0 ? notListed : newer ? 'Newer window' : 'Already the newest window'}>
            <ObcButton variant="flat" disabled={!newer} onClick={() => { if (newer) onWindow(newer.windowEnd); }}>‹</ObcButton>
          </span>
          <span title={index < 0 ? notListed : older ? 'Older window' : list.hasMore ? 'Load older windows' : 'Already the oldest window'}>
            <ObcButton variant="flat" disabled={index < 0 || (!older && !list.hasMore) || list.isLoadingMore}
              onClick={() => { if (older) onWindow(older.windowEnd); else if (list.hasMore) list.loadMore(); }}>›</ObcButton>
          </span>
        </span>
      )}
      {verdictFailed && <TonePill tone="warn">Verdict unavailable</TonePill>}
    </>
  );
};

export default CalcBand;
