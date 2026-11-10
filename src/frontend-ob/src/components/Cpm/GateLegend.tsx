/**
 * SME review #16 (CHG-052): the key to the gate marks, shown once under every gate strip and above the
 * Performance matrix — so a symbol never has to be guessed or a gate opened to learn what it means.
 * CHG-098 (SME review 2 #24): grouped — checks, window, symptoms, result, no result — so a failed check, symptom
 * evidence, an exclusion and "no evaluation" are told apart by group and word as well as by symbol.
 * CHG-158 (owner review): no key is printed on a page; GateKeyButton opens it in a dialog.
 */
import React, { useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';
import { GATE_LEGEND } from './gateStatus';

const GROUPS = [...new Set(GATE_LEGEND.map(l => l.group))];

const Item: React.FC<{ entry: (typeof GATE_LEGEND)[number] }> = ({ entry }) => (
  <span className="cpm-gate-legend__item">
    <span className={`cpm-gate-legend__glyph cpm-matrix__cell--${entry.tone}`} aria-hidden data-mark={entry.meaning}>{entry.glyph}</span>
    {entry.text}
  </span>
);

export const GateLegend: React.FC<{ className?: string }> = ({ className }) => {
  // CHG-156: the full key is a list of terms (the group) and their marks, laid out as two aligned columns
  return (
    <div role="note" aria-label="Gate symbols">
      <dl className={`cpm-gate-legend cpm-gate-legend--key${className ? ` ${className}` : ''}`}>
        {GROUPS.map(group => (
          <div key={group} className="cpm-gate-legend__row">
            <dt className="cpm-gate-legend__group-label">{group}</dt>
            <dd className="cpm-gate-legend__marks">
              {GATE_LEGEND.filter(l => l.group === group).map(l => <Item key={l.meaning} entry={l} />)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

/** The key behind one button, for a page that shows gate marks. */
export const GateKeyButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ObcButton variant="flat" onClick={() => setOpen(true)}>Gate key</ObcButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Gate status key"><GateLegend /></Dialog>
    </>
  );
};

export default GateLegend;
