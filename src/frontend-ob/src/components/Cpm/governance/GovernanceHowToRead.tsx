'use client';

/**
 * CHG-174 (owner review, badge 14, answer 1): How to read for the open Governance tab, top right in the header. It holds what the
 * page's ? said (How these filters differ, About the audit chain, When a permission change applies, Why versions are stored) and
 * the approval rules word for word, the ControlAuthority rule in cplm-api's own words (ConfigStore.cs), stated nowhere before.
 * Corrected on the way: Entity asks the server too (the filters text named only User and Event type); "(A13)" went.
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';

export type GovernanceTab = 'trail' | 'approvals' | 'duties' | 'traceability';

type Term = { pill: Array<[tone: CpmTone, glyph: string, word: string]> } | { act: [tone: CpmTone | null, glyph: string, word: string] } | { term: string };
interface Part { title: string; rows?: Array<[Term, string]>; text?: string }

/** The approval rules, as Gate Configuration and cplm-api word them. */
export const APPROVE_RULE = 'Needs cpm.config.approve (by someone other than the author).';
export const APPROVAL_BINDS = 'An approval is bound to the content hash and expires. A self-approval, an expired approval or a stale hash is refused by the server.';
export const CONTROL_AUTHORITY = 'a site-wide or objective / test-permission change needs an approver with the ControlAuthority role';
export const SIGN_OUT = 'Everyone with this role is signed out within a few seconds, and gets the new permissions when they sign in again.';

export const HOW_TO: Record<GovernanceTab, Part[]> = {
  trail: [
    { title: 'Actor', rows: [
      [{ term: 'a user name' }, 'The person signed in when the change was made.'],
      [{ term: 'System' }, 'A service did it: a shelf that expired, an activation verified.'],
      [{ term: 'Not recorded by name' }, 'An older Administration event that names its actor by user id; the id is in Record details.'],
    ] },
    { title: 'Action', rows: [
      [{ act: ['good', '✓', 'Loop activated'] }, 'Activated, acknowledged, approved, verified.'],
      [{ act: ['warn', '◐', 'Event shelved'] }, 'Shelved.'],
      [{ act: ['bad', '✕', 'Loop deleted'] }, 'Deleted or rejected.'],
      [{ act: [null, '', 'Draft edited'] }, 'Any other change.'],
    ] },
    { title: 'Filters', text: 'Entity, User, Event type and the time range ask the server, so they reach older records. Find searches only the rows fetched. User matches the exact user name, in any case.' },
    { title: 'Audit chain', text: 'Entries are hash-chained by audit-service. Verify audit chain asks the service to walk the chain and shows its answer.' },
  ],
  approvals: [
    { title: 'State', rows: [
      [{ pill: [['warn', '◐', 'Validated'], ['warn', '◐', 'Shadow evaluated']] }, 'Waits for an independent approver.'],
      [{ pill: [['warn', '◐', 'Approved']] }, 'Waits for activation.'],
      [{ pill: [['bad', '✕', 'Activation failed'], ['bad', '✕', 'Partially acknowledged']] }, 'NOT active: activate again once the fleet is fixed.'],
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
    { title: 'Why versions are stored', text: 'Every stored window carries these versions in its payload, so any historical verdict can be attributed to the formula that produced it.' },
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
