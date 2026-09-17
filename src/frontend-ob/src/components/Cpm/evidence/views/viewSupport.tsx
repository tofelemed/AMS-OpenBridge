/**
 * v2.5 Task 2E.4: what every gate view shares - the decoded artifacts of its gate, a stated panel
 * when a required kind is missing (never an empty chart, NR-034), the site-zone formatter, and
 * small series helpers that only re-shape decoded columns (no derivation).
 */
import React from 'react';
import { EmptyState, KvRow, TonePill } from '../../shared';
import type { DecodedArtifact } from '../artifactCodec';
import type { GateArtifacts } from '../useGateArtifacts';
import type { CpmSeries, Pen } from '../CpmChart';
import { fmtQuantity, labelForKey, unitForKey } from '../format';

export const RequireKinds: React.FC<{ arts: GateArtifacts; kinds: string[]; children: React.ReactNode }> = ({ arts, kinds, children }) => {
  const missing = kinds.filter(k => !arts.byKind[k] || arts.byKind[k].length === 0);
  if (arts.loading && missing.length > 0) return <EmptyState title="Decoding artifacts…" copy={`Waiting for ${missing.join(', ')}.`} />;
  if (arts.errors.length > 0) {
    return (
      <EmptyState title="An artifact did not verify"
        copy={arts.errors.map(e => `${e.kind}${e.roleOrPath ? ` (${e.roleOrPath})` : ''}: ${e.message}`).join(' · ') + ' — nothing is drawn from bytes that failed their checksum.'} />
    );
  }
  if (missing.length > 0) {
    const declared = arts.unavailable.filter(u => missing.includes(u.kind));
    return (
      <EmptyState title={`Artifact${missing.length > 1 ? 's' : ''} not available: ${missing.join(', ')}`}
        copy={declared.length > 0
          ? declared.map(u => `${u.kind}: ${u.readiness}${u.reason ? ` (${u.reason})` : ''}`).join(' · ')
          : 'This run retained no such artifact. The verdict stands; reconstruct the evidence to see the arrays.'} />
    );
  }
  return <>{children}</>;
};

export function first(arts: GateArtifacts, kind: string): DecodedArtifact | undefined {
  return arts.byKind[kind]?.[0];
}

/** A decoded column as a series (mask applied as gaps when asked). */
export function col(d: DecodedArtifact, name: string, label: string, pen: Pen, opts: { unit?: string; masked?: boolean; held?: boolean; markers?: boolean; dashed?: boolean; bandMeaning?: string; x?: ArrayLike<number> } = {}): CpmSeries {
  const raw = d.columns[name];
  const y: Array<number | null> = Array.from(raw ?? [], (v, i) => (opts.masked && d.mask && !d.mask[i]) ? null : Number.isFinite(v) ? v : null);
  return { id: name, label, unit: opts.unit ?? d.units[name] ?? (name === 'y' ? (d.units.y ?? d.meta.y.unit ?? '') : ''), x: opts.x ?? d.columns.x, y, pen, held: opts.held, markers: opts.markers, dashed: opts.dashed, bandMeaning: opts.bandMeaning };
}

/** Marker points at given x instants on a fixed y (e.g. zero crossings on a centred signal). */
export function markersAt(x: ArrayLike<number>, y: number, id: string, label: string, pen: Pen, unit: string): CpmSeries {
  return { id, label, unit, x, y: Array.from(x, () => y), pen, markers: true };
}

/** A boolean (0/1) column as marker points on another series' values. */
export function markersWhere(d: DecodedArtifact, flagColumn: string, valueColumn: string, label: string, pen: Pen, unit?: string): CpmSeries {
  const flags = d.columns[flagColumn];
  const values = d.columns[valueColumn];
  const y: Array<number | null> = Array.from(values ?? [], (v, i) => (flags && flags[i] !== 0 ? v : null));
  return { id: `${flagColumn}@${valueColumn}`, label, unit: unit ?? d.units[valueColumn] ?? '', x: d.columns.x, y, pen, markers: true };
}

/** Provenance rows with the reader's label (raw key on hover) and the formatted value (raw on hover). */
export const Provenance: React.FC<{ d: DecodedArtifact; keys: string[] }> = ({ d, keys }) => (
  <>
    {keys.map(k => {
      const raw = d.meta.provenance?.[k];
      return (
        <KvRow key={k} label={labelForKey(k)}>
          {raw == null ? <TonePill tone="muted">not declared</TonePill> : <span title={`${k} = ${raw}`}>{fmtQuantity(raw, unitForKey(k), k)}</span>}
        </KvRow>
      );
    })}
  </>
);

export const SR = ({ children }: { children: React.ReactNode }) => <span className="cpm-sr-only">{children}</span>;
