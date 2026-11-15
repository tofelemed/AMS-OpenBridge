/**
 * CHG-201: the Loop detail page's card. A panel (the redesigned pages' panel: 12 px radius, 20 px padding, the quiet border) with
 * its 18 px title, an optional ? beside it and an optional pill at the head's end; `Fact` rows are even label / value pairs, the
 * value left-aligned as the approved mockup draws them.
 */
import React, { useId } from 'react';

export const Section: React.FC<{
  title: string;
  help?: React.ReactNode;
  end?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, help, end, wide, children }) => {
  const id = useId();
  return (
    <section className={`cpm-surface cpm-reg-section${wide ? ' cpm-reg-section--wide' : ''}`} aria-labelledby={id}>
      <div className="cpm-reg-section__head">
        <h2 id={id} className="cpm-reg-section__title">{title}</h2>
        {help}
        {end && <span className="cpm-reg-section__end">{end}</span>}
      </div>
      {children}
    </section>
  );
};

/** One label / value row. */
export const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="cpm-reg-kv">
    <span className="cpm-reg-kv__label">{label}</span>
    <span className="cpm-reg-kv__value">{children}</span>
  </div>
);

/** A muted line under a card's rows. */
export const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="cpm-reg-note">{children}</p>;
