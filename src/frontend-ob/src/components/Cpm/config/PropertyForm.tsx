/**
 * v2.5 Task 3D.1 (spec §5.7): one catalogue property of a draft - definition, unit, the effective value and the layer it comes
 * from, the inherited value below this scope, "Commissioning required" when the catalogue has no starting value, bounds, change
 * class, dependencies, the build's reason when no running job reads it, and the draft's validation errors for it. Typed inputs
 * from the catalogue; an array is replaced whole; Reset removes this scope's override. Nothing here decides: every op goes to
 * the server as a requested change and the recorded draft renders back.
 * CHG-169 (owner review, the approved sample): the body of the selected property's panel (it was the row that expanded into
 * the editor). The panel's heading names the property and its id, so the form opens on its class and flags; values carry their
 * unit and "No value" when unset (the catalogue start read NO_VALUE when the catalogue has none); Set and Reset to inherited
 * say why under each when disabled.
 */
import React, { useMemo, useState } from 'react';
import { KvRow, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import type { CatalogueEntry, ConfigLayer, PatchOp } from '../../../api/cpm/config';
import { RESET_TO_INHERITED } from '../../../api/cpm/config';
import { isLayerSource, parseInput, valueText } from './configSupport';
import { valueWithUnit } from './configWords';
import { ClassWord } from './configBits';

const ORDER = ['FACTORY', 'SITE', 'PROFILE', 'LOOP', 'REGIME'];

/** The value the property would have without this scope's layer (the layers below it, in order). */
export function inheritedValue(layers: ConfigLayer[], scopeKind: string, property: string): { value: unknown; from: string | null } {
  let value: unknown;
  let from: string | null = null;
  for (const kind of ORDER) {
    if (kind === scopeKind) break;
    const layer = layers.find(l => l.kind === kind);
    if (!layer || !(property in layer.content)) continue;
    const v = layer.content[property];
    if (v === RESET_TO_INHERITED) continue;
    value = v;
    from = kind;
  }
  return { value, from };
}

export const PropertyForm: React.FC<{
  entry: CatalogueEntry;
  layers: ConfigLayer[];
  scopeKind: string;
  effective: unknown;
  source: string | undefined;
  errors: string[];
  editable: boolean;
  pending: boolean;
  onOp: (op: PatchOp) => void;
}> = ({ entry, layers, scopeKind, effective, source, errors, editable, pending, onOp }) => {
  const own = layers.find(l => l.kind === scopeKind)?.content ?? {};
  const overridden = entry.property in own && own[entry.property] !== RESET_TO_INHERITED;
  const inherited = useMemo(() => inheritedValue(layers, scopeKind, entry.property), [layers, scopeKind, entry.property]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const locked = entry.notReadByBuild != null;
  const commissioning = entry.commissioningRequired && (effective === null || effective === undefined);
  const bounds = !Array.isArray(entry.validation) ? (entry.validation as Record<string, unknown>) : {};
  const enumValues = Array.isArray(entry.validation) ? (entry.validation as string[]) : null;

  const submit = () => {
    const parsed = parseInput(entry, text);
    if (parsed.error) { setError(parsed.error); return; }
    setError(null);
    onOp({ op: 'set', property: entry.property, value: parsed.value });
    setText('');
  };

  return (
    <div className={`cpm-config-property${errors.length ? ' cpm-config-property--invalid' : ''}`} data-property={entry.property} data-testid="property-form">
      <div className="cpm-config-property__head">
        <ClassWord changeClass={entry.changeClass} />
        {commissioning && <TonePill tone="bad">Commissioning required</TonePill>}
        {locked && <TonePill tone="muted">not read by this build</TonePill>}
      </div>
      <p className="cpm-copy">{entry.effect}</p>
      <KvRow label="Effective">
        <span className="cpm-mono" data-testid="effective-value">{valueWithUnit(effective, entry.unit)}</span>
        <span className="cpm-config-property__source"> {isLayerSource(source) ? `from ${source}` : 'unset'}</span>
      </KvRow>
      <KvRow label="Inherited">
        {inherited.from ? <><span className="cpm-mono">{valueWithUnit(inherited.value, entry.unit)}</span><span className="cpm-config-property__source"> from {inherited.from}</span></> : 'No value'}
      </KvRow>
      <KvRow label="Catalogue start"><span className="cpm-mono">{valueWithUnit(entry.default, entry.unit)}</span></KvRow>
      {(bounds.minimum !== undefined || bounds.maximum !== undefined) && (
        <KvRow label="Bounds"><span className="cpm-mono">{bounds.minimum !== undefined ? `≥ ${valueText(bounds.minimum)}` : ''} {bounds.maximum !== undefined ? `≤ ${valueText(bounds.maximum)}` : ''}</span></KvRow>
      )}
      {entry.dependencies.length > 0 && <KvRow label="Depends on"><span className="cpm-mono">{entry.dependencies.join(', ')}</span></KvRow>}
      <KvRow label="Read by"><span className="cpm-mono">{entry.consumers.join(', ')}</span></KvRow>
      <KvRow label="Type · unit">{entry.type} · {entry.unit || 'unitless'}</KvRow>
      {locked && <p className="cpm-copy" data-testid="locked-reason">Read-only in this build: {entry.notReadByBuild}</p>}
      {errors.map(e => <p key={e} className="cpm-field__error" role="alert">{e}</p>)}
      {editable && !locked && (
        <div className="cpm-config-property__edit">
          {enumValues ? (
            <select className="cpm-select" value={text} aria-label={`${entry.property} value`} onChange={e => setText(e.target.value)}>
              <option value="">choose…</option>
              {enumValues.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : entry.type === 'boolean' ? (
            <select className="cpm-select" value={text} aria-label={`${entry.property} value`} onChange={e => setText(e.target.value)}>
              <option value="">choose…</option><option value="true">true</option><option value="false">false</option>
            </select>
          ) : (
            <input className={`cpm-input${error ? ' cpm-input--error' : ''}`} aria-label={`${entry.property} value`} value={text}
              placeholder={entry.type === 'string_array' ? 'a, b, c (replaces the whole list)' : `${entry.unit || entry.type}`}
              onChange={e => { setText(e.target.value); setError(null); }} onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
          )}
          {error && <span className="cpm-field__error" role="alert" data-testid="input-error">{error}</span>}
          {/* CHG-098 (SME review 2 #29), CHG-169: a disabled action says why, under it */}
          <div className="cpm-config-actions">
            <ReasonedButton variant="raised" disabled={pending || text === ''} reason={!pending && text === '' ? 'Enter or choose a value first' : null} onClick={submit}>Set</ReasonedButton>
            <ReasonedButton variant="normal" disabled={pending || !overridden} reason={!pending && !overridden ? 'Already inherited: this level sets no value of its own' : null}
              onClick={() => onOp({ op: 'reset', property: entry.property })}>Reset to inherited</ReasonedButton>
          </div>
        </div>
      )}
    </div>
  );
};
