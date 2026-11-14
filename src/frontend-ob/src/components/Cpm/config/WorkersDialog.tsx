/**
 * CHG-169 (owner review, the approved sample): Workers - opened from the foot of a loop's Effective list ("Workers ✓ 5 of 5
 * applied · catalogue matches"). It holds what the Worker alignment tile and the APPLY acknowledgements disclosure held: each
 * job and what it applied (an observer reads no property and never answers). CHG-184 (owner review item 0): the Build part
 * (bundle, catalogue and jar hashes) and the Jar / Catalogue hash columns went; an acknowledgement for another bundle says so in
 * words, never as a hash.
 */
import React from 'react';
import type { EffectiveConfig } from '../../../api/cpm/config';
import { TonePill } from '../shared';
import { DetailsDialog } from './DetailsDialog';

export const WorkersDialog: React.FC<{ eff: EffectiveConfig; open: boolean; onClose: () => void }> = ({ eff, open, onClose }) => (
  <DetailsDialog title="Workers" open={open} onClose={onClose}>
    <section className="cpm-config-part" aria-label="APPLY acknowledgements">
      <h3 className="cpm-howto__title">APPLY acknowledgements</h3>
      <table className="cpm-table" data-table="effective-workers">
        <thead><tr><th>Job</th><th>Applied</th></tr></thead>
        <tbody>
          {eff.workers.map(w => (
            <tr key={w.jobName}>
              <td>{w.jobName}</td>
              <td>
                {w.required === false ? <span className="cpm-muted">observer · reads no property</span>
                  : w.ack ? <>
                    <TonePill tone={w.ack.status === 'ACK' ? 'good' : 'bad'} glyph={w.ack.status === 'ACK' ? '✓' : '✕'}>{w.ack.status}</TonePill>
                    {eff.bundle && w.ack.bundleHash !== eff.bundle.contentHash && <span> for another bundle</span>}
                  </>
                  : eff.bundle ? <TonePill tone="muted">no ACK recorded</TonePill> : <span className="cpm-muted">factory layer</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </DetailsDialog>
);

export default WorkersDialog;
