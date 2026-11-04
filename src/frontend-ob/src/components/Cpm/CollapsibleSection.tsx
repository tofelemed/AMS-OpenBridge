/**
 * SME review #13 (CHG-050): a long evidence block behind a header that says what is inside it in one
 * line — an accordion on a CPM surface, with the summary under the header while it is closed. The
 * content renders only while open (a collapsed chart costs nothing), and the open / closed choice is
 * remembered per section in this browser, so an engineer who always reads a section keeps it open.
 */
import React, { useState } from 'react';
import { Accordion } from '../../ui/forms/Accordion';

const KEY = (id: string) => `ams-cpm-section:${id}`;

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === null ? fallback : v === 'true';
  } catch { return fallback; }
}

export const CollapsibleSection: React.FC<{
  /** Stable id: the remembered state is keyed on it. */
  id: string;
  title: string;
  /** One line that tells the reader what is inside without opening it. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ id, title, summary, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  return (
    <section className="cpm-surface cpm-collapsible" data-section={id}>
      <Accordion label={title} open={open}
        onToggle={next => {
          setOpen(next);
          try { localStorage.setItem(KEY(id), String(next)); } catch { /* private mode: the page still works */ }
        }}>
        <div className="cpm-collapsible__body">{open ? children : null}</div>
      </Accordion>
      {!open && summary && <p className="cpm-collapsible__summary">{summary}</p>}
    </section>
  );
};

export default CollapsibleSection;
