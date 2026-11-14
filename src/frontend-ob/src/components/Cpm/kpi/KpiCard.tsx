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
  Icon: React.ComponentType;
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
}> = ({ Icon, value, label, sub, tone = 'muted', title, to, size = 'regular', headed = false, relevant = false, iconTone = 'none', onOpen, bar, group }) => {
  const tipId = useId();
  const valueId = useId();
  const cls = `cpm-kpicard cpm-kpicard--${tone} cpm-kpicard--${size}${headed ? ' cpm-kpicard--headed' : ''}${relevant ? ' cpm-kpicard--relevant' : ''}`;

  // CHG-185: the title opens the dialog and its click area covers the card; the ? tip sits above it, so a tap on the ? opens the tip
  if (headed && onOpen) {
    return (
      <div className={`${cls} cpm-kpicard--link cpm-kpicard--open`}>
        <span className="cpm-kpicard__head">
          <span className="cpm-kpicard__title">
            <button type="button" className="cpm-kpicard__opener" aria-haspopup="dialog" aria-describedby={valueId} onClick={onOpen}>
              <span className="cpm-kpicard__label">{label}</span>
            </button>
            {(sub || title) && (
              <Toggletip variant="how-to" label={`About ${label}`}>
                {sub ? <p><strong>{sub}</strong></p> : null}
                {title ? <p>{title}</p> : null}
              </Toggletip>
            )}
          </span>
          <span className={`cpm-kpicard__icon cpm-kpicard__icon--${iconTone}`} aria-hidden><Icon /></span>
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
        <span className={`cpm-kpicard__icon cpm-kpicard__icon--${iconTone}`} aria-hidden><Icon /></span>
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
      <span className="cpm-kpicard__top">
        <span className="cpm-kpicard__icon" aria-hidden><Icon /></span>
      </span>
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
