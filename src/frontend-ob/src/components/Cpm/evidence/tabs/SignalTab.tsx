/**
 * Task 16: the Workbench's Signal context tab. PV / SP, OP / VP and mode over the run's window, from the historian and the
 * sibling runs' artifacts. It is context, not the run's own proof, and the one line says so.
 */
import React from 'react';
import type { MethodRun } from '../../../../api/cpm/evidence';
import { SignalContextLanes } from '../SignalContextLanes';

export const SignalTab: React.FC<{ run: MethodRun | undefined; timeZone: string; timeFmt: (ms: number) => string }> = ({ run, timeZone, timeFmt }) => (
  <div className="cpm-workbench__tab">
    <p className="cpm-copy">Signal context, not retained gate proof.</p>
    {run ? (
      <SignalContextLanes loopId={run.loopId} methodRunIds={run.methodRunIds} fromMs={run.support.fromMs} toMs={run.support.toMs} timeZone={timeZone} timeFmt={timeFmt} />
    ) : <div className="cpm-surface cpm-skeleton cpm-skeleton--lanes" aria-hidden />}
  </div>
);

export default SignalTab;
