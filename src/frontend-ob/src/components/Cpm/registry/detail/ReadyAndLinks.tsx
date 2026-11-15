/**
 * CHG-201 (owner-approved mockup, 15 Nov 2026): the Loop detail page's Ready for analysis and Linked loops cards.
 * Ready for analysis: the checklist from the one shared rule (readinessRules, the list column's too), ✓ in the neutral tone and !
 * in amber (owner Q3: no green for a normal state), each missing item with why it matters and how to fix it; the count's pill at
 * the head's end. Linked loops: each link said from this loop's side, the other loop a link to its page (the list's address kept);
 * an empty card says what to do, and a stand-alone loop that none are expected.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmLoop } from '../../../../api/cpmApi';
import { peerApplicabilityOf } from '../../optionalInputs';
import { relationWord } from '../loopWords';
import type { LoopReadiness } from '../readinessRules';
import { readinessPill } from '../readinessRules';
import { WordPill } from '../WordPill';
import { Section } from './Section';

export const ReadySection: React.FC<{ readiness: LoopReadiness }> = ({ readiness }) => (
  <Section title="Ready for analysis" end={<WordPill word={readinessPill(readiness.missing)} />}>
    <ul className="cpm-reg-checklist">
      {readiness.items.map(item => (
        <li key={item.key} className="cpm-reg-checklist__item">
          <span className={`cpm-reg-checklist__mark cpm-reg-checklist__mark--${item.ok ? 'ok' : 'warn'}`} aria-hidden>{item.ok ? '✓' : '!'}</span>
          <span>
            <span className="ui-sr">{item.ok ? 'Done: ' : 'To set: '}</span>
            {item.title}
            {item.why && <span className="cpm-reg-checklist__why">{item.why}</span>}
          </span>
        </li>
      ))}
    </ul>
  </Section>
);

export const LinksSection: React.FC<{ loop: CpmLoop; hrefFor: (loopId: string) => string }> = ({ loop, hrefFor }) => {
  const standAlone = peerApplicabilityOf(loop) !== 'EXPECTED';
  return (
    <Section title="Linked loops">
      {loop.links.length > 0 ? (
        <ul className="cpm-reg-links">
          {loop.links.map(l => (
            <li key={`${l.relType}-${l.toLoopId}`} className="cpm-reg-links__row">
              {relationWord(l.relType)} <Link className="cpm-link" to={hrefFor(l.toLoopId)}>{l.toLoopId}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cpm-reg-empty">
          {standAlone
            ? 'A stand-alone loop: no linked loops are expected.'
            : 'No linked loops yet. Link the loops this one affects, or is affected by, in the plant model, then use Resend to analysis.'}
        </p>
      )}
    </Section>
  );
};
