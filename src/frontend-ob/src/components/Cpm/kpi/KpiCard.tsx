/**
 * CHG-085 (KPI redesign): one compact KPI card — icon top-left, change since 24 h ago top-right, the number, its label and
 * its share of a named denominator. With `to`, the whole card is a link to the KPI's drill-down (navigation is a link, not a
 * button); the rule is the hover title. Colour only where it means something (ISA-101): the change is green when it moved
 * the right way and red when it moved the wrong way; the card's left accent follows the KPI's tone.
 */
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ObiTrendUp } from '@oicl/openbridge-webcomponents-react/icons/icon-trend-up';
import { ObiTrendDown } from '@oicl/openbridge-webcomponents-react/icons/icon-trend-down';
import type { CpmTone } from '../shared';
import type { KpiDelta } from './kpiMeta';

export const KpiCard: React.FC<{
  Icon: React.ComponentType;
  value: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
  tone?: CpmTone;
  delta?: KpiDelta | null;
  title?: string;
  to?: string;
  size?: 'regular' | 'large';
  /** Bears on the loop's current finding (SME review 2 #22): outlined so the eye goes there first. */
  relevant?: boolean;
}> = ({ Icon, value, label, sub, tone = 'muted', delta, title, to, size = 'regular', relevant = false }) => {
  const body = (
    <>
      <span className="cpm-kpicard__top">
        <span className="cpm-kpicard__icon" aria-hidden><Icon /></span>
        {delta && (
          <span className={`cpm-kpicard__delta cpm-kpicard__delta--${delta.good == null ? 'flat' : delta.good ? 'good' : 'bad'}`}
            title={delta.title}>
            {delta.direction === 'up' && <span className="cpm-kpicard__arrow" aria-hidden><ObiTrendUp /></span>}
            {delta.direction === 'down' && <span className="cpm-kpicard__arrow" aria-hidden><ObiTrendDown /></span>}
            <span className="cpm-visually-hidden">{delta.direction === 'up' ? 'up' : delta.direction === 'down' ? 'down' : 'unchanged'} </span>
            {delta.text}
          </span>
        )}
      </span>
      <span className="cpm-kpicard__value">{value}</span>
      <span className="cpm-kpicard__label">{label}</span>
      {sub != null && <span className="cpm-kpicard__sub">{sub}</span>}
    </>
  );
  const cls = `cpm-kpicard cpm-kpicard--${tone} cpm-kpicard--${size}${relevant ? ' cpm-kpicard--relevant' : ''}`;
  return to
    ? <RouterLink className={`${cls} cpm-kpicard--link`} to={to} title={title}>{body}</RouterLink>
    : <div className={cls} title={title}>{body}</div>;
};

export default KpiCard;
