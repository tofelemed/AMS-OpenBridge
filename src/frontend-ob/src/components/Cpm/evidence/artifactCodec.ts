/**
 * v2.5 Task 2E.1 (spec §3.3): the browser side of the evidence chunk transport. An artifact is ONE
 * f64 little-endian column block (x, y[, mask][, named columns]) gzip-compressed and split into
 * chunks; each chunk and the whole stream carry SHA-256s. Nothing is trusted before its checksum
 * verifies, and a mismatch is an error the view shows - never a wrong curve. Decoding is
 * presentation only: no series is ever derived here.
 */
import type { EvidenceArtifactMeta } from '../../../api/cpm/evidence';

export type ArtifactMeta = EvidenceArtifactMeta;

export interface DecodedArtifact {
  meta: ArtifactMeta;
  n: number;
  /** Every column by its manifest name: x, y, and the workbook-named extras (mask is exposed as booleans). */
  columns: Record<string, Float64Array>;
  mask: boolean[] | null;
  units: Record<string, string>;
  /** Legend of a coded column: code -> label. */
  legends: Record<string, string[]>;
}

/** The browser primitives the codec needs, injectable so tests run on Node's zlib / webcrypto. */
export interface CodecPorts {
  inflate: (gzipped: Uint8Array) => Promise<Uint8Array>;
  sha256: (bytes: Uint8Array) => Promise<string>;
  subtle?: SubtleCrypto;
}

/** A copy backed by a plain ArrayBuffer (the DOM APIs refuse SharedArrayBuffer-typed views). */
function plain(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

export const browserPorts: CodecPorts = {
  inflate: async (gzipped) => {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([plain(gzipped)]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  },
  sha256: async (bytes) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', plain(bytes)))),
};

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Mirror of EvidenceChunker.split: fixed-size pieces of the encoded stream (last one shorter). */
export function splitChunks(encoded: Uint8Array, chunkBytes: number): Uint8Array[] {
  if (encoded.length === 0) return [new Uint8Array(0)];
  const out: Uint8Array[] = [];
  for (let off = 0; off < encoded.length; off += chunkBytes) out.push(encoded.slice(off, Math.min(off + chunkBytes, encoded.length)));
  return out;
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export function parseLegend(legend: string): string[] {
  // "0=GOOD;1=BAD" -> ['GOOD', 'BAD'] (codes are dense and ordered by construction)
  const byCode: string[] = [];
  for (const part of legend.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    byCode[Number(part.slice(0, eq))] = part.slice(eq + 1);
  }
  return byCode;
}

function jsonField(provenance: Record<string, string> | undefined, key: string): Record<string, string> {
  const raw = provenance?.[key];
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
}

/** Verifies every checksum, inflates, and lays the f64 columns out by their manifest names. */
export async function decodeArtifact(meta: ArtifactMeta, chunks: Uint8Array[], ports: CodecPorts = browserPorts): Promise<DecodedArtifact> {
  if (chunks.length !== meta.chunkCount) throw new Error(`CHUNK_COUNT_MISMATCH: got ${chunks.length}, manifest says ${meta.chunkCount}`);
  for (let i = 0; i < chunks.length; i++) {
    const expected = meta.chunkChecksums[i];
    if (expected && (await ports.sha256(chunks[i])) !== expected) throw new Error(`CHUNK_CHECKSUM_MISMATCH:${i}`);
  }
  const encoded = joinChunks(chunks);
  if ((await ports.sha256(encoded)) !== meta.checksum) throw new Error('TOTAL_CHECKSUM_MISMATCH');
  const raw = await ports.inflate(encoded);
  const n = meta.calculationSamples ?? 0;
  const cols = meta.columns;
  if (raw.length !== n * cols.length * 8) throw new Error(`PAYLOAD_LENGTH: ${raw.length} bytes for ${n} samples x ${cols.length} columns`);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const columns: Record<string, Float64Array> = {};
  cols.forEach((name, c) => {
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = view.getFloat64((c * n + i) * 8, true);
    columns[name] = arr;
  });
  const mask = columns.mask ? Array.from(columns.mask, v => v !== 0) : null;
  const units = jsonField(meta.provenance, 'column_units');
  if (meta.x.unit && !units.x) units.x = meta.x.unit;
  if (meta.y.unit && !units.y) units.y = meta.y.unit;
  const legendsRaw = jsonField(meta.provenance, 'legends');
  const legends: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(legendsRaw)) legends[k] = parseLegend(v);
  return { meta, n, columns, mask, units, legends };
}

/** Decoded artifacts by evidence id (per page load; the HTTP layer's immutable caching does the rest). */
const memory = new Map<string, DecodedArtifact>();

export async function loadArtifact(
  meta: ArtifactMeta,
  fetchChunk: (evidenceId: string, n: number, signal?: AbortSignal) => Promise<Uint8Array>,
  signal?: AbortSignal,
  ports: CodecPorts = browserPorts,
): Promise<DecodedArtifact> {
  const cached = memory.get(meta.artifactId);
  if (cached && cached.meta.checksum === meta.checksum) return cached;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < meta.chunkCount; i++) chunks.push(await fetchChunk(meta.artifactId, i, signal));
  const decoded = await decodeArtifact(meta, chunks, ports);
  memory.set(meta.artifactId, decoded);
  return decoded;
}

/** A coded column as labels (unknown code -> the code itself, never a guessed label). */
export function labelsOf(d: DecodedArtifact, column: string): string[] {
  const codes = d.columns[column];
  const legend = d.legends[column] ?? [];
  return codes ? Array.from(codes, c => legend[c] ?? String(c)) : [];
}
