'use client';

/**
 * Plant Model CSV importer (P4.1) — split out of PlantModelConfig to honour the
 * 400–500-line file ceiling (CLAUDE.md). Same contract as before: 3-step
 * Source → Review → Import; one by-paths preload; level cells accept segments
 * or display names; hierarchy auto-create is an explicit opt-in that lists
 * exactly what it will create; ot_tag columns become alias rows.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Modal } from '../shared/Modal';
import { parseCsv, downloadTextFile } from '../../utils/csv';
import { apiJson, ApiError } from '../../api/apiFetch';
import { toast } from 'react-toastify';
import { T } from '../../styles/theme';
import { slugSegment } from './PlantModelConfig';

const ASSET_API = (import.meta.env.VITE_ASSET_SERVICE_URL as string | undefined) || '/api/assets';
const ALIAS_API = '/api/aliases';

const SEGMENT_RX = /^[A-Za-z0-9_-]+$/;
const TYPE_NAMES: Record<number, string> = { 1: 'Site', 2: 'Area', 3: 'Unit', 4: 'Device', 5: 'Measurement' };

// ── CSV import (P4.1) ───────────────────────────────────────────────────────

const CSV_HEADERS = ['site', 'area', 'unit', 'device', 'measurement', 'name', 'description',
  'engineering_unit', 'range_lo', 'range_hi', 'device_template', 'ot_tag'] as const;

interface PlannedCreate {
  contextualPath: string;
  name: string;
  type: number;
  description?: string | null;
  engineeringUnit?: string | null;
  loEngLimit?: number | null;
  hiEngLimit?: number | null;
  template?: string | null;
}

interface ImportRow {
  line: number;
  cells: Record<string, string>;
  problems: string[];
  /** Creates this row contributes (deduped across the file before sending). */
  creates: PlannedCreate[];
  alias?: { legacyPath: string; canonicalPath: string };
}

/**
 * Resolve one level cell against existing paths + already-planned creates.
 * Cells may be path segments ('section_100') or display names ('Section 100') —
 * the raw value is preferred when it already matches, else its slug.
 */
function resolveLevel(
  parentPath: string | null, cell: string, sep: '/' | '.',
  known: Set<string>, planned: Map<string, PlannedCreate>,
): { path: string; segment: string; exists: boolean } {
  const join = (segment: string) => parentPath ? `${parentPath}${sep}${segment}` : segment;
  const rawOk = SEGMENT_RX.test(cell);
  if (rawOk && (known.has(join(cell)) || planned.has(join(cell))))
    return { path: join(cell), segment: cell, exists: true };
  const slug = slugSegment(cell);
  if (known.has(join(slug)) || planned.has(join(slug)))
    return { path: join(slug), segment: slug, exists: true };
  const segment = rawOk && cell === cell.toLowerCase() ? cell : slug;
  return { path: join(segment), segment, exists: false };
}

