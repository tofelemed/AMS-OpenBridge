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
  // Marun 2026-10-03: served over plain HTTP the browser has no crypto.subtle (secure contexts only) and every
  // artifact failed with "Cannot read properties of undefined (reading 'digest')"; the checksum must not need it.
  sha256: (bytes) => sha256Hex(bytes, globalThis.crypto?.subtle),
};

/** SHA-256 as lowercase hex: the native engine when the context has one, else the pure fallback (same digest). */
export async function sha256Hex(bytes: Uint8Array, subtle: SubtleCrypto | undefined): Promise<string> {
  if (subtle) return hex(new Uint8Array(await subtle.digest('SHA-256', plain(bytes))));
  return hex(sha256Pure(bytes));
}

// FIPS 180-4 SHA-256, plain JavaScript; used only where the browser offers no SubtleCrypto (insecure contexts).
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Pure(input: Uint8Array): Uint8Array {
  const bitLen = input.length * 8;
  const padded = new Uint8Array(((input.length + 9 + 63) >> 6) << 6);
  padded.set(input);
  padded[input.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i], false);
  return out;
}

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

// ── run bundle framing (v2.5 batching; mirror of cplm-api EvidenceManifestReader.BundleAsync) ──
// per artifact: 36 ASCII bytes of the uuid, u32 LE chunk count, then per chunk u32 LE chunk_no,
// u32 LE byte_length and the chunk bytes (still individually gzipped and sha-verified by decodeArtifact).

export interface BundledArtifact { artifactId: string; chunks: Uint8Array[] }

export function frameBundle(artifacts: BundledArtifact[]): Uint8Array {
  const total = artifacts.reduce((n, a) => n + 40 + a.chunks.reduce((m, c) => m + 8 + c.length, 0), 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  for (const a of artifacts) {
    for (let i = 0; i < 36; i++) out[off + i] = a.artifactId.charCodeAt(i);
    off += 36;
    view.setUint32(off, a.chunks.length, true); off += 4;
    a.chunks.forEach((c, no) => {
      view.setUint32(off, no, true); off += 4;
      view.setUint32(off, c.length, true); off += 4;
      out.set(c, off); off += c.length;
    });
  }
  return out;
}

/** artifact id -> chunks by chunk_no. A frame that ends early is refused whole: no partial artifact is ever decoded. */
export function parseBundle(bytes: Uint8Array): Map<string, Uint8Array[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, Uint8Array[]>();
  let off = 0;
  const need = (n: number) => { if (off + n > bytes.length) throw new Error(`BUNDLE_TRUNCATED at ${off}`); };
  while (off < bytes.length) {
    need(40);
    let id = '';
    for (let i = 0; i < 36; i++) id += String.fromCharCode(bytes[off + i]);
    off += 36;
    const count = view.getUint32(off, true); off += 4;
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
      need(8);
      const no = view.getUint32(off, true); off += 4;
      const len = view.getUint32(off, true); off += 4;
      need(len);
      chunks[no] = bytes.slice(off, off + len); off += len;
    }
    out.set(id, chunks);
  }
  return out;
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
