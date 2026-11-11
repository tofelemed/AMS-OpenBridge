/**
 * CHG-168 (owner review, the approved sample, badge 12): the loop editor's building blocks. A part is a short title with its help
 * behind a ? (it replaced the paragraphs) and the fields under it in one grid; a field's label is in sentence case ("Loop tag *",
 * it was "LOOP TAG *") and names its control, with any note or error under it. The editor's fields stay 40 px.
 */
import React from 'react';

export const Part: React.FC<{
  title: string;
  /** The part's help: a ? Toggletip beside the title. */
  help?: React.ReactNode;
  /** Something that belongs to the whole part, at the title's end (a badge, Enter manually). */
  end?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, help, end, children }) => (
  <section className="cpm-reg-part" aria-label={title}>
    <div className="cpm-title-row cpm-reg-part__head">
      <h3 className="cpm-reg-part__title">{title}</h3>
      {help}
      {end}
    </div>
    {children}
  </section>
);

export const Field: React.FC<{
  id: string;
  label: string;
  /** A ? beside the label, outside it, so the label still names only its control. */
  help?: React.ReactNode;
  children: React.ReactNode;
  /** Notes and errors under the control. */
  note?: React.ReactNode;
}> = ({ id, label, help, children, note }) => (
  <div className="cpm-field cpm-reg-field">
    <span className="cpm-title-row"><label className="ui-field__label" htmlFor={id}>{label}</label>{help}</span>
    {children}
    {note}
  </div>
);

/** The grid a part's fields sit in: three to a row in the dialog, one on a phone. */
export const Grid: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="cpm-reg-form-grid">{children}</div>;