export const ImportDialog: React.FC<{ onClose: (changed: boolean) => void }> = ({ onClose }) => {
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [createMissing, setCreateMissing] = useState(false);
  const [plan, setPlan] = useState<{ rows: ImportRow[]; creates: PlannedCreate[]; aliases: { legacyPath: string; canonicalPath: string }[] } | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; aliases: number; errors: { path?: string; error: string }[] } | null>(null);

  const downloadTemplate = () => downloadTextFile('plant-model-template.csv', [
    CSV_HEADERS.join(','),
    'hdpe,section_100,u1001_polymerization_reactor_1,45fic109,pv,45FIC-109 PV,Feed flow PV,m3/h,0,500,,45FIC109.PV',
    'hdpe,section_100,u1001_polymerization_reactor_1,pump101,,Feed Pump 101,Slurry feed pump,,,,Pump,',
  ].join('\n'));

  /**
   * Validation (origin-spec §5.2): load the existing path set ONCE, then check
   * every row in memory. Hierarchy is never auto-created unless the operator
   * explicitly opts in — and then the plan lists exactly what will be created.
   */
  const validate = async () => {
    setValidating(true);
    try {
      const rows = parseCsv(text);
      // Candidate paths for one by-paths probe: every raw + slug variant.
      const candidates = new Set<string>();
      for (const r of rows) {
        let p: string[] = [];
        for (const level of ['site', 'area', 'unit', 'device'] as const) {
          const cell = (r[level] ?? '').trim();
          if (!cell) { if (level === 'area') continue; else break; }
          const variants = [cell, slugSegment(cell)].filter(v => SEGMENT_RX.test(v));
          const parents = p.length ? p : [''];
          const next: string[] = [];
          for (const parent of parents)
            for (const v of variants)
              next.push(parent ? `${parent}/${v}` : v);
          next.forEach(x => candidates.add(x));
          p = next;
        }
        const meas = (r['measurement'] ?? '').trim();
        if (meas) for (const parent of p) {
          for (const v of [meas, slugSegment(meas)].filter(v => SEGMENT_RX.test(v)))
            candidates.add(`${parent}.${v}`);
        }
      }
      const known = new Set<string>();
      const list = [...candidates];
      for (let i = 0; i < list.length; i += 1000) {
        const res = await apiJson<{ contextualPath: string }[]>(`${ASSET_API}/by-paths`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: list.slice(i, i + 1000) }),
        });
        res.forEach(a => known.add(a.contextualPath));
      }

      const planned = new Map<string, PlannedCreate>();
      const importRows: ImportRow[] = rows.map((cells, i) => {
        const row: ImportRow = { line: i + 2, cells, problems: [], creates: [] };
        const site = (cells['site'] ?? '').trim();
        if (!site) { row.problems.push('site is required'); return row; }

        const num = (v: string) => (v.trim() === '' ? null : Number(v));
        const chain: { level: 'site' | 'area' | 'unit' | 'device'; type: number; cell: string }[] = [];
        chain.push({ level: 'site', type: 1, cell: site });
        const area = (cells['area'] ?? '').trim();
        if (area) chain.push({ level: 'area', type: 2, cell: area });
        const unit = (cells['unit'] ?? '').trim();
        const device = (cells['device'] ?? '').trim();
        const measurement = (cells['measurement'] ?? '').trim();
        if (unit) chain.push({ level: 'unit', type: 3, cell: unit });
        else if (device) { row.problems.push('device given without a unit'); return row; }
        if (device) chain.push({ level: 'device', type: 4, cell: device });
        else if (measurement) { row.problems.push('measurement given without a device'); return row; }

        let parentPath: string | null = null;
        for (const link of chain) {
          const r = resolveLevel(parentPath, link.cell, '/', known, planned);
          if (!r.exists) {
            const isHierarchy = link.type <= 3;
            if (isHierarchy && !createMissing) {
              row.problems.push(`${link.level} '${link.cell}' is not in the asset model (tick "create missing hierarchy" to add it)`);
              return row;
            }
            if (!planned.has(r.path)) {
              const create: PlannedCreate = {
                contextualPath: r.path,
                name: link.cell,
                type: link.type,
                description: link.type === 4 ? (cells['description'] ?? '').trim() || null : null,
                template: link.type === 4 ? (cells['device_template'] ?? '').trim() || null : null,
              };
              planned.set(r.path, create);
              row.creates.push(create);
            }
          }
          parentPath = r.path;
        }

        if (measurement) {
          const r = resolveLevel(parentPath, measurement, '.', known, planned);
          if (!r.exists && !planned.has(r.path)) {
            const create: PlannedCreate = {
              contextualPath: r.path,
              name: (cells['name'] ?? '').trim() || measurement,
              type: 5,
              description: (cells['description'] ?? '').trim() || null,
              engineeringUnit: (cells['engineering_unit'] ?? '').trim() || null,
              loEngLimit: num(cells['range_lo'] ?? ''),
              hiEngLimit: num(cells['range_hi'] ?? ''),
            };
            planned.set(r.path, create);
            row.creates.push(create);
          }
          const otTag = (cells['ot_tag'] ?? '').trim();
          if (otTag) row.alias = { legacyPath: otTag, canonicalPath: r.path };
        }
        return row;
      });

      setPlan({
        rows: importRows,
        creates: [...planned.values()],
        aliases: importRows.map(r => r.alias).filter((a): a is { legacyPath: string; canonicalPath: string } => !!a),
      });
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  };

  const runImport = async () => {
    if (!plan) return;
    setImporting(true);
    try {
      const errors: { path?: string; error: string }[] = [];
      let created = 0;
      for (let i = 0; i < plan.creates.length; i += 2000) {
        const res = await apiJson<{ created: unknown[]; errors: { path?: string; error: string }[] }>(
          `${ASSET_API}/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creates: plan.creates.slice(i, i + 2000) }),
          });
        created += res.created.length;
        errors.push(...(res.errors ?? []));
      }
      let aliases = 0;
      // Chunked like the asset creates — /aliases/bulk caps at 5000 per request,
      // and a big instrument list carries one ot_tag per measurement.
      const aliasCreates = plan.aliases.map(a => ({ ...a, sourceSystem: 'ot-gateway' }));
      for (let i = 0; i < aliasCreates.length; i += 2000) {
        const res = await apiJson<{ created: number; errors: { legacyPath?: string; error: string }[] }>(
          `${ALIAS_API}/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creates: aliasCreates.slice(i, i + 2000) }),
          });
        aliases += res.created;
        errors.push(...(res.errors ?? []).map(e => ({ path: e.legacyPath, error: `alias: ${e.error}` })));
      }
      setResult({ created, aliases, errors });
      setStep(2);
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
    } finally {
      setImporting(false);
    }
  };

  const badRows = plan?.rows.filter(r => r.problems.length > 0) ?? [];

  return (
    <Modal
      isOpen
      onClose={() => onClose(step === 2)}
      title="Import plant model from CSV"
      subtitle="Source → Review → Import. Nothing is written until the last step."
      width="720px"
      footer={
        <>
          <ObcButton variant="normal" onClick={() => onClose(step === 2)}>
            {step === 2 ? 'Close' : 'Cancel'}
          </ObcButton>
          {step === 0 && (
            <ObcButton variant="raised" disabled={!text.trim() || validating} onClick={validate}>
              {validating ? 'Validating…' : 'Validate →'}
            </ObcButton>
          )}
          {step === 1 && (
            <>
              <ObcButton variant="normal" onClick={() => { setStep(0); setPlan(null); }}>← Back</ObcButton>
              <ObcButton variant="raised" disabled={importing || (plan?.creates.length ?? 0) === 0} onClick={runImport}>
                {importing ? 'Importing…' : `Import ${plan?.creates.length ?? 0} asset(s)`}
              </ObcButton>
            </>
          )}
        </>
      }
    >
      {step === 0 && (
        <>
          <p style={{ fontSize: '13px', color: T.textSecondary, marginTop: 0 }}>
            Columns: <code>{CSV_HEADERS.join(', ')}</code>. Level cells accept the path segment
            (<code>section_100</code>) or the display name (<code>Section 100</code>).{' '}
            <button type="button" onClick={downloadTemplate}
              style={{ background: 'none', border: 'none', color: T.blue, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: '13px' }}>
              Download template
            </button>
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={CSV_HEADERS.join(',')}
            style={{
              width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: '12px',
              background: T.card, color: T.textPrimary, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: 10, resize: 'vertical',
            }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '13px', color: T.textPrimary }}>
            <input type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} />
            Create missing hierarchy levels (sites / areas / units) from the file.
            Off = rows referencing unknown hierarchy are rejected — the origin-spec default.
          </label>
        </>
      )}

      {step === 1 && plan && (
        <>
          <div style={{ display: 'flex', gap: 18, fontSize: '13px', marginBottom: 10 }}>
            <span style={{ color: T.textPrimary }}><strong>{plan.rows.length}</strong> row(s)</span>
            <span style={{ color: badRows.length ? T.critical : T.success }}>
              <strong>{badRows.length}</strong> with problems
            </span>
            <span style={{ color: T.textPrimary }}><strong>{plan.creates.length}</strong> asset(s) to create</span>
            <span style={{ color: T.textPrimary }}><strong>{plan.aliases.length}</strong> OT alias(es)</span>
          </div>
          {badRows.length > 0 && (
            <div style={{ maxHeight: 160, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 10 }}>
              {badRows.map(r => (
                <div key={r.line} style={{ padding: '4px 10px', fontSize: '12px', color: T.critical, borderBottom: `1px solid ${T.borderLight}` }}>
                  Line {r.line}: {r.problems.join('; ')}
                </div>
              ))}
            </div>
          )}
          <div style={{ maxHeight: 240, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
            {plan.creates.map(c => (
              <div key={c.contextualPath} style={{
                display: 'flex', gap: 10, padding: '4px 10px', fontSize: '12px',
                borderBottom: `1px solid ${T.borderLight}`, alignItems: 'baseline',
              }}>
                <span style={{ width: 90, color: T.textMuted, textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 }}>
                  {TYPE_NAMES[c.type]}
                </span>
                <span style={{ fontFamily: 'monospace', color: T.textPrimary }}>{c.contextualPath}</span>
                <span style={{ color: T.textSecondary }}>{c.name}</span>
              </div>
            ))}
            {plan.creates.length === 0 && (
              <div style={{ padding: 12, fontSize: '13px', color: T.textMuted }}>
                Nothing to create — every referenced asset already exists.
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && result && (
        <div style={{ fontSize: '13px', color: T.textPrimary }}>
          <p><strong>{result.created}</strong> asset(s) created, <strong>{result.aliases}</strong> alias(es) written.</p>
          {result.errors.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ padding: '4px 10px', fontSize: '12px', color: T.critical, borderBottom: `1px solid ${T.borderLight}` }}>
                  {e.path ? `${e.path}: ` : ''}{e.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
