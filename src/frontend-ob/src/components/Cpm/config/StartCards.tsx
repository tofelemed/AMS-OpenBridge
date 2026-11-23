/** The four cards of the Gate Configuration start page: a title with its ?, one status line, one button. */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Toggletip } from '../../../ui/Toggletip';
import { Dialog } from '../../../ui/Dialog';

export interface CardSpec { id: string; title: string; hint: string; now: string; action: string; onAction: () => void }

export const StartCards: React.FC<{ cards: CardSpec[] }> = ({ cards }) => (
  <ul className="cpm-config-cards" aria-label="Where to start">
    {cards.map(c => (
      <li key={c.id} className="cpm-surface cpm-config-card">
        <h2 className="cpm-config-card__title">{c.title}<Toggletip variant="how-to" label={c.title}><p>{c.hint}</p></Toggletip></h2>
        <p className="cpm-config-card__now">{c.now}</p>
        <ObcButton variant="normal" onClick={c.onAction}>{c.action}</ObcButton>
      </li>
    ))}
  </ul>
);

/** A short list to pick from (the loop types present, or the plants), one button each. */
export const ChoiceDialog: React.FC<{
  title: string; options: Array<{ value: string; label: string }>; onPick: (value: string) => void; onClose: () => void;
}> = ({ title, options, onPick, onClose }) => (
  <Dialog open title={title} onClose={onClose} footer={<ObcButton variant="flat" onClick={onClose}>Cancel</ObcButton>}>
    <div className="cpm-config-choices">
      {options.map(o => <ObcButton key={o.value} variant="normal" onClick={() => onPick(o.value)}>{o.label}</ObcButton>)}
      {options.length === 0 && <p className="cpm-copy">Nothing to choose yet.</p>}
    </div>
  </Dialog>
);
