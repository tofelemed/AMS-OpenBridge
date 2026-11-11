/**
 * CHG-174: Governance's Record details and Build details dialogs, one shape: titled parts of label / value rows, each value
 * copyable with the ⧉ button (the whole value, which may be longer than the one shown), the outcome announced. As Loop Events'
 * Record details (CHG-167). Rendered on the page body, so a panel's own box (or its drawer) never clips it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiContentCopyGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-content-copy-google';
import { Dialog } from '../../../ui/Dialog';
import { copyText } from '../../../utils/copyText';
import { KvRow } from '../shared';

export const NOT_RECORDED = 'Not recorded';
const MESSAGE_MS = 3000;

/** A row: its label, the value shown (null reads "Not recorded"), the value copied (none: no ⧉), and whether it is a code. */
export interface RecordRow { label: string; shown: string | null; copy?: string; mono?: boolean }
export interface RecordPart { title?: string; rows: RecordRow[] }

const Body: React.FC<{ title: string; parts: RecordPart[]; onClose: () => void; children?: React.ReactNode }> = ({ title, parts, onClose, children }) => {
  const [message, setMessage] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (label: string, text: string) => {
    setMessage(await copyText(text) ? `${label} copied` : `Copy failed: ${label}`);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), MESSAGE_MS);
  };
  const rows = (list: RecordRow[]) => list.map(r => (
    <KvRow key={r.label} label={r.label}>
      <span className={r.shown && r.mono !== false ? 'cpm-mono' : undefined}>{r.shown ?? NOT_RECORDED}</span>
      {r.copy && (
        <button type="button" className="ui-control ui-control--ghost ui-control--icon cpm-events-copy" aria-label={`Copy ${r.label.toLowerCase()}`}
          onClick={() => { void copy(r.label, r.copy as string); }}>
          <span className="ui-icon ui-icon--small"><ObiContentCopyGoogle /></span>
        </button>
      )}
    </KvRow>
  ));
  return (
    <Dialog open onClose={onClose} title={title} footer={<ObcButton variant="flat" onClick={onClose}>Close</ObcButton>}>
      <div className="cpm-events-record">
        {parts.map((part, i) => (part.title
          ? (
            <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
              <h3 className="cpm-howto__title">{part.title}</h3>
              {rows(part.rows)}
            </section>
          )
          : <React.Fragment key={i}>{rows(part.rows)}</React.Fragment>))}
        {children}
      </div>
      <p className="cpm-event-row__sub" role="status" aria-live="polite">{message}</p>
    </Dialog>
  );
};

export const RecordDialog: React.FC<{ title: string; parts: RecordPart[]; open: boolean; onClose: () => void; children?: React.ReactNode }> =
  ({ open, ...rest }) => (open ? createPortal(<Body {...rest} />, document.body) : null);

/** A hash or digest as shown: its first 12 characters (the copy takes it whole). */
export const shortHash12 = (h: string | null | undefined): string | null => (h ? (h.length > 12 ? `${h.slice(0, 12)}…` : h) : null);

export default RecordDialog;
