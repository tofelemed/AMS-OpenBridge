/**
 * CHG-169 (owner review, the approved sample): Workers - opened from the foot of a loop's Effective list ("Workers ✓ 5 of 5
 * applied · one jar · catalogue matches"). It holds what the Worker alignment tile, the APPLY acknowledgements disclosure and
 * the loop's Technical details held: each job and what it applied (an observer reads no property and never answers), then the
 * build identifiers, short and copyable. A Jar or Catalogue column returns only when a worker differs; an acknowledgement for
 * another hash shows that hash.
 */
import React from 'react';
import type { ConfigCatalogue, EffectiveConfig } from '../../../api/cpm/config';
import { TonePill } from '../shared';
import { shortHash } from './configSupport';
import { classWord, stampZoned } from './configWords';
import { DetailRows, DetailsDialog, type DetailRow } from './DetailsDialog';

export function workerBuildRows(eff: EffectiveConfig, catalogue: ConfigCatalogue | undefined): DetailRow[] {
  const jars = [...new Set(eff.workers.map(w => w.jarSha256))];
  const b = eff.bundle;
  return [
    ...(b ? [
      { label: 'Bundle', value: `${b.scopeKind} v${b.version} · ${classWord(b.changeClass).label} · effective ${stampZoned(b.effectiveFrom)}` },
      { label: 'Bundle hash', copy: b.contentHash },
    ] : []),
    { label: 'Catalogue hash', copy: catalogue?.catalogueHash ?? b?.catalogueHash ?? null },
    ...(catalogue ? [{ label: 'Catalogue properties', value: catalogue.count }, { label: 'Workers announced', value: catalogue.workers.length }] : []),
    ...jars.map((j, i) => ({ label: jars.length === 1 ? 'Worker jar' : `Worker jar ${i + 1}`, copy: j })),
  ];
}

export const WorkersDialog: React.FC<{ eff: EffectiveConfig; catalogue: ConfigCatalogue | undefined; open: boolean; onClose: () => void }> = ({ eff, catalogue, open, onClose }) => {
  const jarsDiffer = new Set(eff.workers.map(w => w.jarSha256)).size > 1;
  const reference = eff.bundle?.catalogueHash ?? catalogue?.catalogueHash;
  const catalogueDiffers = eff.workers.some(w => w.catalogueHash !== reference);
  return (
    <DetailsDialog title="Workers" open={open} onClose={onClose}>
      <section className="cpm-config-part" aria-label="APPLY acknowledgements">
        <h3 className="cpm-howto__title">APPLY acknowledgements</h3>
        <table className="cpm-table" data-table="effective-workers">
          <thead><tr><th>Job</th>{jarsDiffer && <th>Jar</th>}{catalogueDiffers && <th>Catalogue</th>}<th>Applied</th></tr></thead>
          <tbody>
            {eff.workers.map(w => (
              <tr key={w.jobName}>
                <td>{w.jobName}</td>
                {jarsDiffer && <td className="cpm-mono">{shortHash(w.jarSha256, 8)}</td>}
                {catalogueDiffers && <td className="cpm-mono">{shortHash(w.catalogueHash, 8)}</td>}
                <td>
                  {w.required === false ? <span className="cpm-muted">observer · reads no property</span>
                    : w.ack ? <>
                      <TonePill tone={w.ack.status === 'ACK' ? 'good' : 'bad'} glyph={w.ack.status === 'ACK' ? '✓' : '✕'}>{w.ack.status}</TonePill>
                      {w.ack.bundleHash !== eff.bundle?.contentHash && <span className="cpm-mono"> {shortHash(w.ack.bundleHash, 8)}</span>}
                    </>
                    : eff.bundle ? <TonePill tone="muted">no ACK recorded</TonePill> : <span className="cpm-muted">factory layer</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="cpm-config-part" aria-label="Build">
        <h3 className="cpm-howto__title">Build</h3>
        <DetailRows rows={workerBuildRows(eff, catalogue)} />
      </section>
    </DetailsDialog>
  );
};

export default WorkersDialog;
