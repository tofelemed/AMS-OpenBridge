/**
 * 2026-09-17 audit F18: the properties of one gate as a table - name · effective value · the layer it
 * comes from · change class · flags (commissioning required, not read by this build, invalid) - with
 * one row expanded at a time into the editor (PropertyForm: definition, inherited, bounds, read-by,
 * set / reset). A wall of every property fully expanded was unreadable at 165 properties.
 */
import React, { useState } from 'react';
import { TonePill } from '../shared';
import type { Bundle, CatalogueEntry, PatchOp } from '../../../api/cpm/config';
import { PropertyForm } from './PropertyForm';
import { valueText } from './configSupport';

export interface PropertyTableProps {
  entries: CatalogueEntry[];
  bundle: Bundle;
  editable: boolean;
  pending: boolean;
  onOp: (op: PatchOp) => void;
}

const errorsFor = (bundle: Bundle, property: string): string[] =>
  (bundle.validation?.errors ?? []).filter(e => e.includes(`'${property}'`) || e.includes(property + ' '));

export const PropertyTable: React.FC<PropertyTableProps> = ({ entries, bundle, editable, pending, onOp }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (entries.length === 0) return <p className="cpm-copy">The catalogue has no property for this gate.</p>;
  return (
    <div className="cpm-config-table__wrap">
      <table className="cpm-table cpm-config-table" aria-label="Properties">
        <thead>
          <tr><th>property</th><th>effective</th><th>from</th><th>class</th><th>flags</th></tr>
        </thead>
        <tbody>
          {entries.map(p => {
            const errors = errorsFor(bundle, p.property);
            const effective = bundle.resolved.properties[p.property];
            const source = bundle.resolved.sources[p.property];
            const open = expanded === p.property;
            const commissioning = p.commissioningRequired && (effective === null || effective === undefined);
            const editorId = `prop-editor-${p.property.replace(/\W/g, '-')}`;
            return (
              <React.Fragment key={p.property}>
                <tr data-property={p.property} data-invalid={errors.length > 0 || undefined} data-expanded={open || undefined} className={errors.length ? 'cpm-config-row--invalid' : undefined}>
                  <td>
                    <button type="button" className="cpm-config-table__name" aria-expanded={open} aria-controls={editorId} onClick={() => setExpanded(open ? null : p.property)}>
                      <span className="cpm-mono">{p.property}</span>
                      <span className="cpm-config-property__meta">{p.id} · {p.unit || p.type}</span>
                    </button>
                  </td>
                  <td className="cpm-mono">{valueText(effective)}</td>
                  <td className="cpm-mono">{source ?? '—'}</td>
                  <td><TonePill tone={p.changeClass === 'DEPLOYMENT' ? 'bad' : p.changeClass === 'STATE_BOUNDARY' ? 'warn' : 'muted'}>{p.changeClass}</TonePill></td>
                  <td className="cpm-config-table__flags">
                    {commissioning && <TonePill tone="bad">Commissioning required</TonePill>}
                    {p.notReadByBuild != null && <TonePill tone="muted">not read by this build</TonePill>}
                    {errors.length > 0 && <TonePill tone="bad">invalid</TonePill>}
                  </td>
                </tr>
                {open && (
                  <tr className="cpm-config-table__editor" id={editorId}>
                    <td colSpan={5}>
                      <PropertyForm entry={p} layers={bundle.layers} scopeKind={bundle.scopeKind} effective={effective} source={source}
                        errors={errors} editable={editable} pending={pending} onOp={onOp} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
