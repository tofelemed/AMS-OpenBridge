'use client';

/**
 * profile_config.loop_ingest — the block the wizard never rendered.
 *
 * Why this panel exists: `mode_value_map` decides whether the CPLM engine counts a
 * loop as closed-loop control. The engine's auto test is binary, so a wrong or absent
 * map is not an error — every sample is silently "not auto" and Gate 1 excludes the
 * whole fleet while Gate 0 stays green. On the HDPE plant that state ran undiagnosed
 * because nothing in the product ever showed the map (2026-09-09). Making it visible
 * is the point; making the MODE map editable is the part operators actually needed.
 *
 * Everything else in loop_ingest stays read-only here — param_roles in particular has
 * overlay semantics and a server-side guard, and belongs in the API, not a text box.
 *
 * PUT replaces profile_config wholesale, so saving is a read-modify-write of the whole
 * stored object (CHG-012). The mqtt block, including the TLS certificate, is carried
 * across untouched.
 */

import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { T } from '../../styles/theme';
import { Fact, Pill, monoFamily } from './adminUi';
import { DataSourceDto, LoopIngestConfig, extractApiError, updateDataSource } from './dataSourcesApi';

/** Mirror of ingestion-service ModeVocabulary.cs, itself a mirror of the Flink
 *  CplmNormalizedSample token sets. Keep the three in step. */
const AUTO_TOKENS = new Set([
  'AUTO', 'AUT', 'A', 'AUTOMATIC', 'NORMAL', 'NORM',
  'CAS', 'CASC', 'CASCADE', 'RSP', 'DDC', 'SUP', 'SUPERVISORY',
]);
const MANUAL_TOKENS = new Set([
  'MAN', 'MANUAL', 'M', 'IMAN', 'ROUT', 'LO', 'LOCAL', 'OFF', 'TRACK',
]);

type ModeClass = 'auto' | 'manual' | 'unrecognised';

/** What the engine will make of this token. Manual wins before auto, as in the engine. */
export function classifyMode(token: string): ModeClass {
  const m = token.trim().toUpperCase();
  if (!m || m === 'UNKNOWN') return 'unrecognised';
  if (MANUAL_TOKENS.has(m)) return 'manual';
  if (AUTO_TOKENS.has(m)) return 'auto';
  if (m.includes('AUTO') || m.includes('CASCADE')) return 'auto';
  return 'unrecognised';
}

/** SME-confirmed Yokogawa CENTUM enum (docs/ot-data-integration/10 §2). */
const CENTUM_PRESET: Array<[string, string]> = [['1', 'AUT'], ['2', 'MAN'], ['3', 'CAS'], ['4', 'IMAN']];

interface Row { value: string; token: string }

const toRows = (map?: Record<string, string>): Row[] =>
  Object.entries(map ?? {}).map(([value, token]) => ({ value, token }));

const CLASS_COLOR: Record<ModeClass, string> = {
  auto: T.success,
  manual: T.textSecondary,
  unrecognised: T.critical,
};
const CLASS_LABEL: Record<ModeClass, string> = {
  auto: 'counts as AUTO',
  manual: 'counts as MANUAL',
  unrecognised: 'NOT RECOGNISED — engine treats it as manual',
};

