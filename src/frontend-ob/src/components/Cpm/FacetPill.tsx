/**
 * SME review #8 (CHG-046): one pill per FACET of a loop, always captioned with the
 * facet's fixed name, so a green "Good" next to a red diagnosis is never read as a
 * contradiction. Four facets answer four different questions:
 *
 *  - Signal quality      is the live PV measurement trustworthy right now (OPC / NAMUR NE107)
 *  - Instrument health   what the transmitter diagnostics say (Instrumental, NE107)
 *  - Control performance how much of the evaluated window stayed in the good-error band
 *  - Diagnosis           what the engine concluded about the loop
 *
 * Every CPM surface that shows one of these uses this pill (or, for control performance,
 * the "N% in band" bar), so the same word always means the same thing.
 */
import React from 'react';
import type { CpmTone } from './shared';
import { ageText } from './explorer/summary/summaryText';

export type Facet = 'signal' | 'health' | 'control' | 'diagnosis';

export const FACET_LABEL: Record<Facet, string> = {
  signal: 'Signal quality',
  health: 'Instrument health',
  control: 'Control performance',
  diagnosis: 'Diagnosis',
};

export const FACET_HINT: Record<Facet, string> = {
  signal: 'Signal quality: whether the live PV measurement is trustworthy right now (OPC / NAMUR NE107 quality)',
  health: 'Instrument health: what the transmitter diagnostics report (NAMUR NE107). No source means not checked — missing diagnostics are not OK',
  control: 'Control performance: share of the evaluated window inside the good-error band',
  diagnosis: "Diagnosis: the engine's conclusion about the loop on its latest evaluated window",
};

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** qualityLabel's GOOD / UNCERTAIN / OUT OF SERVICE / NO SIGNAL as words: "Good", "Out of service". */
export const signalQualityText = (label: string): string => sentence(label);

/**
 * The live feed heartbeats every known signal every 300 s (report by exception), so a value older than
 * two heartbeats means the feed has stalled — the same threshold as the Explorer's operating-state tiles.
 */
export const STALE_LIVE_MS = 10 * 60 * 1000;

/**
 * Signal quality as of NOW. A "Good" value that stopped updating is not good any more: OPC UA calls it
 * Uncertain (last usable value). Any stale quality carries the value's age, so a 15-hour-old "Good" can
 * never sit beside a current diagnosis looking current.
 */
export function liveSignalQuality(
  q: { label: string; tone: CpmTone }, lastSourceTs: number | null | undefined, now = Date.now(),
): { text: string; tone: CpmTone } {
  const stale = lastSourceTs != null && now - lastSourceTs > STALE_LIVE_MS;
  if (!stale) return { text: signalQualityText(q.label), tone: q.tone };
  const age = ageText(now - lastSourceTs!);
  if (q.label === 'GOOD') return { text: `Uncertain · last value ${age}`, tone: 'warn' };
  return { text: `${signalQualityText(q.label)} · last value ${age}`, tone: q.tone };
}

/** loopHealthSummary's labels without the repeated subject: "HEALTH NOT CONFIGURED" → "Not configured". */
export function instrumentHealthText(label: string): string {
  switch (label) {
    case 'INSTRUMENTS OK': return 'OK';
    case 'INSTRUMENT LIMITED': return 'Limited';
    case 'INSTRUMENT FAULT': return 'Fault';
    case 'HEALTH NOT CONFIGURED': return 'Not configured · not checked';
    case 'HEALTH UNKNOWN': return 'Unknown · not checked';
    default: return sentence(label);
  }
}

export const FacetPill: React.FC<{ facet: Facet; tone: CpmTone; children: React.ReactNode }> = ({ facet, tone, children }) => (
  <span className={`cpm-pill cpm-pill--${tone} cpm-facet`} title={FACET_HINT[facet]}>
    <span className="cpm-facet__caption">{FACET_LABEL[facet]}</span>
    <span className="cpm-pill__dot" aria-hidden />
    {children}
  </span>
);

export default FacetPill;
