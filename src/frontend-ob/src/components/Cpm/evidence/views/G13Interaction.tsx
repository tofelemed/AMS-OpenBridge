/**
 * v2.5 Task 2F.1 (spec §3.1 G13 row; NR-028): the aligned peer analysis. Peer panes share the
 * loop's time axis (each signal keeps its unit), the pairwise cross-correlation is drawn over lag
 * in seconds with its sign convention stated, the coherence over frequency with the band marked,
 * the candidate relationship graph is an echarts force layout of the record (a graph relation is
 * not proof), and the propagation table orders associated peers by who leads. Unobserved peers,
 * insufficient support, no peers and a legacy row are stated states, never a picture.
 */
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { KvRow, PanelHead, TonePill, cpmChartColors } from '../../shared';
import type { DecodedArtifact } from '../artifactCodec';
import { useGateArtifacts, type GateArtifacts } from '../useGateArtifacts';
import type { GateViewProps } from '../EvidenceArtifactRenderer';
import { GateResultStatePanel } from '../GateResultState';
import { CpmChart, type CpmSeries } from '../CpmChart';
import { RequireKinds, col, first } from './viewSupport';
import { phrase } from '../../vocabulary';

const P = (d: DecodedArtifact | undefined, k: string) => d?.meta.provenance?.[k];
const list = (s: string | undefined) => (s ?? '').split(';').map(x => x.trim()).filter(Boolean);

export interface PeerRow { id: string; state: string; associated: boolean; direction: string; lagS: number | null; coherence: number | null }

/** The record's peer_states / lag_s / coherence lists ("id:STATE[:ASSOCIATED:DIRECTION]" / "id:value") as rows. */
export function peerRows(d: DecodedArtifact): PeerRow[] {
  const lag = new Map(list(P(d, 'lag_s')).map(s => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)] as [string, string]; }));
  const coh = new Map(list(P(d, 'coherence')).map(s => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)] as [string, string]; }));
  const num = (v: string | undefined) => (v == null || v === 'NA' || !Number.isFinite(Number(v)) ? null : Number(v));
  return list(P(d, 'peer_states')).map(s => {
    const [id, state, assoc, direction] = s.split(':');
    return { id, state, associated: assoc === 'ASSOCIATED', direction: direction ?? 'NONE', lagS: num(lag.get(id)), coherence: num(coh.get(id)) };
  });
}

export function buildRelationshipGraph(loopId: string, peers: PeerRow[], pens: Record<string, string>) {
  const nodes = [{ id: loopId, name: loopId, symbolSize: 28, itemStyle: { color: pens.accent }, category: 0 },
    ...peers.map(p => ({ id: p.id, name: p.id, symbolSize: 18, itemStyle: { color: p.associated ? pens.amber : p.state === 'ANALYSED' ? pens.grey : pens.bad }, category: p.associated ? 1 : 2 }))];
  const links = peers.map(p => ({
    source: p.direction === 'PEER_LEADS_LOOP' ? p.id : loopId, target: p.direction === 'PEER_LEADS_LOOP' ? loopId : p.id,
    lineStyle: { color: p.associated ? pens.amber : pens.grey, width: p.associated ? 2 : 1, type: p.associated ? 'solid' : 'dashed', opacity: p.state === 'ANALYSED' ? 0.9 : 0.4 },
    label: { show: true, formatter: p.associated ? `${phrase(p.direction)} · lag ${p.lagS ?? '—'} s · coh ${p.coherence?.toFixed(2) ?? '—'}` : p.state.toLowerCase().replace(/_/g, ' '), color: pens.grey, fontSize: 11 },
    symbol: p.associated && p.direction !== 'SIMULTANEOUS' ? ['none', 'arrow'] : ['none', 'none'],
  }));
  return {
    animation: false,
    tooltip: { show: false },
    legend: { data: ['loop', 'associated peer', 'not associated / not analysed'], textStyle: { color: pens.grey }, top: 0 },
    series: [{ type: 'graph', layout: 'force', roam: false, force: { repulsion: 260, edgeLength: 140 }, categories: [{ name: 'loop' }, { name: 'associated peer' }, { name: 'not associated / not analysed' }],
      data: nodes, links, label: { show: true, color: pens.grey, position: 'bottom' }, edgeSymbolSize: 8, lineStyle: { curveness: 0 } }],
  };
}

