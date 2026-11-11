/**
 * Loop Registry rows (CHG-147): Loop (the tag, the service under it without the repeated tag), Loop type and VP; a badge only
 * on a Not monitored or Retired row. CHG-168 (owner review): the badge is the state's glyph and word, muted ("○ Not monitored",
 * "⊘ Retired"); the selected loop's row is marked; a row still links to its loop (`?loop=`), so Back returns to the list and a
 * row opens in a new tab. Two-line rows and type as before.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { TonePill } from '../shared';
import { serviceName } from '../loopName';
import { vpCellLabel } from '../optionalInputs';
import { abnormalPill } from '../registryGap';

export const RegistryList: React.FC<{
  rows: CpmLoop[];
  selectedId: string;
  hrefFor: (loopId: string) => string;
  onOpen: (loopId: string) => void;
}> = ({ rows, selectedId, hrefFor, onOpen }) => (
  <table className="cpm-table cpm-reg-table">
    <thead><tr><th>Loop</th><th>Loop type</th><th>VP</th></tr></thead>
    <tbody>
      {rows.map(loop => {
        const selected = loop.loopId.toLowerCase() === selectedId.toLowerCase();
        const pill = abnormalPill(loop);
        return (
          <tr key={loop.loopId} className={`cpm-reg-row${selected ? ' cpm-reg-row--selected' : ''}`}
            aria-current={selected ? 'true' : undefined} onClick={() => onOpen(loop.loopId)}>
            <td>
              <Link to={hrefFor(loop.loopId)} className="cpm-reg-link" onClick={e => e.stopPropagation()}><strong>{loop.loopId}</strong></Link>
              {pill && <> <TonePill tone={pill.tone} glyph={pill.glyph}>{pill.label}</TonePill></>}
              <div className="cpm-event-row__sub">{serviceName(loop)}</div>
            </td>
            <td>{loop.loopType}</td>
            <td>{vpCellLabel(loop)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

export default RegistryList;
