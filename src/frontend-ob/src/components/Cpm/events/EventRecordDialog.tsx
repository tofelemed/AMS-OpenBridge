/**
 * CHG-167 (owner review, question 5): the episode's Record details as a dialog, as on Calculations (it was the Technical details
 * disclosure at the foot of the panel). Fault family, Calculation and profile versions in one row, Support until. Resolution
 * went: the list row and the panel's foot say the window kind. Each value still copies, as it did in Technical details. The
 * family reads as the sample wrote it ("Oscillation", "Final element nonlinearity"), the engine code in words.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import type { CpmEpisode } from '../../../api/cpm/eventPage';
import { Dialog } from '../../../ui/Dialog';
import { copyText } from '../../../utils/copyText';
import { KvRow } from '../shared';
import { humanise } from '../vocabulary';
import { stamp, zoneTag } from './eventTime';

const NOT_RECORDED = 'Not recorded';
const MESSAGE_MS = 3000;
const version = (v: string | null | undefined) => (v ? (/^\d/.test(v) ? `v${v}` : v) : null);

/** The dialog's rows; a missing value reads "Not recorded" and has nothing to copy. */
export function recordRowsOf(e: CpmEpisode): Array<[label: string, value: string | null]> {
  const calc = version(e.calculation_version);
  const profile = version(e.dynamics_profile_version);
  const versions = calc && profile ? `${calc} · profile ${profile}` : calc ?? (profile ? `profile ${profile}` : null);
  const until = e.support_until ? `${stamp(e.support_until)} ${zoneTag(Date.parse(e.support_until))}` : null;
  return [['Fault family', e.family ? humanise(e.family) : null], ['Calculation', versions], ['Support until', until]];
}

const Body: React.FC<{ event: CpmEpisode; onClose: () => void }> = ({ event, onClose }) => {
  const [message, setMessage] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (label: string, text: string) => {
    const copied = await copyText(text);
    setMessage(copied ? `${label} copied` : `Copy failed: ${label}`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), MESSAGE_MS);
  };
  return (
    <Dialog open onClose={onClose} title="Record details" footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <div className="cpm-events-record">
      {recordRowsOf(event).map(([label, text]) => (
        <KvRow key={label} label={label}>
          <span>{text ?? NOT_RECORDED}</span>
          {text && (
            <button type="button" className="ui-control ui-control--ghost ui-control--icon cpm-events-copy" aria-label={`Copy ${label}`}
              onClick={() => { void copy(label, text); }}>
              <span className="ui-icon ui-icon--small"><ObiContentCopyGoogle /></span>
            </button>
          )}
        </KvRow>
      ))}
      </div>
      <p className="cpm-event-row__sub" role="status" aria-live="polite">{message}</p>
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const EventRecordDialog: React.FC<{ event: CpmEpisode; open: boolean; onClose: () => void }> = ({ event, open, onClose }) =>
  (open ? createPortal(<Body event={event} onClose={onClose} />, document.body) : null);

export default EventRecordDialog;
