/**
 * Task 25 (spec 8.2): the page header and, for one loop, three tiles: Effective layer, Profile and Worker alignment. A tile leads
 * to what is behind it (the loop's bundles, or the worker acknowledgements). Build identifiers (bundle and catalogue hash, jars)
 * sit in a closed Technical details. A worker on another catalogue stays on screen.
 */
import React from 'react';
import { ObiConfigure } from '@oicl/openbridge-webcomponents-react/icons/icon-configure';
import { ObiUserProfiles } from '@oicl/openbridge-webcomponents-react/icons/icon-user-profiles';
import { ObiSettingsIec } from '@oicl/openbridge-webcomponents-react/icons/icon-settings-iec';
import { WorkspaceHeader } from '../shared';
import type { ConfigCatalogue, EffectiveConfig } from '../../../api/cpm/config';
import { KpiCard } from '../kpi/KpiCard';
import { TechnicalDetails, type TechnicalDetail } from '../../../ui/TechnicalDetails';
import { configHref } from '../cpaHref';
import { bundleStateTone, workerAlignment } from './configSupport';

/** Set up / Gate Configuration; the sentence says what the page is for, behind the ?. */
export const ConfigPageHeader: React.FC<{ copy: string }> = ({ copy }) => (
  <WorkspaceHeader eyebrow="Set up" title="Gate Configuration" copy={copy} />
);

/** The warning stays on screen: results from a worker on another catalogue cannot be compared. */
export const CatalogueNote: React.FC<{ catalogue: ConfigCatalogue | undefined }> = ({ catalogue }) =>
  catalogue?.workers.some(w => !w.catalogueMatches)
    ? <p className="cpm-field__error" role="status">a worker runs ANOTHER catalogue</p>
    : null;

/** Build identifiers of the catalogue (and the loop's bundle), for the closed disclosure. */
export function buildDetails(catalogue: ConfigCatalogue | undefined, eff?: EffectiveConfig): TechnicalDetail[] {
  const jars = [...new Set((eff?.workers ?? []).map(w => w.jarSha256))].join(', ');
  return [
    ...(eff?.bundle ? [{ label: 'Bundle hash', value: eff.bundle.contentHash }] : []),
    { label: 'Catalogue hash', value: catalogue?.catalogueHash },
    ...(catalogue ? [{ label: 'Catalogue properties', value: catalogue.count, mono: false }, { label: 'Workers announced', value: catalogue.workers.length, mono: false }] : []),
    ...(jars ? [{ label: 'Worker jars', value: jars }] : []),
  ];
}

export interface LoopConfigHeaderProps {
  loopId: string;
  eff: EffectiveConfig | undefined;
  loading: boolean;
  catalogue: ConfigCatalogue | undefined;
  onOpenWorkers: () => void;
  /** The loop band, between the title and the tiles. */
  band?: React.ReactNode;
}

export const LoopConfigHeader: React.FC<LoopConfigHeaderProps> = ({ loopId, eff, loading, catalogue, onOpenWorkers, band }) => {
  const workers = eff ? workerAlignment(eff) : null;
  const bundlesTo = configHref({ loop: loopId, view: 'bundles' });
  return (
    <>
      <ConfigPageHeader copy="What this loop runs under today, the bundles at its three levels, and the editor for one of them." />
      {band}
      {!eff && loading && (
        <div className="cpm-surface cpm-skeleton cpm-skeleton--result" role="status" aria-busy="true" aria-label="Loading the effective configuration">
          <span className="cpm-skeleton__label">Loading what {loopId} runs under…</span>
        </div>
      )}
      {eff && workers && (
        <div className="cpm-kpicards" aria-label="Configuration facts">
          <KpiCard Icon={ObiConfigure} label="Effective layer" to={bundlesTo} tone={eff.bundle ? bundleStateTone(eff.state) : 'muted'}
            value={eff.bundle ? `${eff.bundle.scopeKind} v${eff.bundle.version}` : 'Factory layer'} sub={eff.bundle ? eff.state : 'No active bundle'} />
          <KpiCard Icon={ObiUserProfiles} label="Profile" to={bundlesTo} value={eff.profileId} />
          <KpiCard Icon={ObiSettingsIec} label="Worker alignment" tone={workers.tone} value={workers.value} sub={workers.sub} onOpen={onOpenWorkers} />
        </div>
      )}
      <CatalogueNote catalogue={catalogue} />
      <TechnicalDetails items={buildDetails(catalogue, eff)} />
    </>
  );
};
