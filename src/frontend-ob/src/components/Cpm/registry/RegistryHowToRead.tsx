'use client';

/**
 * CHG-168 (owner review, answer 1): "How to read" for Loop Registry, top right beside Bulk import and Add loop. It holds what
 * the title's ? and the configuration limits' ? said, in three titled parts, State, VP and Readiness, each a key in two aligned
 * columns: a pill (tone + glyph + word) or a term beside what it means. The limits' sentences come from the fleet summary the
 * page already reads (no new request); the plant facts show only when the summary has some.
 */
import React from 'react';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';
import { peersCopy, plantFactsCopy, positionerCopy } from '../overview/capabilityCopy';

type Term = { pill: [tone: CpmTone, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows: Array<[Term, string]> }

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
const FACTS_PREFIX = 'Plant facts, nothing to fix: ';

function partsOf(summary: CpmFleetSummary | undefined): Part[] {
  // The meaning of each limit, so always the gap's sentence (a count of 0 would turn it into "every loop … does").
  const facts = summary ? plantFactsCopy(summary.capability) : null;
  return [
    { title: 'State', rows: [
      [{ pill: ['good', '✓', 'Active'] }, 'Monitored, with every input it is expected to have.'],
      [{ pill: ['warn', '!', 'Degraded'] }, 'Monitored, but an expected input is missing: a VP tag or peer links. Nearly every loop has one, so it is a filter, not a row badge.'],
      [{ pill: ['muted', '○', 'Not monitored'] }, 'Registered without monitoring: no results are produced.'],
      [{ pill: ['muted', '⊘', 'Retired'] }, 'The loop stopped being monitored. Its history stays, and Restore brings it back.'],
    ] },
    { title: 'VP', rows: [
      [{ term: 'Mapped' }, 'A valve-position tag is mapped.'],
      [{ term: 'Not mapped' }, 'A valve position is expected, and no tag is mapped: a valve cause stops at suspected (G14).'],
      [{ term: 'No VP' }, 'The loop has no valve position: not installed, or not applicable (a drive or a direct action).'],
    ] },
    { title: 'Readiness', rows: [
      [{ term: 'A loop is only as good as its signal mappings' }, 'The readiness lists exactly what is missing; Edit configuration shows it again after saving.'],
      [{ term: 'VP expected, not mapped' }, sentence(positionerCopy(1).sub)],
      [{ term: 'Peer links expected, missing' }, sentence(peersCopy(1).sub)],
      ...(facts ? [[{ term: 'Plant facts, nothing to fix' }, facts.replace(FACTS_PREFIX, '')] as [Term, string]] : []),
    ] },
  ];
}

export const RegistryHowToRead: React.FC<{ open: boolean; onClose: () => void; summary: CpmFleetSummary | undefined }> = ({ open, onClose, summary }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {partsOf(summary).map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          <dl className="cpm-howto__key">
            {part.rows.map(([t, meaning]) => (
              <div key={meaning} className="cpm-howto__row">
                <dt>{'pill' in t ? <TonePill tone={t.pill[0]} glyph={t.pill[1]}>{t.pill[2]}</TonePill> : t.term}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  </Dialog>
);

export default RegistryHowToRead;