const LoopIngestPanel: React.FC<{
  source: DataSourceDto;
  canManage: boolean;
  onSaved: (saved: DataSourceDto) => void;
}> = ({ source, canManage, onSaved }) => {
  const li = (source.profileConfig?.loop_ingest ?? {}) as LoopIngestConfig;
  const storedMap = li.mode_value_map;
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => toRows(storedMap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapEntries = Object.entries(storedMap ?? {});
  const mapPresent = mapEntries.length > 0;
  const storedHasAuto = mapEntries.some(([, token]) => classifyMode(token) === 'auto');
  const draftHasAuto = rows.some(r => r.value.trim() && classifyMode(r.token) === 'auto');

  const beginEdit = () => { setRows(toRows(storedMap)); setError(null); setEditing(true); };
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const map: Record<string, string> = {};
      for (const r of rows) {
        const v = r.value.trim();
        const t = r.token.trim().toUpperCase();
        if (v && t) map[v] = t;
      }
      // Read-modify-write: PUT replaces profile_config, so send the whole object.
      const pc = source.profileConfig ?? {};
      const saved = await updateDataSource(source.configId, {
        profileConfig: { ...pc, loop_ingest: { ...li, mode_value_map: map } },
      });
      onSaved(saved);
      setEditing(false);
    } catch (err) {
      const { message, field } = extractApiError(err);
      setError(field ? `${message} (${field})` : message);
    } finally {
      setSaving(false);
    }
  };

  const paramRoles = li.param_roles && Object.keys(li.param_roles).length
    ? Object.entries(li.param_roles).map(([k, v]) => `${k}→${v ?? '(removed)'}`).join('  ')
    : 'none — built-in roles apply (PV, SP, OP, MODE, VP, …)';

  return (
    <div style={{
      borderTop: `1px solid ${T.border}`, paddingTop: '12px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: T.textPrimary }}>Loop ingest</span>
        <Pill
          text={mapPresent ? `MODE map · ${mapEntries.length} value${mapEntries.length === 1 ? '' : 's'}` : 'NO MODE MAP'}
          color={mapPresent && storedHasAuto ? T.success : T.critical}
        />
        {canManage && !editing && (
          <ObcButton variant="flat" onClick={beginEdit}>Edit MODE map</ObcButton>
        )}
      </div>

      {/* The failure this panel exists to make visible. */}
      {!editing && (!mapPresent || !storedHasAuto) && (
        <div role="status" style={{
          padding: '9px 14px', borderRadius: T.radiusSm, fontSize: '12.5px', lineHeight: 1.5,
          background: T.criticalBg, border: `1px solid ${T.critical}`, color: T.critical,
        }}>
          {!mapPresent
            ? 'No MODE map: every MODE value reaches the engine raw (e.g. "1"), which it cannot classify, so every sample counts as not-auto and Gate 1 excludes this source’s whole fleet — with Gate 0 still green.'
            : 'No mapped value counts as AUTO: every loop on this source will be excluded at Gate 1. A cascade slave counts as auto — map it to CAS.'}
        </div>
      )}

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 24px' }}>
          <Fact
            label="MODE value map"
            value={mapPresent ? mapEntries.map(([v, t]) => `${v}→${t}`).join('  ') : 'not configured'}
            mono
            color={mapPresent ? undefined : T.critical}
          />
          <Fact label="Grid" value={`${li.grid_seconds ?? 5} s`} />
          <Fact label="Registry refresh" value={`${li.registry_refresh_seconds ?? 60} s`} />
          <Fact label="Topic template" value={li.topic_template ?? '{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}'} mono />
          <Fact label="Param roles overlay" value={paramRoles} mono />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: T.textSecondary, lineHeight: 1.5 }}>
            Source MODE value → engine token. Use exact tokens: <strong>AUT</strong>, <strong>MAN</strong>,
            {' '}<strong>CAS</strong>, <strong>IMAN</strong>. Everything else in this block is managed through
            the API and is left untouched by this save.
          </div>

          {rows.map((row, i) => {
            const cls = classifyMode(row.token);
            const filled = row.value.trim() !== '' || row.token.trim() !== '';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  aria-label={`MODE value ${i + 1}`}
                  value={row.value}
                  placeholder="value"
                  onChange={e => setRow(i, { value: e.target.value })}
                  style={{
                    width: '90px', padding: '6px 10px', fontFamily: monoFamily, fontSize: '13px',
                    background: T.card, color: T.textPrimary,
                    border: `1px solid ${T.border}`, borderRadius: T.radiusSm,
                  }}
                />
                <span style={{ color: T.textMuted }}>→</span>
                <input
                  aria-label={`Engine token ${i + 1}`}
                  value={row.token}
                  placeholder="AUT"
                  onChange={e => setRow(i, { token: e.target.value })}
                  style={{
                    width: '120px', padding: '6px 10px', fontFamily: monoFamily, fontSize: '13px',
                    background: T.card, color: T.textPrimary,
                    border: `1px solid ${filled && cls === 'unrecognised' ? T.critical : T.border}`,
                    borderRadius: T.radiusSm,
                  }}
                />
                {filled && (
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: CLASS_COLOR[cls] }}>
                    {CLASS_LABEL[cls]}
                  </span>
                )}
                <ObcButton variant="flat" onClick={() => setRows(rs => rs.filter((_, n) => n !== i))}>
                  Remove
                </ObcButton>
              </div>
            );
          })}

          {rows.length > 0 && !draftHasAuto && (
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: T.critical }}>
              Nothing here counts as AUTO — saving this map excludes every loop on this source at Gate 1.
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ObcButton variant="flat" onClick={() => setRows(rs => [...rs, { value: '', token: '' }])}>
              Add value
            </ObcButton>
            <ObcButton variant="flat" onClick={() => setRows(CENTUM_PRESET.map(([value, token]) => ({ value, token })))}>
              Use Yokogawa CENTUM preset
            </ObcButton>
          </div>

          {error && (
            <div role="alert" style={{
              padding: '9px 14px', borderRadius: T.radiusSm, fontSize: '12.5px', fontWeight: 600,
              background: T.criticalBg, border: `1px solid ${T.critical}`, color: T.critical,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <ObcButton variant="raised" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save MODE map'}
            </ObcButton>
            <ObcButton variant="flat" disabled={saving} onClick={() => setEditing(false)}>Cancel</ObcButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoopIngestPanel;
