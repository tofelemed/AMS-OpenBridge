/**
 * v2.5 Task 3D.1 (spec §5.7): what the draft changes and what it touches - the resolved diff
 * against the parent version (or the factory layer for a first draft), each property's change
 * class from the catalogue, the bundle's effective change class (promoted through dependants by
 * the server), the loops the scope covers, and the validation report. A DEPLOYMENT class is
 * stated as needing a build, not a bundle.
 */
import React, { useMemo } from 'react';
import { KvRow, PanelHead, TonePill } from '../shared';
import type { Bundle, CatalogueEntry } from '../../../api/cpm/config';
import { diffProperties, valueText } from './configSupport';

export const DiffImpactPanel: React.FC<{
  bundle: Bundle;
  parent: Bundle | undefined;
  catalogue: Map<string, CatalogueEntry>;
  siteLoopCount: number | undefined;
}> = ({ bundle, parent, catalogue, siteLoopCount }) => {
  const diff = useMemo(() => {
    const before = parent?.resolved.properties ?? (bundle.layers.find(l => l.kind === 'FACTORY')?.content ?? {});
    return diffProperties(before, bundle.resolved.properties);
  }, [parent, bundle.layers, bundle.resolved.properties]);
  const v = bundle.validation;
  const affected = bundle.scopeKind === 'LOOP' ? `1 loop (${bundle.scopeRef})`
    : bundle.scopeKind === 'PROFILE' ? `every loop of ${bundle.site} whose class pack is ${bundle.scopeRef} and that has no LOOP bundle`
    : `every loop of ${bundle.site} without a PROFILE or LOOP bundle${siteLoopCount != null ? ` (site has ${siteLoopCount} registered loops)` : ''}`;
  return (
    <section className="cpm-surface" data-testid="diff-impact">
      <PanelHead eyebrow="Diff & impact" title={`${diff.length} propert${diff.length === 1 ? 'y' : 'ies'} differ from ${parent ? `v${parent.version}` : 'the factory layer'}`}
        right={<TonePill tone={bundle.changeClass === 'DEPLOYMENT' ? 'bad' : bundle.changeClass === 'STATE_BOUNDARY' ? 'warn' : 'muted'}>{bundle.changeClass}</TonePill>} />
      <KvRow label="affects">{affected}</KvRow>
      <KvRow label="rollout">the whole scope switches at the effective time in one deployment; a phased rollout with stop criteria is not part of this build</KvRow>
      {bundle.changeClass === 'STATE_BOUNDARY' && <p className="cpm-copy">A STATE_BOUNDARY change opens a new epoch: windows whose support began before the effective time report WAITING (warm-up) instead of a mixed result.</p>}
      {bundle.changeClass === 'DEPLOYMENT' && <p className="cpm-field__error" role="alert">A DEPLOYMENT-class change ships in a build; the workers refuse it as a bundle.</p>}
      {diff.length > 0 && (
        <table className="cpm-table" data-table="diff">
          <thead><tr><th>property</th><th>before</th><th>after</th><th>class</th></tr></thead>
          <tbody>
            {diff.map(d => {
              const e = catalogue.get(d.property);
              return (
                <tr key={d.property}>
                  <td className="cpm-mono">{d.property}</td><td className="cpm-mono">{valueText(d.before)}</td><td className="cpm-mono">{valueText(d.after)}</td>
                  <td><TonePill tone={e?.changeClass === 'DEPLOYMENT' ? 'bad' : e?.changeClass === 'STATE_BOUNDARY' ? 'warn' : 'muted'}>{e?.changeClass ?? '?'}</TonePill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {v ? (
        <>
          <PanelHead eyebrow="Validation" title={v.errors.length === 0 ? 'No errors' : `${v.errors.length} error(s)`} right={<TonePill tone={v.errors.length === 0 ? 'good' : 'bad'}>{v.errors.length === 0 ? 'VALID' : 'REJECTED'}</TonePill>} />
          {v.errors.map(e => <p key={e} className="cpm-field__error" role="alert">{e}</p>)}
          {v.warnings.map(w => <p key={w} className="cpm-copy">{w}</p>)}
          {Object.keys(v.notReadByBuild ?? {}).length > 0 && (
            <p className="cpm-copy">{Object.keys(v.notReadByBuild).length} propert{Object.keys(v.notReadByBuild).length === 1 ? 'y' : 'ies'} in this bundle are read by no running job (declared by the build); they are accepted and stated, not applied.</p>
          )}
        </>
      ) : (
        <p className="cpm-copy">Not validated yet.</p>
      )}
    </section>
  );
};
