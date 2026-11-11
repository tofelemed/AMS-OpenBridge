/**
 * v2.5 Task 3D.1 (spec §5.7): what the draft changes and what it touches - the resolved diff, each property's change class from
 * the catalogue, the bundle's effective change class (promoted through dependants by the server), the loops the scope covers,
 * and the validation report. A DEPLOYMENT class is stated as needing a build, not a bundle.
 * CHG-169 (owner review): the Diff & impact tab. A version with a parent is compared with that parent, as before; a version
 * without one is compared with the layers BELOW its own level (owner answer 2d), the values the loop would run without it -
 * before, the factory layer alone, so v6 (one value set) read "36 properties differ" and an empty draft read the same. Validate
 * sits here, under the validation it produces (it was in the lifecycle column), its reason under it when disabled.
 */
import React, { useMemo } from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import { ReasonedButton } from '../ReasonedButton';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';
import { diffProperties, resolveBelow } from './configSupport';
import { valueWords } from './configWords';
import { errorText } from './lifecycle';
import { Breakable, ClassWord } from './configBits';

export interface ValidateAction { enabled: boolean; reason: string | null; busy: boolean; error: unknown; onValidate: () => void }

export const DiffImpactPanel: React.FC<{
  bundle: Bundle;
  parent: Bundle | undefined;
  catalogue: Map<string, CatalogueEntry>;
  siteLoopCount: number | undefined;
  validate: ValidateAction;
}> = ({ bundle, parent, catalogue, siteLoopCount, validate }) => {
  const diff = useMemo(() => {
    const before = parent?.resolved.properties ?? resolveBelow(bundle.layers, bundle.scopeKind);
    return diffProperties(before, bundle.resolved.properties);
  }, [parent, bundle.layers, bundle.scopeKind, bundle.resolved.properties]);
  const v = bundle.validation;
  const affected = bundle.scopeKind === 'LOOP' ? `1 loop (${bundle.scopeRef})`
    : bundle.scopeKind === 'PROFILE' ? `every loop of ${bundle.site} whose class pack is ${bundle.scopeRef} and that has no LOOP bundle`
    : `every loop of ${bundle.site} without a PROFILE or LOOP bundle${siteLoopCount != null ? ` (site has ${siteLoopCount} registered loops)` : ''}`;
  const notRead = Object.keys(v?.notReadByBuild ?? {}).length;
  const failed = errorText(validate.error);
  return (
    <section className="cpm-config-tabpanel" data-testid="diff-impact">
      <PanelHead title={`${diff.length} ${diff.length === 1 ? 'property differs' : 'properties differ'} from ${parent ? `v${parent.version}` : 'the layers below'}`}
        right={<ClassWord changeClass={bundle.changeClass} />} />
      <KvRow label="Affects">{affected}</KvRow>
      <KvRow label="Rollout">the whole scope switches at the effective time in one deployment; a phased rollout with stop criteria is not part of this build</KvRow>
      {bundle.changeClass === 'STATE_BOUNDARY' && <p className="cpm-copy">A STATE_BOUNDARY change opens a new epoch: windows whose support began before the effective time report WAITING (warm-up) instead of a mixed result.</p>}
      {bundle.changeClass === 'DEPLOYMENT' && <p className="cpm-field__error" role="alert">A DEPLOYMENT-class change ships in a build; the workers refuse it as a bundle.</p>}
      {diff.length > 0 && (
        <div className="cpm-config-table__wrap">
          <table className="cpm-table cpm-config-diff" data-table="diff">
            <thead><tr><th>Property</th><th>Before</th><th>After</th><th>Class</th></tr></thead>
            <tbody>
              {diff.map(d => (
                <tr key={d.property}>
                  <td className="cpm-mono"><Breakable name={d.property} /></td>
                  <td className="cpm-mono">{valueWords(d.before)}</td>
                  <td className="cpm-mono">{valueWords(d.after)}</td>
                  <td><ClassWord changeClass={catalogue.get(d.property)?.changeClass} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {v ? (
        <>
          <PanelHead title="Validation" right={v.errors.length === 0 ? <TonePill tone="good" glyph="✓">Valid</TonePill> : <TonePill tone="bad" glyph="✕">Rejected</TonePill>} />
          <p className="cpm-copy">{v.errors.length === 0 ? 'No errors.' : `${v.errors.length} error(s)`}</p>
          {v.errors.map(e => <p key={e} className="cpm-field__error" role="alert">{e}</p>)}
          {v.warnings.map(w => <p key={w} className="cpm-copy">{w}</p>)}
          {notRead > 0 && (
            <p className="cpm-copy">{notRead} propert{notRead === 1 ? 'y' : 'ies'} in this bundle are read by no running job (declared by the build); they are accepted and stated, not applied.</p>
          )}
        </>
      ) : (
        <p className="cpm-copy">Not validated yet.</p>
      )}
      <div className="cpm-config-actions">
        <ReasonedButton variant={validate.enabled ? 'raised' : 'normal'} disabled={!validate.enabled || validate.busy} reason={validate.reason} onClick={validate.onValidate}>
          {validate.busy ? 'Validating…' : 'Validate'}
        </ReasonedButton>
        {failed && <span className="cpm-field__error" role="alert">{failed}</span>}
      </div>
    </section>
  );
};
