'use client';

/**
 * CHG-174 (owner review, badge 14, answer 1): How to read for the open Governance tab, top right in the header. It holds what the
 * page's ? said (How these filters differ, About the audit chain, When a permission change applies, Why versions are stored) and
 * the approval rules word for word, the ControlAuthority rule in cplm-api's own words (ConfigStore.cs), stated nowhere before.
 * Corrected on the way: Entity asks the server too (the filters text named only User and Event type); "(A13)" went.
 * CHG-202 (owner, 15 Nov 2026: no ids or backend text): the rules in plain words (no permission key, content hash, server or
 * quoted refusal; the ControlAuthority role keeps its exact name, which an administrator has to give it); "Unknown user" with
 * no talk of ids; the filters, the chain and the stored versions without "server", "rows fetched", "walk" or "payload".
 * CHG-220 (owner, 23 Nov 2026): an Admin or SuperAdmin may approve their own draft; a site-wide change needs a SuperAdmin (who
 * counts as ControlAuthority, a role nobody held); an expired approval can be given again.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';

export type GovernanceTab = 'trail' | 'approvals' | 'duties' | 'traceability';

type Term = { pill: Array<[tone: CpmTone, glyph: string, word: string]> } | { act: [tone: CpmTone | null, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows?: Array<[Term, string]>; text?: string }

/** The approval rules, in plain words (Gate Configuration enforces them; CHG-202). */
export const APPROVE_RULE = 'Someone other than the author, with permission to approve gate configuration. An Admin or SuperAdmin may approve their own.';
export const APPROVAL_BINDS = 'An approval holds only for the content approved, and it expires; an expired one can be given again. Approving content changed since is refused.';
export const CONTROL_AUTHORITY = 'A site-wide change, or a change to an objective or a test permission, needs a SuperAdmin to approve it.';
export const SIGN_OUT = 'Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again.';

export const HOW_TO: Record<GovernanceTab, Part[]> = {
  trail: [
    { title: 'Actor', rows: [
      [{ term: 'a name' }, 'The person signed in when the change was made.'],
      [{ term: 'System' }, 'The application did it: a shelf that expired, an activation verified.'],
      [{ term: 'Unknown user' }, 'An older change recorded without the person’s name.'],
    ] },
    { title: 'Action', rows: [
      [{ act: ['good', '✓', 'Loop activated'] }, 'Activated, acknowledged, approved, verified.'],
      [{ act: ['warn', '◐', 'Event shelved'] }, 'Shelved.'],
      [{ act: ['bad', '✕', 'Loop deleted'] }, 'Deleted or rejected.'],
      [{ act: [null, '', 'Draft edited'] }, 'Any other change.'],
    ] },
    { title: 'Filters', text: 'Entity, User, Event type and the time range search the whole audit trail, older records too. Find searches only the page shown. User matches the whole user name, in any case.' },
    { title: 'Audit chain', text: 'Each entry is chained to the one before it, so a changed entry breaks the chain. Verify audit chain checks every entry and shows the result.' },
  ],
  approvals: [
    { title: 'State', rows: [
      [{ pill: [['warn', '◐', 'Validated'], ['warn', '◐', 'Shadow evaluated']] }, 'Waits for an independent approver.'],
      [{ pill: [['warn', '◐', 'Approved']] }, 'Waits for activation.'],
      [{ pill: [['bad', '✕', 'Activation failed'], ['bad', '✕', 'Partially acknowledged']] }, 'NOT active: activate again once the cause is fixed.'],
    ] },
    { title: 'Rules', rows: [
      [{ term: 'Approve' }, APPROVE_RULE],
      [{ term: 'Approval' }, APPROVAL_BINDS],
      [{ term: 'Site-wide change' }, CONTROL_AUTHORITY],
    ] },
  ],
  duties: [
    { title: 'Marks', rows: [[{ term: '✓' }, 'The role holds the permission.'], [{ term: '—' }, 'The role does not hold it.']] },
    { title: 'When a permission change applies', text: SIGN_OUT },
  ],
  traceability: [
    { title: 'Why versions are stored', text: 'Every stored window keeps these versions, so any past verdict can be traced to the formula that produced it.' },
  ],
};

const termOf = (t: Term): React.ReactNode => {
  if ('pill' in t) return <span className="cpm-gov-pills">{t.pill.map(([tone, glyph, word]) => <TonePill key={word} tone={tone} glyph={glyph}>{word}</TonePill>)}</span>;
  if ('act' in t) {
    const [tone, glyph, word] = t.act;
    return <span className={`cpm-gov-act${tone ? ` cpm-pill--${tone}` : ''}`}><span className="cpm-pill__glyph cpm-gov-act__glyph" aria-hidden>{glyph}</span><span>{word}</span></span>;
  }
  return t.term;
};

export const GovernanceHowToRead: React.FC<{ tab: GovernanceTab; open: boolean; onClose: () => void }> = ({ tab, open, onClose }) => (
  <Dialog open={open} onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {HOW_TO[tab].map(part => (
        <section key={part.title} className="cpm-howto__part" aria-label={part.title}>
          <h3 className="cpm-howto__title">{part.title}</h3>
          {part.text && <p className="cpm-copy">{part.text}</p>}
          {part.rows && (
            <dl className="cpm-howto__key">
              {part.rows.map(([t, meaning]) => (
                <div key={meaning} className="cpm-howto__row"><dt>{termOf(t)}</dt><dd>{meaning}</dd></div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  </Dialog>
);

export default GovernanceHowToRead;
