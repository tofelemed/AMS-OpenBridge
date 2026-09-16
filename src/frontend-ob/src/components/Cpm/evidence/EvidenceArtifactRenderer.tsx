/**
 * v2.5 Task 2E.3: routes the selected gate's artifacts to its view (2E.4 adds the 17 gate views;
 * until a gate has one, the generic renderer draws every retained artifact of the run as the
 * series it IS - x / y with their units and the accepted mask as gaps - plus a record card for
 * artifacts without samples). Nothing here is derived from a summary.
 */
import React from 'react';
import type { EvidenceArtifactMeta, EvidenceManifest } from '../../../api/cpm/evidence';
import { CpmChart, type CpmSeries } from './CpmChart';
import { labelsOf, type DecodedArtifact } from './artifactCodec';
import { useArtifact } from './useEvidence';
import { KvRow, PanelHead, TonePill } from '../shared';
import { GATE_VIEWS } from './views';

export interface GateViewProps {
  gate: string;
  manifest: EvidenceManifest;
  timeZone: string;
  timeFmt: (ms: number) => string;
  onNavigateGate?: (gate: string) => void;
}

/** A decoded artifact as one series per numeric column (x = the artifact's x). */
export function genericSeries(d: DecodedArtifact): CpmSeries[] {
  const out: CpmSeries[] = [];
  const isTime = d.meta.x.unit === 'ms_epoch';
  const yLabel = d.meta.y.quantity ?? 'y';
  const y: Array<number | null> = Array.from(d.columns.y, (v, i) => (d.mask ? d.mask[i] : true) ? v : null);
  out.push({ id: 'y', label: yLabel, unit: d.units.y ?? d.meta.y.unit ?? '', x: d.columns.x, y, pen: 'good', markers: !isTime && d.n < 64 });
  for (const [name, col] of Object.entries(d.columns)) {
    if (name === 'x' || name === 'y' || name === 'mask') continue;
    if (d.legends[name]) continue;                                     // coded columns are labels, not curves
    out.push({ id: name, label: name, unit: d.units[name] ?? '', x: d.columns.x, y: Array.from(col), pen: 'accent', dashed: true });
  }
  return out;
}

const ArtifactCard: React.FC<{ meta: EvidenceArtifactMeta; timeZone: string }> = ({ meta, timeZone }) => {
  const art = useArtifact(meta);
  const record = (meta.calculationSamples ?? 0) === 0;
  const provenance = Object.entries(meta.provenance ?? {}).filter(([k]) => !['column_units', 'legends'].includes(k));
  return (
    <section className="cpm-surface cpm-artifact" data-kind={meta.kind}>
      <PanelHead eyebrow={meta.gate} title={`${meta.kind}${meta.roleOrPath ? ` · ${meta.roleOrPath}` : ''}`}
        right={<TonePill tone={meta.readiness === 'COMPLETE' ? 'good' : meta.readiness === 'FAILED' ? 'bad' : 'muted'}>{meta.readiness}</TonePill>} />
      {record ? (
        <dl className="cpm-artifact__record">
          {provenance.map(([k, v]) => <React.Fragment key={k}><dt className="cpm-mono">{k}</dt><dd>{String(v)}</dd></React.Fragment>)}
        </dl>
      ) : meta.readiness !== 'COMPLETE' ? (
        <p className="cpm-copy">Artifact {meta.readiness}{meta.readinessReason ? ` — ${meta.readinessReason}` : ''}; nothing is drawn from a partial or expired array.</p>
      ) : art.isError ? (
        <p className="cpm-field__error" role="alert">Artifact not trusted: {(art.error as Error).message}</p>
      ) : art.data ? (
        <>
          <CpmChart title={`${meta.kind}${meta.roleOrPath ? ` · ${meta.roleOrPath}` : ''}`} series={genericSeries(art.data)}
            xKind={meta.x.unit === 'ms_epoch' ? 'time' : 'value'} xLabel={meta.x.quantity ?? 'x'} xUnit={meta.x.unit ?? undefined} timeZone={timeZone} height={260} />
          {Object.keys(art.data.legends).map(col => (
            <KvRow key={col} label={col}>{summarise(labelsOf(art.data!, col))}</KvRow>
          ))}
        </>
      ) : (
        <p className="cpm-copy">Loading {meta.chunkCount} chunk(s), {meta.totalBytes.toLocaleString()} bytes…</p>
      )}
    </section>
  );
};

function summarise(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return Array.from(counts.entries()).map(([k, v]) => `${k}: ${v}`).join(' · ');
}

export const EvidenceArtifactRenderer: React.FC<GateViewProps> = (props) => {
  const View = GATE_VIEWS[props.gate];
  if (View) return <View {...props} />;
  const own = props.manifest.artifacts.filter(a => a.gate === props.gate);
  return (
    <div className="cpm-artifacts">
      {own.map(a => <ArtifactCard key={a.artifactId} meta={a} timeZone={props.timeZone} />)}
    </div>
  );
};
