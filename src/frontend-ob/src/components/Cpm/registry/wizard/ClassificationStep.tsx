/**
 * v2.5 Task 2G.1 (spec v6 §6.1-6.3, R25; NR-016, NR-019): the loop model as five explicit selects -
 * service family, dynamic class, objective, topology, command path - plus the acquisition contract
 * (mode, grid, source filter, timestamp quantisation, declared scan). The loop_type preset is shown
 * as a suggestion; an explicit value is EXPLICIT and the registry never overwrites it with a preset.
 *
 * CHG-168 (owner review): two titled parts. Loop model: a badge says where the model comes from ("◌ Preset from loop type" /
 * "✓ Explicit"; the Classification source row went), each select's first option names the preset ("preset (FLOW)"; the
 * "Preset for FIC: …" sentence went) and the override rule is behind the ?. Acquisition: the four hints are behind the ? and
 * an undeclared number reads "undeclared" (the hints were cut off as placeholders).
 */
import React from 'react';
import { TonePill } from '../../shared';
import { Toggletip } from '../../../../ui/Toggletip';
import type { CpmLoopModel, CpmRegistryContract } from '../../../../api/cpmApi';
import { Grid, Part } from './editorParts';

export interface ModelForm {
  serviceFamily: string; dynamicClass: string; objectiveType: string; topology: string; commandPath: string;
  acqMode: string; gridSeconds: string; sourceFilterS: string; tsQuantMs: string; declaredScanS: string;
}

export const emptyModelForm = (): ModelForm => ({ serviceFamily: '', dynamicClass: '', objectiveType: '', topology: '', commandPath: '', acqMode: '', gridSeconds: '', sourceFilterS: '', tsQuantMs: '', declaredScanS: '' });

const DIMENSIONS: Array<{ key: keyof ModelForm & ('serviceFamily' | 'dynamicClass' | 'objectiveType' | 'topology' | 'commandPath'); label: string; list: keyof NonNullable<CpmRegistryContract['model']> }> = [
  { key: 'serviceFamily', label: 'Service family', list: 'serviceFamilies' },
  { key: 'dynamicClass', label: 'Dynamic class', list: 'dynamicClasses' },
  { key: 'objectiveType', label: 'Objective', list: 'objectiveTypes' },
  { key: 'topology', label: 'Topology', list: 'topologies' },
  { key: 'commandPath', label: 'Command path', list: 'commandPaths' },
];

const NUMBERS: Array<{ key: 'gridSeconds' | 'sourceFilterS' | 'tsQuantMs' | 'declaredScanS'; label: string; hint: string }> = [
  { key: 'gridSeconds', label: 'Grid (s)', hint: 'Grid: the sample interval the source delivers.' },
  { key: 'sourceFilterS', label: 'Source filter (s)', hint: 'Source filter: time constant of any filter before the tag.' },
  { key: 'tsQuantMs', label: 'Timestamp quantisation (ms)', hint: 'Timestamp quantisation: timestamp resolution at the source.' },
  { key: 'declaredScanS', label: 'Declared scan (s)', hint: 'Declared scan: the controller scan.' },
];

const num = (t: string): number | null | undefined => { const s = t.trim(); if (s === '') return undefined; const n = Number(s); return Number.isFinite(n) ? n : null; };

export function isExplicit(f: ModelForm): boolean {
  return Object.values(f).some(v => v.trim() !== '');
}

/** The request model: null when nothing is declared or a number does not parse (never a guessed declaration). */
export function modelOf(f: ModelForm): CpmLoopModel | null {
  if (!isExplicit(f)) return null;
  const parsed = { gridSeconds: num(f.gridSeconds), sourceFilterS: num(f.sourceFilterS), timestampQuantizationMs: num(f.tsQuantMs), declaredScanS: num(f.declaredScanS) };
  if (Object.values(parsed).some(v => v === null)) return null;
  const anyAcq = f.acqMode.trim() !== '' || Object.values(parsed).some(v => v !== undefined);
  return {
    serviceFamily: f.serviceFamily || null, dynamicClass: f.dynamicClass || null, objectiveType: f.objectiveType || null, topology: f.topology || null, commandPath: f.commandPath || null,
    acquisition: anyAcq ? { mode: f.acqMode || 'PERIODIC', gridSeconds: parsed.gridSeconds ?? null, sourceFilterS: parsed.sourceFilterS ?? null, timestampQuantizationMs: parsed.timestampQuantizationMs ?? null, declaredScanS: parsed.declaredScanS ?? null } : null,
  };
}

export const ClassificationStep: React.FC<{ loopType: string; contract: CpmRegistryContract['model'] | undefined; form: ModelForm; onChange: (f: ModelForm) => void }> = ({ loopType, contract, form, onChange }) => {
  const preset = contract?.presets?.[loopType];
  const set = (k: keyof ModelForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...form, [k]: e.target.value });
  const badNumber = NUMBERS.some(n => num(form[n.key]) === null);
  const explicit = isExplicit(form);
  return (
    <>
      <Part title="Loop model"
        end={explicit ? <TonePill tone="good" glyph="✓">Explicit</TonePill> : <TonePill tone="muted" glyph="◌">Preset from loop type</TonePill>}
        help={(
          <Toggletip variant="how-to" label="Loop model">
            <p>The tag type only suggests a model. Explicit values override the preset and are never overwritten by a later preset; leave a field blank to take the preset.</p>
          </Toggletip>
        )}>
        <Grid>
          {DIMENSIONS.map(d => (
            <label key={d.key} className="cpm-field cpm-reg-field">
              <span className="ui-field__label">{d.label}</span>
              <select className="cpm-select" aria-label={d.label} value={form[d.key]} onChange={set(d.key)}>
                <option value="">preset{preset ? ` (${(preset as unknown as Record<string, string | null>)[d.key] ?? '—'})` : ''}</option>
                {((contract?.[d.list] as string[] | undefined) ?? []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          ))}
        </Grid>
      </Part>
      <Part title="Acquisition"
        help={(
          <Toggletip variant="how-to" label="Acquisition">
            <p>What the source delivers bounds what a method can claim: a grid too coarse for the fastest period makes G5/G6/G12 LIMITED (bandwidth), and an RBE source's held values are holds, not process values.</p>
            {NUMBERS.map(n => <p key={n.key}>{n.hint}</p>)}
          </Toggletip>
        )}>
        <Grid>
          <label className="cpm-field cpm-reg-field">
            <span className="ui-field__label">Mode</span>
            <select className="cpm-select" aria-label="Acquisition mode" value={form.acqMode} onChange={set('acqMode')}>
              <option value="">preset (PERIODIC)</option>
              {(contract?.acquisitionModes ?? ['PERIODIC', 'RBE', 'SAMPLE_HOLD']).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          {NUMBERS.map(n => (
            <label key={n.key} className="cpm-field cpm-reg-field">
              <span className="ui-field__label">{n.label}</span>
              <input className={`cpm-input${num(form[n.key]) === null ? ' cpm-input--error' : ''}`} aria-label={n.label} value={form[n.key]} onChange={set(n.key)} inputMode="decimal" placeholder="undeclared" />
            </label>
          ))}
        </Grid>
        {badNumber && <span className="cpm-field__error">Acquisition values must be numbers (blank = undeclared).</span>}
      </Part>
    </>
  );
};