export const G13Record: React.FC<{ d: DecodedArtifact; loopId: string }> = ({ d, loopId }) => {
  const pens = cpmChartColors();
  const peers = peerRows(d);
  const state = P(d, 'capability_state') ?? P(d, 'state') ?? 'UNAVAILABLE';
  const reason = P(d, 'capability_reason') ?? P(d, 'reason') ?? '';
  const graph = useMemo(() => buildRelationshipGraph(loopId, peers, pens), [loopId, peers, pens]);
  const associated = peers.filter(p => p.associated).sort((a, b) => (a.lagS ?? 0) - (b.lagS ?? 0));
  return (
    <section className="cpm-surface">
      <PanelHead eyebrow="G13" title="Interaction and disturbances" right={<TonePill tone={state === 'INTERACTION_DETECTED' ? 'warn' : state === 'NO_INTERACTION' ? 'good' : 'muted'}>{state}</TonePill>} />
      <KvRow label="method">{P(d, 'method_id') ?? '—'}</KvRow>
      <KvRow label="reason">{reason || '—'}</KvRow>
      <KvRow label="band (Hz)">{P(d, 'frequency_hz') ?? '—'} · relationship revision {P(d, 'relationship_revision') ?? '—'}</KvRow>
      {peers.length > 0 && (
        <>
          <PanelHead eyebrow="Candidate relationships" title="Graph relation is not proof" />
          <ReactECharts option={graph} notMerge style={{ height: 260 }} />
          <PanelHead eyebrow="Propagation" title="Associated peers ordered by lag (negative = peer leads)" />
          <table className="cpm-table" data-table="propagation">
            <thead><tr><th>peer</th><th>state</th><th>direction</th><th>lag (s)</th><th>coherence in band</th></tr></thead>
            <tbody>
              {peers.map(p => (
                <tr key={p.id} data-associated={p.associated}>
                  <td className="cpm-mono">{p.id}</td>
                  <td><TonePill tone={p.state === 'ANALYSED' ? (p.associated ? 'warn' : 'good') : 'muted'}>{p.state}</TonePill></td>
                  <td>{p.associated ? phrase(p.direction) : '—'}</td>
                  <td className="cpm-mono">{p.lagS ?? '—'}</td>
                  <td className="cpm-mono">{p.coherence?.toFixed(3) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {associated.length === 0 && <p className="cpm-copy">No peer clears both the coherence and cross-correlation floors on shared support.</p>}
        </>
      )}
      <KvRow label="alternative explanations">{list(P(d, 'alternative_explanations')).map(a => phrase(a)).join(' · ') || 'none listed'}</KvRow>
      <p className="cpm-copy">Unmapped or unobserved peers do not rule out a disturbance; pairwise correlation alone gives no causal certainty.</p>
    </section>
  );
};

/** One peer's aligned pane (own PV and peer PV on the loop's instants; unsupported samples are gaps), its xcorr and coherence. */
export const G13PeerPanes: React.FC<{ aligned: DecodedArtifact; xcorr: DecodedArtifact | undefined; coherence: DecodedArtifact | undefined; timeZone: string }> = ({ aligned, xcorr, coherence, timeZone }) => {
  const peerId = aligned.meta.roleOrPath ?? P(aligned, 'peer_id') ?? 'peer';
  const series: CpmSeries[] = [
    col(aligned, 'own_pv', 'loop PV', 'good', { masked: true }),
    col(aligned, 'y', `${peerId} PV`, 'accent', { masked: true }),
  ];
  return (
    <section className="cpm-surface" data-peer={peerId}>
      <PanelHead eyebrow="Peer" title={peerId} right={<TonePill tone="muted">support {P(aligned, 'support_s') ?? '—'} s</TonePill>} />
      <CpmChart title={`aligned series — ${peerId}`} series={series} xKind="time" timeZone={timeZone} height={220} />
      {xcorr && (
        <CpmChart title={`cross-correlation — ${(P(xcorr, 'lag_sign_convention') ? phrase(P(xcorr, 'lag_sign_convention')) : 'lag')}`} xKind="value" xLabel="lag" xUnit={xcorr.units.x ?? 's'} height={200}
          series={[{ id: 'xcorr', label: `r(lag) · peak ${Number(P(xcorr, 'peak_xcorr') ?? NaN).toFixed(2)} at ${P(xcorr, 'lag_at_peak_s') ?? '—'} s`, unit: '1', x: xcorr.columns.x, y: Array.from(xcorr.columns.y), pen: 'pink' }]} />
      )}
      {coherence && (
        <CpmChart title={`coherence — band ${Number(P(coherence, 'band_low_hz') ?? 0).toExponential(2)}…${Number(P(coherence, 'band_high_hz') ?? 0).toExponential(2)} Hz · max in band ${Number(P(coherence, 'coherence_band_max') ?? NaN).toFixed(2)}`}
          xKind="value" xLabel="frequency" xUnit={coherence.units.x ?? 'Hz'} height={200}
          series={[{ id: 'coh', label: 'magnitude-squared coherence', unit: '1', x: coherence.columns.x, y: Array.from(coherence.columns.y), pen: 'amber' }]} />
      )}
    </section>
  );
};

export const G13Body: React.FC<{ arts: GateArtifacts; loopId: string; timeZone: string }> = ({ arts, loopId, timeZone }) => {
  const record = first(arts, 'interaction');
  if (!record) return null;
  const method = P(record, 'method_id');
  if (!method || method === 'G13.PEER_LINK_FLAG' || P(record, 'capability_reason') === 'INTERACTION_NOT_ANALYSED_BY_LONG_TIER') {
    return (
      <GateResultStatePanel state={{
        kind: 'UNSUPPORTED_METHOD', title: 'Interaction not analysed for this run',
        detail: `${P(record, 'capability_reason') ?? 'LEGACY_FLAG_ONLY'} — legacy link flag: ${P(record, 'legacy_link_flag') ?? '—'}. The long tier that produced this row did not run the aligned peer analysis.`,
        stillValid: 'A configured link is not a verdict: it neither proves nor rules out a disturbance. The other gates of this run are unaffected.', action: 'NONE', tone: 'muted',
      }} />
    );
  }
  const aligned = arts.byKind.aligned_series ?? [];
  const byPeer = (kind: string, peer: string) => (arts.byKind[kind] ?? []).find(a => (a.meta.roleOrPath ?? P(a, 'peer_id')) === peer);
  return (
    <>
      <G13Record d={record} loopId={loopId} />
      {aligned.map(a => {
        const peer = a.meta.roleOrPath ?? P(a, 'peer_id') ?? '';
        return <G13PeerPanes key={peer} aligned={a} xcorr={byPeer('cross_correlation', peer)} coherence={byPeer('coherence', peer)} timeZone={timeZone} />;
      })}
    </>
  );
};

export const G13Interaction: React.FC<GateViewProps> = ({ manifest, gate, timeZone }) => {
  const arts = useGateArtifacts(manifest, gate);
  const loopId = manifest.artifacts[0]?.provenance?.loop_id ?? 'loop';
  return <RequireKinds arts={arts} kinds={['interaction']}><G13Body arts={arts} loopId={loopId} timeZone={timeZone} /></RequireKinds>;
};
