'use client';

/**
 * Explorer › Summary › operating state: the PV, SP, OP and Mode row (SignalStrip) above the rolling trend and its
 * period bar (LoopTrendPanel). The trend range comes from the URL (SME #11, CHG-048); the row reads the same
 * query, so the two share one fetch.
 */
import React, { useMemo } from 'react';
import type { CpmLoop } from '../../../../api/cpmApi';
import { useCpmTrend } from '../../../../hooks/useCpm';
import { loopSeries } from '../../../../utils/loopSeries';
import { useTrendRange } from '../../trend/useTrendRange';
import LoopTrendPanel from './LoopTrendPanel';
import SignalStrip from './SignalStrip';

export const OperatingState: React.FC<{ loop: CpmLoop }> = ({ loop }) => {
  const range = useTrendRange();
  // pollDriven only while live: then the window advances on a timer, not because the operator asked.
  const trend = useCpmTrend(loopSeries(loop.loopId), range.from, range.to, 240, 'pv,sp,op,mode', true, range.live);
  const points = useMemo(() => trend.data?.points ?? [], [trend.data]);
  return (
    <div>
      <SignalStrip loop={loop} />
      <LoopTrendPanel loop={loop} range={range} trend={trend} points={points} />
    </div>
  );
};

export default OperatingState;
