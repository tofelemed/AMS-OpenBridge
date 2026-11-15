'use client';

/**
 * CHG-168 (owner review, answer 1): "How to read" for Loop Registry, top right beside Bulk import and Add loop, in titled parts,
 * each a key in two aligned columns: a pill (tone + glyph + word) or a term beside what it means.
 *
 * CHG-201 (owner-approved mockup, 15 Nov 2026): the parts say the list's words. State: the pills beside a tag and the Degraded
 * choice. Ready for analysis: the column's two pills and, when the fleet summary has some, the plant facts. The valve position's
 * words moved to the ? in its column head (each fact once). No gate code, no "VP": plain words only.
 */
import React from 'react';
import type { CpmFleetSummary } from '../../../api/cpmApi';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';

type Term = { pill: [tone: CpmTone, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows: Array<[Term, string]> }

/** The plant facts beside the gaps, counted from the fleet summary; null when there are none. */
function plantFacts(facts: CpmFleetSummary['capability'] | undefined): string | null {
  const parts = [
    facts?.vpNotInstalled ? `${facts.vpNotInstalled} with no valve position signal fitted` : null,
    facts?.vpNotApplicable ? `${facts.vpNotApplicable} with no valve` : null,
    facts?.peersNotApplicable ? `${facts.peersNotApplicable} stand-alone` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}.` : null;
}

function partsOf(summary: CpmFleetSummary | undefined): Part[] {
  const facts = plantFacts(summary?.capability);
  return [
    { title: 'State', rows: [
      [{ pill: ['muted', '○', 'Not monitored'] }, 'Registered, but monitoring is off: the analysis skips it.'],
      [{ pill: ['muted', '⊘', 'Retired'] }, 'No longer analysed. Its history stays, and Restore loop brings it back.'],
      [{ term: 'Degraded' }, 'Monitored, but a valve position or linked loops it should have are missing. Nearly every loop has one, so it is a choice in the list, not a pill.'],
    ] },
    { title: 'Ready for analysis', rows: [
      [{ pill: ['muted', '✓', 'Ready'] }, 'Everything the analysis needs is set.'],
      [{ pill: ['warn', '!', '2 items to set'] }, 'Something the analysis needs is missing. The loop’s page lists each item and how to set it.'],
      ...(facts ? [[{ term: 'Plant facts, nothing to fix' }, facts] as [Term, string]] : []),
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
