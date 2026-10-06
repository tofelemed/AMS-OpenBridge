/**
 * SME review #14 (CHG-051): the engine's own strings, verbatim, behind a closed disclosure at the foot of
 * an evidence view. The view above them speaks engineering language; this is the "advanced information"
 * the SME asked to keep: exact codes for support tickets, method reviews and search.
 */
import React from 'react';
import { codeLabel, phrase } from '../../vocabulary';

export interface Explanation { observation: string; gate: string; status: string; note: string }

/**
 * The fusion decision's `explanations` string —
 * "OSCILLATION=G5=PASS,period=NO_VALID_CYCLE;PEER_INTERACTION=G13=NOT_EVALUATED:NOT_CONFIGURED" —
 * as rows: symptom, gate, result, and the qualifier turned into words ("period: no clean oscillation cycle").
 */
export function parseExplanations(raw: string | undefined | null): Explanation[] {
  return (raw ?? '').split(';').map(x => x.trim()).filter(Boolean).flatMap(entry => {
    const [observation, gate, ...rest] = entry.split('=');
    if (!observation || !gate) return [];
    const tail = rest.join('=');
    const [statusPart, ...extras] = tail.split(',');
    const [status, why] = statusPart.split(':');
    const notes = [
      ...(why ? [codeLabel(why)] : []),
      ...extras.map(x => { const [k, v] = x.split('='); return v ? `${k}: ${phrase(v)}` : codeLabel(k); }),
    ];
    return [{ observation, gate, status: status || '—', note: notes.join(' · ') }];
  });
}

export const EngineTrace: React.FC<{ entries: Array<[string, string | undefined | null]> }> = ({ entries }) => {
  const shown = entries.filter(([, v]) => v != null && v !== '');
  if (shown.length === 0) return null;
  return (
    <details className="cpm-chart__more" data-advanced="engine-trace">
      <summary>Advanced — engine trace (raw codes)</summary>
      <dl className="cpm-engine-trace">
        {shown.map(([k, v]) => (
          <React.Fragment key={k}><dt className="cpm-mono">{k}</dt><dd className="cpm-mono">{v}</dd></React.Fragment>
        ))}
      </dl>
    </details>
  );
};
