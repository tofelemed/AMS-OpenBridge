/**
 * CHG-085 (KPI redesign): one compact KPI card — icon top-left, the number, its label and its share of a named denominator.
 * With `to`, the whole card is a link to the KPI's drill-down (navigation is a link, not a button); the rule is the hover
 * title. Colour only where it means something (ISA-101): the card's left accent follows the KPI's tone.
 *
 * CHG-119: `headed` is the Overview layout the owner chose: label and icon on top, then the number. CHG-127: the card carries no
 * explanation; its share and the rule appear on hover or keyboard focus. The whole card opens the list. The drill-down and the
 * loop KPIs keep the compact layout. CHG-155: no card shows a change since 24 h ago (owner review).
 *
 * CHG-185 (owner review item 4): the loop KPIs take the headed layout too — title at top, then the value — with `onOpen`. The
 * explanation (`sub` and `title`) moves to a ? tip beside the title that opens on hover, focus or tap; the rest of the card opens the
 * KPI's dialog. `group` is the small line naming the card's group, `bar` the coverage bar.
 *
 * CHG-186 (owner review item 8): the same layout with neither `to` nor `onOpen` is a plain tile (the Investigation's result
 * facts, which open nothing): title and ? tip, then the value and bar. `Icon` is optional there, and `tip` replaces the tip's
 * `sub` / `title` text when the explanation is a block of its own.
 */
import React, { useId } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Toggletip } from '../../../ui/Toggletip';
import type { CpmTone } from '../shared';
import type { KpiIconTone } from './kpiMeta';

const Bar: React.FC<{ value: number }> = ({ value }) => (
  <span className="cpm-kpicard__bar" aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
);

export const KpiCard: React.FC<{
  /** Required on a link or compact card; a headed tile can go without. */
  Icon?: React.ComponentType;
  value: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
  tone?: CpmTone;
  title?: string;
  to?: string;
  size?: 'regular' | 'large';
  headed?: boolean;
  /** Bears on the loop's current finding (SME review 2 #22): outlined so the eye goes there first. */
  relevant?: boolean;
  /** `headed` only: what the icon's colour says. */
  iconTone?: KpiIconTone;
  /** Opens a dialog instead of navigating (the loop KPIs). */
  onOpen?: () => void;
  /** A share of a named whole, 0 to 100, drawn as a bar under the label. Never pass a ratio above 100: that is not "full". */
  bar?: number | null;
  /** `headed` with `onOpen` only: the card's group, a small line under the value (CHG-185). */
  group?: string;
  /** `headed` without `to`: the ? tip's content, in place of `sub` and `title` (CHG-186). */
  tip?: React.ReactNode;
  /** `onOpen` opens a dialog (the default); false when it opens a tab or a page part instead (CHG-195, System Response). */
  opensDialog?: boolean;
}> = ({ Icon, value, label, sub, tone = 'muted', title, to, size = 'regular', headed = false, relevant = false, iconTone = 'none', onOpen, bar, group, tip, opensDialog = true }) => {
  const tipId = useId();
  const valueId = useId();
  const cls = `cpm-kpicard cpm-kpicard--${tone} cpm-kpicard--${size}${headed ? ' cpm-kpicard--headed' : ''}${relevant ? ' cpm-kpicard--relevant' : ''}`;

  // CHG-185: the title opens the dialog and its click area covers the card; the ? tip sits above it, so a tap on the ? opens the tip.
  // CHG-186: without `onOpen` (and `to`) the same card is a plain tile.
  // CHG-192 (carried from CHG-185): on a card that opens a dialog the opener is the card-wide button, named by the title; the
  // title is plain text whose last word and ? never part (`cpm-kpicard__tail`), so a title that wraps keeps its ? right after its
  // last word (a button is laid out as one box, and a text break before the ? was still taken: the ? sat alone on a line). Tab
  // order: the opener, then the ?. A plain tile keeps its title as one text, the ? beside it.
  if (headed && (onOpen || !to)) {
    const cut = label.lastIndexOf(' ');
    const help = (tip || sub || title) ? (
      <Toggletip variant="how-to" label={`About ${label}`}>
        {tip ?? <>
          {sub ? <p><strong>{sub}</strong></p> : null}
          {title ? <p>{title}</p> : null}
        </>}
      </Toggletip>
    ) : null;
    return (
      <div className={onOpen ? `${cls} cpm-kpicard--link cpm-kpicard--open` : `${cls} cpm-kpicard--tile`}>
        {onOpen && (
          <button type="button" className="cpm-kpicard__opener" aria-haspopup={opensDialog ? 'dialog' : undefined} aria-label={label}
            aria-describedby={valueId} onClick={onOpen} />
        )}
        <span className="cpm-kpicard__head">
          <span className="cpm-kpicard__title">
            {onOpen ? (
              <span className="cpm-kpicard__label">
                {cut > 0 ? `${label.slice(0, cut)} ` : ''}
                <span className="cpm-kpicard__tail">{label.slice(cut + 1)}{help}</span>
              </span>
            ) : <><span className="cpm-kpicard__label">{label}</span>{help}</>}
          </span>
          {Icon && <span className={`cpm-kpicard__icon cpm-kpicard__icon--${iconTone}`} aria-hidden><Icon /></span>}
        </span>
        <span className="cpm-kpicard__figure">
          <span className="cpm-kpicard__value" id={valueId}>{value}</span>
        </span>
        {bar != null && <Bar value={bar} />}
        {group && <span className="cpm-kpicard__group">{group}</span>}
      </div>
    );
  }

  const body = headed ? (
    <>
      <span className="cpm-kpicard__head">
        <span className="cpm-kpicard__label">{label}</span>
        {Icon && <span className={`cpm-kpicard__icon cpm-kpicard__icon--${iconTone}`} aria-hidden><Icon /></span>}
      </span>
      <span className="cpm-kpicard__figure">
        <span className="cpm-kpicard__value">{value}</span>
      </span>
      <span className="cpm-kpicard__tip" id={tipId} role="tooltip">
        <strong>{sub}</strong>{title && <span>{title}</span>}
      </span>
    </>
  ) : (
    <>
      {Icon && (
        <span className="cpm-kpicard__top">
          <span className="cpm-kpicard__icon" aria-hidden><Icon /></span>
        </span>
      )}
      <span className="cpm-kpicard__value">{value}</span>
      <span className="cpm-kpicard__label">{label}</span>
      {bar != null && <Bar value={bar} />}
      {sub ? <span className="cpm-kpicard__sub">{sub}</span> : null}
    </>
  );
  if (headed && to) return <RouterLink className={`${cls} cpm-kpicard--link`} to={to} aria-describedby={tipId}>{body}</RouterLink>;
  if (onOpen) return <button type="button" className={`${cls} cpm-kpicard--link`} title={title} aria-haspopup="dialog" onClick={onOpen}>{body}</button>;
  return to
    ? <RouterLink className={`${cls} cpm-kpicard--link`} to={to} title={title}>{body}</RouterLink>
    : <div className={cls} title={title}>{body}</div>;
};

export default KpiCard;
