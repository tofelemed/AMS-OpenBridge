'use client';

/**
 * CHG-169 (owner review, answer 1): "How to read" for Gate Configuration, top right beside Effective | Bundles. A dialog in five
 * titled parts - Levels, Change class, Flags, Bundle state, Gate roles - holding what the page's five ? said (the title, "How the
 * layers combine", "The three levels", "What this list holds", "Gate role policy") and the Gate role policy card that sat under
 * every view. The gate roles are the build's gate catalogue, read when the dialog opens (never a client-side table).
 */
import React from 'react';
import { Dialog } from '../../../ui/Dialog';
import { TonePill, type CpmTone } from '../shared';
import { useGateCatalogue } from '../../../hooks/useCpm';
import type { GateCatalogue } from '../../../api/cpm/catalogue';

type Pill = [tone: CpmTone, glyph: string, word: string];
interface Part { title: string; lead?: string; rows: Array<[React.ReactNode, string]> }

const pill = ([tone, glyph, word]: Pill) => <TonePill key={word} tone={tone} glyph={glyph}>{word}</TonePill>;
const cls = (tone: CpmTone, text: string) => <span className={`cpm-config-class cpm-config-class--${tone}`}>{text}</span>;

const ROLE_ORDER = ['BLOCKING', 'ELIGIBILITY', 'PERFORMANCE', 'PRIMARY', 'SUPPORTING', 'CONTEXT', 'CONFIRMATION', 'FUSION'];

/** v2.5 (2D.1 / 2E.3): the role policy is the BUILD's gate catalogue, grouped by role - never a client-side table. */
export function rolePolicyOf(catalogue: GateCatalogue | undefined): [string, string][] {
  if (!catalogue) return [];
  return ROLE_ORDER.map(role => [role, catalogue.gates.filter(g => g.role === role).map(g => g.gate).join(' · ')] as [string, string])
    .filter(([, gates]) => gates.length > 0);
}

const PARTS: Part[] = [
  { title: 'Levels', lead: 'A layer above sets a property, or leaves the one below. The most specific active level wins.', rows: [
    ['FACTORY', 'Shipped defaults.'],
    ['PROFILE', 'The class pack. A PROFILE bundle covers every loop of this class pack that has no LOOP bundle.'],
    ['SITE', 'Every loop of the site without a PROFILE or LOOP bundle.'],
    ['LOOP', 'Overrides the profile for this loop only.'],
    ['Unset', 'No layer sets it.'],
  ] },
  { title: 'Change class', rows: [
    [cls('muted', 'Policy'), 'Re-evaluated on complete qualified support under one bundle; old and new values never mix inside one result.'],
    [cls('warn', '◆ State boundary'), 'A STATE_BOUNDARY change opens a new epoch: windows whose support began before the effective time report WAITING (warm-up) instead of a mixed result.'],
    [cls('bad', '✕ Deployment'), 'A DEPLOYMENT-class change ships in a build; the workers refuse it as a bundle.'],
  ] },
  { title: 'Flags', rows: [
    [<TonePill key="c" tone="bad">commissioning</TonePill>, 'Commissioning required: the catalogue has no starting value.'],
    [<TonePill key="u" tone="muted">unread by build</TonePill>, "Not read by this build; the reason is in the property's panel."],
    [<TonePill key="i" tone="bad">invalid</TonePill>, 'A validation error names this property.'],
  ] },
  { title: 'Bundle state', lead: "Bundles in progress: drafts, validated, shadowed, approved or failed - active and superseded ones live on their loop's page.", rows: [
    [pill(['muted', '○', 'Draft']), 'Editable.'],
    [<>{pill(['warn', '◐', 'Validated'])} …</>, 'Validated, Shadow evaluated, Approved, Scheduled, Prepared: on its way.'],
    [pill(['good', '✓', 'Active (verified)']), 'Every required worker applied it and a result carries its hash.'],
    [<>{pill(['bad', '✕', 'Activation failed'])} …</>, 'Rejected, Approval expired, Partially acknowledged, Activation failed: not active.'],
    [<>{pill(['muted', '↺', 'Rolled back'])} {pill(['muted', '⊘', 'Superseded'])}</>, 'Settled.'],
  ] },
];

const Key: React.FC<{ part: Part }> = ({ part }) => (
  <section className="cpm-howto__part" aria-label={part.title}>
    <h3 className="cpm-howto__title">{part.title}</h3>
    {part.lead && <p className="cpm-copy">{part.lead}</p>}
    <dl className="cpm-howto__key">
      {part.rows.map(([term, meaning]) => (
        <div key={meaning} className="cpm-howto__row"><dt>{term}</dt><dd>{meaning}</dd></div>
      ))}
    </dl>
  </section>
);

const GateRoles: React.FC = () => {
  const catalogue = useGateCatalogue();
  const roles = rolePolicyOf(catalogue.data);
  return (
    <section className="cpm-howto__part" aria-label="Gate roles">
      <h3 className="cpm-howto__title">Gate roles</h3>
      {roles.length === 0
        ? <p className="cpm-copy">{catalogue.isError ? 'Gate catalogue unavailable.' : 'Loading the gate catalogue…'}</p>
        : <dl className="cpm-howto__key">{roles.map(([role, gates]) => <div key={role} className="cpm-howto__row"><dt>{role}</dt><dd>{gates}</dd></div>)}</dl>}
      <p className="cpm-copy">G9 geometry is supporting-only. It cannot create a stiction suspect without qualified independent evidence.</p>
    </section>
  );
};

/** Mounted only while open, so the gate catalogue is read when the dialog is opened. */
export const ConfigHowToRead: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (open ? (
  <Dialog open onClose={onClose} title="How to read" size="wide">
    <div className="cpm-howto">
      {PARTS.map(p => <Key key={p.title} part={p} />)}
      <GateRoles />
    </div>
  </Dialog>
) : null);

export default ConfigHowToRead;
