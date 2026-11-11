'use client';

/**
 * CHG-172 (owner review, the approved sample, badge 22): How to read for the open Administration tab, top right in the header.
 * It holds what the tabs' four ? said (About roles and permissions, About data sources, Onboarding stages, About tag aliases)
 * and the keys the lists use, in titled parts: a key in two aligned columns (a pill or a term beside what it means) or a sentence.
 */
import React from 'react';
import { Dialog } from '../../ui/Dialog';
import { TonePill, type CpmTone } from '../Cpm/shared';
import type { HowToKey } from './adminTabs';

type Term = { pill: [tone: CpmTone, glyph: string, word: string] } | { term: string } | { tag: string };
interface Part { title: string; rows?: Array<[Term, string]>; text?: string }

export const HOW_TO: Record<HowToKey, Part[]> = {
  users: [
    { title: 'Status', rows: [
      [{ pill: ['good', '✓', 'Active'] }, 'The account can sign in.'],
      [{ pill: ['muted', '⊘', 'Inactive'] }, 'The account cannot sign in.'],
    ] },
    { title: 'Role', text: 'One role per user. What a role allows is on Roles & permissions.' },
  ],
  roles: [
    { title: 'Type', rows: [
      [{ term: 'System' }, 'Protected: cannot be renamed or deleted; its permissions can be edited, and Reset to default restores them.'],
      [{ term: 'Custom' }, 'Made here. Delete role moves its users to another role.'],
    ] },
    { title: 'Permissions', text: 'Permissions are fixed by the product: a role is given some of them, none can be invented.' },
  ],
  sources: [
    { title: 'Data sources', text: 'OT data sources: MQTT broker connections consumed by the ingestion service.' },
    { title: 'State', rows: [
      [{ pill: ['good', '✓', 'Active'] }, 'The ingestion service subscribes to it.'],
      [{ pill: ['muted', '○', 'Off'] }, 'Kept, not subscribed.'],
    ] },
    { title: 'MODE map', rows: [
      [{ term: 'counts as AUTO' }, 'AUT, CAS'],
      [{ term: 'counts as MANUAL' }, 'MAN, IMAN'],
      [{ term: 'NOT RECOGNISED' }, 'The engine treats it as manual.'],
    ] },
  ],
  plant: [
    { title: 'Levels', text: 'Site → Area → Unit → Device → Measurement. Path segments are permanent identity; names are labels.' },
    { title: 'Marks', rows: [[{ tag: 'CPM' }, 'Managed by the CPM Loop Registry: the panel opens the loop.']] },
  ],
  aliases: [
    { title: 'Tag aliases', text: 'OT/legacy tag → canonical UNS path. Ingestion resolves incoming tag names through this table; a tag without an alias parks as unknown instead of flowing.' },
  ],
};

const termOf = (t: Term): React.ReactNode =>
  'pill' in t ? <TonePill tone={t.pill[0]} glyph={t.pill[1]}>{t.pill[2]}</TonePill>
    : 'tag' in t ? <span className="cpm-admin-mark">{t.tag}</span> : t.term;

export const AdminHowToRead: React.FC<{ tab: HowToKey | undefined; open: boolean; onClose: () => void }> = ({ tab, open, onClose }) => (
  <Dialog open={open && !!tab} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {(tab ? HOW_TO[tab] : []).map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          {part.text && <p className="cpm-copy">{part.text}</p>}
          {part.rows && (
            <dl className="cpm-howto__key">
              {part.rows.map(([t, meaning]) => (
                <div key={meaning} className="cpm-howto__row">
                  <dt>{termOf(t)}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  </Dialog>
);

export default AdminHowToRead;
