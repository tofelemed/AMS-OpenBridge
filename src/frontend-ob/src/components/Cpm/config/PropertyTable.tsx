/**
 * The properties of one gate as a table (2026-09-17 audit F18): name, the effective value with the layer it comes from, the
 * change class and the flags (commissioning required, invalid). CHG-184: no build wording. CHG-224: it lists only editable
 * properties (PropertiesTab filters), so there is no "not used" flag; the source reads in the page's words.
 * CHG-169 (owner review, the approved sample): a row no longer expands into the editor - it selects the property, and its
 * editor is the panel beside the list (a drawer below 1280 px). The name reads short within its gate (the full key while a
 * search crosses gates, and in the panel); the class in words under it; the value with its unit, a dash when unset.
 * Round 4: the value and its source the engine's way (shownValue), the ones Check compares.
 */
import React from 'react';
import { TonePill } from '../shared';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';
import { settingName, sourceWord, valueWithUnit } from './configWords';
import { shownValue } from './configSupport';
import { errorsFor } from './configLists';
import { ClassWord } from './configBits';

export interface PropertyTableProps {
  entries: CatalogueEntry[];
  bundle: Bundle;
  selected: string | null;
  onSelect: (property: string) => void;
}


export const PropertyTable: React.FC<PropertyTableProps> = ({ entries, bundle, selected, onSelect }) => (
  <table className="cpm-table cpm-config-rows cpm-config-props" aria-label="Settings">
    <thead><tr><th>Setting</th><th>Value · from</th><th>Flags</th></tr></thead>
    <tbody>
      {entries.map(p => {
        const errors = errorsFor(bundle.validation?.errors ?? [], p.property);
        const { value: effective, source } = shownValue(bundle, p.property);
        const commissioning = p.commissioningRequired && (effective === null || effective === undefined);
        const isSelected = p.property === selected;
        return (
          <tr key={p.property} data-property={p.property} data-invalid={errors.length > 0 || undefined} aria-current={isSelected ? 'true' : undefined}
            className={`cpm-reg-row${isSelected ? ' cpm-reg-row--selected' : ''}${errors.length ? ' cpm-config-row--invalid' : ''}`} onClick={() => onSelect(p.property)}>
            <td>
              <button type="button" className="cpm-config-rowbtn" aria-label={settingName(p.property)} title={p.property}
                onClick={e => { e.stopPropagation(); onSelect(p.property); }}>
                {settingName(p.property)}
              </button>
              <div className="cpm-event-row__sub"><ClassWord changeClass={p.changeClass} /></div>
            </td>
            <td>
              <span>{valueWithUnit(effective, p.unit)}</span>
              <div className="cpm-event-row__sub">{sourceWord(source)}</div>
            </td>
            <td>
              {/* short words in the row; the panel spells each one out. The flex sits on a wrapper: a flex <td> stops being a
                  table cell and loses the row's height, highlight and line (CHG-169 review). */}
              <div className="cpm-config-table__flags">
                {commissioning && <span title="Commissioning required: the catalogue has no starting value"><TonePill tone="bad">commissioning</TonePill></span>}
                {errors.length > 0 && <span title={errors.join(' · ')}><TonePill tone="bad">invalid</TonePill></span>}
              </div>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
