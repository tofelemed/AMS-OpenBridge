/**
 * CHG-128: the band under the tabs of every page about one loop. It stays at the top of the content while the page scrolls. It
 * holds the one loop control, then only what this tab needs: the result on Summary, range and Export on Historical, window and
 * gate on Evidence. The control follows the header scope. CHG-160: the control is a search field with one drop-down list.
 */
import React from 'react';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmLoops } from '../../../hooks/useCpm';
import { useCpmScope } from '../plantScope';
import { useStickyOffset } from './LoopContextBar';
import { LoopCombobox } from './LoopCombobox';
import { TonePill } from '../shared';

export const LoopBand: React.FC<{
  loopId: string | null | undefined;
  onLoop: (loopId: string) => void;
  /** A narrower list than the plant scope, for example the loops of a chosen case. */
  only?: CpmLoop[];
  /** This tab's own controls, after the loop control. */
  children?: React.ReactNode;
  /** Pushed to the far end of the band. */
  end?: React.ReactNode;
  /** CHG-158: drawn as a card on the page background (Loop Explorer, as the owner's design shows). */
  card?: boolean;
}> = ({ loopId, onLoop, only, children, end, card }) => {
  const ref = useStickyOffset();
  const loops = useCpmLoops();
  const scope = useCpmScope();
  const all = loops.data?.loops ?? [];
  const inScope = only ?? all.filter(l => scope.matches(l));
  const loop = loopId ? all.find(l => l.loopId.toLowerCase() === loopId.toLowerCase()) : undefined;
  const outside = !!loop && scope.active && !scope.matches(loop);

  return (
    <div ref={ref} className={`cpm-loop-context cpm-band${card ? ' cpm-band--card' : ''}`} role="region" aria-label="Loop and its controls" data-testid="loop-context">
      <div className="cpm-band__row">
        <LoopCombobox loops={inScope} loopId={loopId} loop={loop} onSelect={onLoop}
          isLoading={loops.isLoading} isError={loops.isError} retry={() => void loops.refetch()} />
        {loop && loop.isActive === false && <TonePill tone="muted">Retired</TonePill>}
        {children}
        {end && <div className="cpm-band__end">{end}</div>}
      </div>
      {outside && (
        <p className="cpm-band__note" role="status">{loop.loopId} is outside the plant scope in the header. It stays selected until you pick another.</p>
      )}
      {loopId && !loop && !loops.isLoading && !loops.isError && <p className="cpm-band__note" role="status">{loopId} is not in the loop registry.</p>}
    </div>
  );
};

export default LoopBand;
