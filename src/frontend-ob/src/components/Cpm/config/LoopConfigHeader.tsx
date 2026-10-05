/**
 * 2026-09-18 Gate Configuration redesign: the answer first. One fact row under the page title says
 * what the loop runs under today (the factory layer, or the bundle by level / version / hash), its
 * class-pack profile, the workers in one line with a tone, and the catalogue this build carries.
 */
import React from 'react';
import { TonePill, WorkspaceHeader } from '../shared';
import type { EffectiveConfig } from '../../../api/cpm/config';
import { CopyableId } from '../evidence/CopyableId';
import { bundleStateTone, shortHash, workersSummary } from './configSupport';

export interface LoopConfigHeaderProps {
  loopId: string;
  displayName: string | undefined;
  eff: EffectiveConfig | undefined;
  loading: boolean;
  catalogueHash: string | undefined;
  actions?: React.ReactNode;
}

export const LoopConfigHeader: React.FC<LoopConfigHeaderProps> = ({ loopId, displayName, eff, loading, catalogueHash, actions }) => {
  const workers = eff ? workersSummary(eff) : null;
  return (
    <>
      <WorkspaceHeader eyebrow="Set up · Gate configuration" title={displayName ? `${loopId} · ${displayName}` : loopId}
        copy="What this loop runs under today, the bundles at its three levels, and the editor for one of them." actions={actions} />
      {!eff && loading && (
        <div className="cpm-surface cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true" aria-label="Loading the effective configuration">
          <span className="cpm-skeleton__label">Loading what {loopId} runs under…</span>
        </div>
      )}
      {eff && (
        <section className="cpm-surface cpm-fact-row" aria-label="Configuration facts">
          <div className="cpm-fact-row__facts">
            <span className="cpm-fact">
              <span className="cpm-fact__label">runs under</span>
              <span className="cpm-fact__value">
                <TonePill tone={eff.bundle ? bundleStateTone(eff.state) : 'muted'}>{eff.bundle ? `${eff.state} · ${eff.bundle.scopeKind} v${eff.bundle.version}` : 'NO_ACTIVE_BUNDLE · factory layer'}</TonePill>
                {eff.bundle && <CopyableId label="bundle hash" value={eff.bundle.contentHash} />}
              </span>
            </span>
            <span className="cpm-fact"><span className="cpm-fact__label">profile</span><span className="cpm-fact__value cpm-mono">{eff.profileId}</span></span>
            {workers && <span className="cpm-fact"><span className="cpm-fact__label">workers</span><span className="cpm-fact__value"><TonePill tone={workers.tone}>{workers.text}</TonePill></span></span>}
            <span className="cpm-fact"><span className="cpm-fact__label">catalogue</span><span className="cpm-fact__value cpm-mono">{shortHash(catalogueHash, 8)}</span></span>
          </div>
        </section>
      )}
    </>
  );
};
