/**
 * Loop Registry rows. CHG-201 (owner-approved mockup docs/theme/redesign/samples/loop-detail-proposal.html, 15 Nov 2026): one
 * full-width table (ui/DataTable). Loop: the tag, bold, with the description under it without the tag ("Flow controller ·
 * FCS0101") and the Not monitored / Retired pill beside it (CHG-168); Type in a word (CHG-200: "Unknown type"); Plant unit by its
 * asset-model name, never the slug; Valve position (its words behind the ? in the head); Ready for analysis from the one shared
 * rule (readinessRules); a ›. The whole row opens the loop's page by click or Enter; the tag stays a real link (a new tab, Back)
 * without a second tab stop.
 * CHG-203 (task-18 concern 6): below 820 px the head row is hidden and each loop is a card, so the Valve position cell carries
 * its own label with the ? (shown only there, in place of the generated column name); one ? per card, as the brief asked.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmLoop } from '../../../api/cpmApi';
import { DataTable, type Column } from '../../../ui/DataTable';
import { Toggletip } from '../../../ui/Toggletip';
import { TonePill } from '../shared';
import { abnormalPill } from '../registryGap';
import { describeLoop, placeOf, vpWord, type PlantLocations } from './loopFacts';
import { loopTypeWord } from './loopWords';
import { loopReadiness, readinessPill } from './readinessRules';
import { WordPill } from './WordPill';

const VP_HELP = [
  'Connected: the valve’s position signal is read.',
  'Not connected: the valve has a position signal, but it is not connected here.',
  'Not fitted: the valve has no position signal.',
  'Not applicable: the loop drives no valve.',
];

/** "Valve position" with its ?: the column head, and (CHG-203) a card's own label at a narrow width. */
const VpLabel: React.FC<{ className: string }> = ({ className }) => (
  <span className={className}>
    Valve position
    <Toggletip variant="how-to" label="Valve position">{VP_HELP.map(t => <p key={t}>{t}</p>)}</Toggletip>
  </span>
);

export const RegistryList: React.FC<{
  rows: CpmLoop[];
  locations: PlantLocations | undefined;
  hrefFor: (loopId: string) => string;
  onOpen: (loopId: string) => void;
}> = ({ rows, locations, hrefFor, onOpen }) => {
  const columns: Array<Column<CpmLoop>> = [
    {
      key: 'loop', header: 'Loop',
      cell: loop => {
        const pill = abnormalPill(loop);
        const text = describeLoop(loop);
        return (
          <>
            <span className="cpm-reg-tagline">
              <Link to={hrefFor(loop.loopId)} className="cpm-reg-tag" tabIndex={-1} onClick={e => e.stopPropagation()}>{loop.loopId}</Link>
              {pill && <TonePill tone={pill.tone} glyph={pill.glyph}>{pill.label}</TonePill>}
            </span>
            {text && <span className="cpm-reg-desc">{text}</span>}
          </>
        );
      },
    },
    { key: 'type', header: 'Type', cell: loop => loopTypeWord(loop.loopType) },
    { key: 'unit', header: 'Plant unit', cell: loop => placeOf(locations, loop).unit ?? '—' },
    {
      key: 'vp', label: 'Valve position',
      header: <VpLabel className="cpm-title-row" />,
      cell: loop => <><VpLabel className="cpm-reg-cardlabel" /><WordPill word={vpWord(loop)} /></>,
    },
    {
      key: 'ready', header: 'Ready for analysis',
      cell: loop => (loop.isActive ? <WordPill word={readinessPill(loopReadiness(loop).missing)} /> : '—'),
    },
    { key: 'open', header: <span className="ui-sr">Open the loop</span>, cell: () => <span className="cpm-reg-chev" aria-hidden>{'›'}</span> },
  ];
  return (
    <div className="cpm-reg-list">
      <DataTable caption="Loops" columns={columns} rows={rows} rowKey={l => l.loopId} onSelect={l => onOpen(l.loopId)} />
    </div>
  );
};

export default RegistryList;
