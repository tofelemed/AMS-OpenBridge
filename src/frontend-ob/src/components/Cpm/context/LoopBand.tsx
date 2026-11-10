/**
 * CHG-128: the band under the tabs of every page about one loop. It stays at the top of the content while the page scrolls. It
 * holds the one loop control, then only what this tab needs: the result on Summary, range and Export on Historical, window and
 * gate on Evidence. The control opens the Find loop box and the loop list that used to be the left list, and follows the header scope.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import type { CpmLoop } from '../../../api/cpmApi';
import { useCpmLoops } from '../../../hooks/useCpm';
import { Popover } from '../../../ui/Popover';
import LoopTree from '../explorer/LoopTree';
import { serviceName } from '../loopName';
import { useCpmScope } from '../plantScope';
import { useStickyOffset } from './LoopContextBar';
import { registryHref } from '../cpaHref';
import { TonePill } from '../shared';

export const LoopBand: React.FC<{
  loopId: string | null | undefined;
  onLoop: (loopId: string) => void;
  /** Offers Clear loop in the control. */
  onClear?: () => void;
  /** A narrower list than the plant scope, for example the loops of a chosen case. */
  only?: CpmLoop[];
  /** This tab's own controls, after the loop control. */
  children?: React.ReactNode;
  /** Pushed to the far end of the band. */
  end?: React.ReactNode;
  /** CHG-158: drawn as a card on the page background (Loop Explorer, as the owner's design shows). */
  card?: boolean;
}> = ({ loopId, onLoop, onClear, only, children, end, card }) => {
  const ref = useStickyOffset();
  const navigate = useNavigate();
  const loops = useCpmLoops();
  const scope = useCpmScope();
  const all = loops.data?.loops ?? [];
  const inScope = only ?? all.filter(l => scope.matches(l));
  const loop = loopId ? all.find(l => l.loopId.toLowerCase() === loopId.toLowerCase()) : undefined;
  const name = loop ? serviceName(loop) : '';
  const outside = !!loop && scope.active && !scope.matches(loop);

  return (
    <div ref={ref} className={`cpm-loop-context cpm-band${card ? ' cpm-band--card' : ''}`} role="region" aria-label="Loop and its controls" data-testid="loop-context">
      <div className="cpm-band__row">
        <Popover
          label="Choose a loop"
          trigger={t => (
            <button type="button" className="cpm-band__loop" aria-label={loopId ? `Loop: ${loop?.loopId ?? loopId} ${name}. Change loop` : 'Choose a loop'} {...t}>
              <span className="cpm-band__loop-text">
                {loopId ? <><strong>{loop?.loopId ?? loopId}</strong>{' '}<span>{name}</span></> : 'Choose a loop'}
              </span>
              <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>
            </button>
          )}
        >
          {close => (
            <div className="cpm-band__panel">
              <LoopTree
                loops={inScope}
                selectedLoopId={loop?.loopId}
                onSelect={id => { close(); onLoop(id); }}
                isLoading={loops.isLoading}
                isError={loops.isError}
                error={loops.error}
                retry={() => void loops.refetch()}
                onOpenRegistry={() => navigate(registryHref())}
                totalLoops={all.length}
              />
              {loopId && onClear && (
                <button type="button" className="ui-link" onClick={() => { close(); onClear(); }}>Clear loop</button>
              )}
            </div>
          )}
        </Popover>
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
