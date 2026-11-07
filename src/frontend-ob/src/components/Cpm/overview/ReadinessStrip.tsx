/**
 * Configuration limits as one compact line on Loop Registry (CHG-147; was an Overview section, SME #5).
 * Missing positioner feedback and unconfigured peers limit what the engine can CONFIRM; they are not loop
 * problems, so they stay neutral. Each count opens the list of loops behind it; what each means sits behind the ?.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { Toggletip } from '../../../ui/Toggletip';
import { QueryError } from '../shared';
import { peersCopy, plantFactsCopy, positionerCopy } from './capabilityCopy';

export const ReadinessStrip: React.FC<{
  summary: CpmFleetSummary | undefined;
  isError?: boolean;
  error?: unknown;
  retry?: () => void;
  gapHref: (gap: 'vp' | 'peers') => string;
}> = ({ summary, isError, error, retry, gapHref }) => {
  if (!summary) return isError ? <QueryError title="Configuration limits unavailable" error={error} retry={retry} /> : null;
  const noVp = summary.capability.loopsCappedByMissingVp;
  const noPeers = summary.capability.loopsWithoutDisturbanceContext;
  const facts = plantFactsCopy(summary.capability);
  return (
    <section className="cpm-surface cpm-readiness cpm-readiness--line" aria-label="Configuration limits">
      <Link to={gapHref('vp')} className="cpm-reg-link"><strong>{noVp}</strong> valve positions expected but not mapped</Link>
      <Link to={gapHref('peers')} className="cpm-reg-link"><strong>{noPeers}</strong> peer links expected but missing</Link>
      <Toggletip variant="how-to" label="What the limits mean">
        <p>{positionerCopy(noVp).sub}.</p>
        <p>{peersCopy(noPeers).sub}.</p>
        {facts && <p>{facts}</p>}
      </Toggletip>
    </section>
  );
};

export default ReadinessStrip;
