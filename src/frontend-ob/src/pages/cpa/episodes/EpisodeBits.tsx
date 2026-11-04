/** The small parts the ledger and the inspector share. */
import React from 'react';
import { ObiCheckGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-check-google';
import { reasonOf, type Receipt } from '../../../components/Cpm/ActionReceipt';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Toggletip } from '../../../ui/Toggletip';
import { NOT_RECORDED, type BadgeView } from './episodeView';

export const Badge: React.FC<{ view: BadgeView }> = ({ view }) => (
  <StatusBadge tone={view.tone} glyph={view.glyph}>{view.label}</StatusBadge>
);

/** A badge, or a dash that names itself: a missing value never reads as a state. */
export const BadgeOrDash: React.FC<{ view: BadgeView | null; missing?: string }> = ({ view, missing = NOT_RECORDED }) =>
  (view ? <Badge view={view} /> : <Dash label={missing} />);

export const Dash: React.FC<{ label: string }> = ({ label }) => (
  <>
    <span aria-hidden="true">—</span>
    <span className="ui-sr">{label}</span>
  </>
);

/** One labelled value, with its definition when it has one (SPEC principle 4). */
export const Field: React.FC<{ label: string; metric?: string; children: React.ReactNode }> = ({ label, metric, children }) => (
  <div className="episode__field">
    <dt>
      {label}
      {metric && <Toggletip metric={metric} label={label} />}
    </dt>
    <dd>{children}</dd>
  </div>
);

export const failed = (what: string, err: unknown, key: number): Receipt =>
  ({ ok: false, text: `${what} failed: ${reasonOf(err)}`, key });

/**
 * What the last action recorded, or why it failed, until the next one replaces it. A failure is an
 * alert. The polite announcement of a success is the always-mounted region in the inspector body.
 */
export const EpisodeReceipt: React.FC<{ receipt: Receipt | null }> = ({ receipt }) => {
  if (!receipt) return null;
  if (!receipt.ok) return <p className="ui-field__error" role="alert">{receipt.text}</p>;
  return (
    <p className="episode__receipt">
      <span className="ui-icon ui-icon--small"><ObiCheckGoogle /></span>
      <span>{receipt.text}</span>
    </p>
  );
};
