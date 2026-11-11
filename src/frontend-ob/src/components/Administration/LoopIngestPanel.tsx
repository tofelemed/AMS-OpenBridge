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
 * CHG-172 (owner review, the approved sample, badge 13/15): a titled part of the data-source panel; the pill is tone, glyph and
 * word; the facts are rows; Edit MODE map opens a dialog (ModeMapDialog) instead of editing inside the panel.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { KvRow, TonePill } from '../Cpm/shared';
import { DataSourceDto, LoopIngestConfig } from './dataSourcesApi';
import { classifyMode } from '../../utils/modeVocabulary';
import { ModeMapDialog } from './ModeMapDialog';

const LoopIngestPanel: React.FC<{
  source: DataSourceDto;
  canManage: boolean;
  onSaved: (saved: DataSourceDto) => void;
}> = ({ source, canManage, onSaved }) => {
  const li = (source.profileConfig?.loop_ingest ?? {}) as LoopIngestConfig;
  const [editing, setEditing] = useState(false);
  const mapEntries = Object.entries(li.mode_value_map ?? {});
  const mapPresent = mapEntries.length > 0;
  const storedHasAuto = mapEntries.some(([, token]) => classifyMode(token) === 'auto');
  const paramRoles = li.param_roles && Object.keys(li.param_roles).length
    ? Object.entries(li.param_roles).map(([k, v]) => `${k}→${v ?? '(removed)'}`).join('  ')
    : 'none — built-in roles apply (PV, SP, OP, MODE, VP, …)';
  const good = mapPresent && storedHasAuto;

  return (
    <section className="cpm-admin-part" aria-label="Loop ingest">
      <div className="cpm-title-row cpm-admin-part__head">
        <h3 className="cpm-reg-part__title">Loop ingest</h3>
        <TonePill tone={good ? 'good' : 'bad'} glyph={good ? '✓' : '✕'}>
          {mapPresent ? `MODE map · ${mapEntries.length} value${mapEntries.length === 1 ? '' : 's'}` : 'NO MODE MAP'}
        </TonePill>
        {canManage && <ObcButton variant="flat" onClick={() => setEditing(true)}>Edit MODE map</ObcButton>}
      </div>

      {/* The failure this panel exists to make visible. */}
      {!good && (
        <p className="cpm-admin-warn" role="status">
          {!mapPresent
            ? 'No MODE map: every MODE value reaches the engine raw (e.g. "1"), which it cannot classify, so every sample counts as not-auto and Gate 1 excludes this source’s whole fleet — with Gate 0 still green.'
            : 'No mapped value counts as AUTO: every loop on this source will be excluded at Gate 1. A cascade slave counts as auto — map it to CAS.'}
        </p>
      )}

      <KvRow label="MODE value map">
        {mapPresent ? <span className="cpm-mono">{mapEntries.map(([v, t]) => `${v}→${t}`).join('  ')}</span> : <span className="cpm-field__error">not configured</span>}
      </KvRow>
      <KvRow label="Grid">{`${li.grid_seconds ?? 5} s`}</KvRow>
      <KvRow label="Registry refresh">{`${li.registry_refresh_seconds ?? 60} s`}</KvRow>
      <KvRow label="Quality protocol"><span className="cpm-mono">{li.quality_protocol ?? 'STRING_ENUM (default)'}</span></KvRow>
      <KvRow label="Topic template"><span className="cpm-mono">{li.topic_template ?? '{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}'}</span></KvRow>
      <KvRow label="Param roles overlay"><span className="cpm-mono">{paramRoles}</span></KvRow>

      {editing && <ModeMapDialog source={source} onClose={() => setEditing(false)} onSaved={onSaved} />}
    </section>
  );
};

export default LoopIngestPanel;
