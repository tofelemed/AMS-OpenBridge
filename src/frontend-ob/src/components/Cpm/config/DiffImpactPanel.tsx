/**
 * The Check step of a change: what the version changes (Setting · Now · New), the result of the check, and how many loops it
 * reaches. Now = the parent version's value, or the value the loop would run without this level (owner answer 2d); New = this
 * version's. Check sits here, its reason under it when disabled. Journey redesign: setting names in words (the code in the
 * title), no explanatory sentences, no change-class column. Final review M-a: the button says the step's word (Check).
 */
import React, { useMemo } from 'react';
import { KvRow } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';
import { diffProperties, resolveBelow } from './configSupport';
import { changeNames, editableChanges, valueWords } from './configWords';
import { errorText } from './lifecycle';

export interface ValidateAction { enabled: boolean; reason: string | null; busy: boolean; error: unknown; onValidate: () => void }

export const DiffImpactPanel: React.FC<{
  bundle: Bundle;
  parent: Bundle | undefined;
  /** The loops this version reaches; a loop's own version reaches 1. */
  loopCount?: number | undefined;
  validate: ValidateAction;
  /** The catalogue: a setting it marks as not editable here (the server drops it) is not listed as a change. */
  entries?: CatalogueEntry[] | null | undefined;
}> = ({ bundle, parent, loopCount, validate, entries }) => {
  const diff = useMemo(() => {
    const before = parent?.resolved.properties ?? resolveBelow(bundle.layers, bundle.scopeKind);
    return editableChanges(diffProperties(before, bundle.resolved.properties), entries);
  }, [parent, bundle.layers, bundle.scopeKind, bundle.resolved.properties, entries]);
  const names = useMemo(() => changeNames(diff.map(d => d.property)), [diff]);
  const v = bundle.validation;
  const loops = bundle.scopeKind === 'LOOP' ? 1 : loopCount;
  const failed = errorText(validate.error);
  return (
    <section className="cpm-config-tabpanel" data-testid="diff-impact">
      {diff.length > 0 ? (
        <div className="cpm-config-table__wrap">
          <table className="cpm-table cpm-config-diff" data-table="diff">
            <thead><tr><th>Setting</th><th>Now</th><th>New</th></tr></thead>
            <tbody>
              {diff.map(d => (
                <tr key={d.property}>
                  <td title={d.property}>{names.get(d.property)}</td>
                  <td>{valueWords(d.before)}</td>
                  <td>{valueWords(d.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="cpm-copy">Nothing changed yet.</p>}
      <KvRow label="Check">
        {!v ? 'Not checked yet' : v.errors.length === 0 ? '✓ Valid' : `${v.errors.length} ${v.errors.length === 1 ? 'error' : 'errors'}`}
      </KvRow>
      {v?.errors.map(e => <p key={e} className="cpm-field__error" role="alert">{e}</p>)}
      {v?.warnings.map(w => <p key={w} className="cpm-copy">{w}</p>)}
      <KvRow label="Loops">{loops ?? '—'}</KvRow>
      <div className="cpm-config-actions">
        <ReasonedButton variant={validate.enabled ? 'raised' : 'normal'} disabled={!validate.enabled || validate.busy} reason={validate.reason} onClick={validate.onValidate}>
          {validate.busy ? 'Checking…' : 'Check'}
        </ReasonedButton>
        {failed && <span className="cpm-field__error" role="alert">{failed}</span>}
      </div>
    </section>
  );
};
