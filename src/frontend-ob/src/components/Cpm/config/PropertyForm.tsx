/**
 * v2.5 Task 3D.1 (spec §5.7): one catalogue property of a draft - definition, unit, the effective
 * value and the layer it comes from, the inherited value below this scope, "Commissioning required"
 * when the catalogue has no starting value, bounds, change class, dependencies, the build's reason
 * when no running job reads it, and the draft's validation errors for it. Typed inputs from the
 * catalogue; an array is replaced whole; Reset removes this scope's override. Nothing here decides:
 * every op goes to the server as a requested change and the recorded draft renders back.
 */
import React, { useMemo, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { TonePill } from '../shared';
import type { CatalogueEntry, ConfigLayer, PatchOp } from '../../../api/cpm/config';
import { RESET_TO_INHERITED } from '../../../api/cpm/config';
import { parseInput, valueText } from './configSupport';

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
        <span className="cpm-mono cpm-config-property__name">{entry.property}</span>
        <span className="cpm-config-property__meta">{entry.id} · {entry.type} · {entry.unit || 'unitless'}</span>
        <TonePill tone={entry.changeClass === 'DEPLOYMENT' ? 'bad' : entry.changeClass === 'STATE_BOUNDARY' ? 'warn' : 'muted'}>{entry.changeClass}</TonePill>
        {commissioning && <TonePill tone="bad">Commissioning required</TonePill>}
        {locked && <TonePill tone="muted">not read by this build</TonePill>}
      </div>
      <p className="cpm-copy">{entry.effect}</p>
      <dl className="cpm-config-property__values">
        <dt>effective</dt>
        <dd className="cpm-mono" data-testid="effective-value">{valueText(effective)}{source ? <span className="cpm-config-property__source"> from {source}</span> : null}</dd>
        <dt>inherited</dt>
        <dd className="cpm-mono">{inherited.from ? `${valueText(inherited.value)} from ${inherited.from}` : 'NO_VALUE'}</dd>
        {entry.default !== null && <><dt>catalogue start</dt><dd className="cpm-mono">{valueText(entry.default)}</dd></>}
        {(bounds.minimum !== undefined || bounds.maximum !== undefined) && (
          <><dt>bounds</dt><dd className="cpm-mono">{bounds.minimum !== undefined ? `≥ ${valueText(bounds.minimum)}` : ''} {bounds.maximum !== undefined ? `≤ ${valueText(bounds.maximum)}` : ''}</dd></>
        )}
        {entry.dependencies.length > 0 && <><dt>depends on</dt><dd className="cpm-mono">{entry.dependencies.join(', ')}</dd></>}
        <dt>read by</dt><dd className="cpm-mono">{entry.consumers.join(', ')}</dd>
      </dl>
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
          {/* CHG-098 (SME review 2 #29): a disabled action says why on hover (a wrapping span: ObcButton takes no title) */}
          <span title={text === '' ? 'Enter or choose a value first' : undefined}>
            <ObcButton variant="raised" disabled={pending || text === ''} onClick={submit}>Set</ObcButton>
          </span>
          <span title={!overridden ? 'Already inherited: this level sets no value of its own' : undefined}>
            <ObcButton variant="flat" disabled={pending || !overridden} onClick={() => onOp({ op: 'reset', property: entry.property })}>Reset to inherited</ObcButton>
          </span>
          {error && <span className="cpm-field__error" role="alert" data-testid="input-error">{error}</span>}
        </div>
      )}
    </div>
  );
};
