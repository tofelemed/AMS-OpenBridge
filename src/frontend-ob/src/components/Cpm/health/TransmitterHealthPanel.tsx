/**
 * v2.5 Task 1H.6 (spec v6 §4.7) — the transmitter-health drawer. Renders what cplm-api serves
 * for each bound signal role: the device as-of, its NAMUR NE107 flags with the text label always
 * visible, native status, collection freshness, the eligibility Flink decided, and the device's
 * own diagnostics (cause / remedy shown as text, never interpreted). Absence of a binding is
 * "not configured" — an unavailable state, never OK (NR-044: M-only is context only).
 */
import React from 'react';
import type { HealthEligibility, LoopInstrumentHealth, RoleHealth } from '../../../api/cpm/health';
import { KvRow, TonePill, fmtDateTime, type CpmTone } from '../shared';
import { codeLabel } from '../vocabulary';

export const NE107_LABEL: Record<string, string> = {
  F: 'Failure',
  C: 'Function check',
  S: 'Out of specification',
  M: 'Maintenance required',
};

/** Alert tokens per NE107 category (OpenBridge alert palette; M is informational). */
const NE107_TOKENS: Record<string, { fg: string; bg: string; border: string }> = {
  F: { fg: 'var(--alert-alarm-color)', bg: 'var(--alert-alarm-container-background-color)', border: 'var(--alert-alarm-container-border-color)' },
  S: { fg: 'var(--alert-caution-color)', bg: 'var(--alert-caution-container-background-color)', border: 'var(--alert-caution-container-border-color)' },
  C: { fg: 'var(--alert-running-color)', bg: 'var(--alert-running-container-background-color)', border: 'var(--alert-running-container-border-color)' },
  M: { fg: 'var(--alert-limit-secondary-color)', bg: 'transparent', border: 'var(--alert-limit-secondary-color)' },
};

export function eligibilityTone(e: HealthEligibility | string | null | undefined): CpmTone {
  switch (e) {
    case 'ELIGIBLE': return 'good';
    case 'LIMITED': return 'warn';
    case 'INELIGIBLE': return 'bad';
    default: return 'muted';
  }
}

/** One sentence an operator can act on, derived only from served fields. */
export function roleHeadline(r: RoleHealth): string {
  if (r.eligibility === 'NOT_CONFIGURED' || !r.deviceId) return 'No device bound — health unavailable (not OK)';
  if (r.collectionState === 'OFFLINE') return 'Source offline — last known status retained';
  const flags = r.activeFlags ?? [];
  const stale = r.collectionState === 'STALE' ? 'Stale collection — ' : '';
  if (flags.includes('F')) return `${stale}Failure — measurement invalid`;
  if (flags.includes('C')) return `${stale}Function check — measurement not representative`;
  if (flags.includes('S')) return `${stale}Out of specification — measurement degraded`;
  if (flags.includes('M')) return `${stale}Maintenance required — context only, measurement valid`;
  if (r.collectionState === 'STALE') return 'Stale collection — last verified state may no longer hold';
  if (r.collectionState === 'UNKNOWN' || r.eligibility === 'UNKNOWN') return 'Health unknown — no verified state yet';
  return 'No active diagnostic';
}

/** Worst-of summary for the workspace header pill. */
export function loopHealthSummary(h: LoopInstrumentHealth | undefined): { tone: CpmTone; label: string } {
  if (!h) return { tone: 'muted', label: 'HEALTH UNKNOWN' };
  const roles = h.roles ?? [];
  if (roles.length === 0 || roles.every(r => r.eligibility === 'NOT_CONFIGURED')) return { tone: 'muted', label: 'HEALTH NOT CONFIGURED' };
  if (roles.some(r => r.eligibility === 'INELIGIBLE')) return { tone: 'bad', label: 'INSTRUMENT FAULT' };
  if (roles.some(r => r.eligibility === 'LIMITED')) return { tone: 'warn', label: 'INSTRUMENT LIMITED' };
  if (roles.some(r => r.eligibility === 'UNKNOWN')) return { tone: 'muted', label: 'HEALTH UNKNOWN' };
  return { tone: 'good', label: 'INSTRUMENTS OK' };
}

export const fmtAge = (s: number | null | undefined): string => {
  if (s == null) return '—';
  if (s < 90) return `${Math.round(s)} s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172_800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${(s / 86_400).toFixed(1)} d ago`;
};

export const Ne107Chip: React.FC<{ flag: string }> = ({ flag }) => {
  const t = NE107_TOKENS[flag] ?? NE107_TOKENS.M;
  return (
    <span
      className="cpm-ne107"
      data-flag={flag}
      style={{ color: t.fg, background: t.bg, borderColor: t.border }}
      title={NE107_LABEL[flag] ?? flag}
    >
      <strong>{flag}</strong> {NE107_LABEL[flag] ?? flag}
    </span>
  );
};

const RoleCard: React.FC<{ r: RoleHealth; sourceState: string | null }> = ({ r, sourceState }) => {
  const bound = r.eligibility !== 'NOT_CONFIGURED' && !!r.deviceId;
  return (
    <article className="cpm-health-role" data-role={r.role} data-eligibility={r.eligibility}>
      <header className="cpm-health-role__head">
        <strong>{r.role}</strong>
        <span className="cpm-event-row__sub">{bound ? r.deviceId : 'no device bound'}</span>
        <TonePill tone={eligibilityTone(r.eligibility)}>{codeLabel(r.eligibility)}</TonePill>
      </header>
      <p className="cpm-health-role__headline">{roleHeadline(r)}</p>
      {bound && (
        <>
          <div className="cpm-health-role__flags">
            {r.activeFlags.length === 0
              ? <span className="cpm-event-row__sub">no NE107 flags active</span>
              : r.activeFlags.map(f => <Ne107Chip key={f} flag={f} />)}
          </div>
          <KvRow label="Native status">{r.nativeStatus ?? '—'}</KvRow>
          <KvRow label="Collection">{r.collectionState}{sourceState ? ` · source ${sourceState}` : ''}</KvRow>
          <KvRow label="Measurement impact">{r.measurementImpact}</KvRow>
          <KvRow label="Observed">{r.lastObservedAt ? `${fmtDateTime(r.lastObservedAt)} (${fmtAge(r.observedAgeS)})` : 'never'}</KvRow>
          <KvRow label="Verified">{r.lastVerifiedAt ? `${fmtDateTime(r.lastVerifiedAt)} (${fmtAge(r.verifiedAgeS)})` : 'never'}</KvRow>
          <KvRow label="Eligibility since">{r.intervalFrom ? `${fmtDateTime(r.intervalFrom)} · rev ${r.intervalRevision}` : '—'}</KvRow>
          <KvRow label="Reason">{r.reason || '—'}</KvRow>
          <KvRow label="Mapping version">{r.interpretationVersion != null ? `NE107 interpretation v${r.interpretationVersion}` : '—'}</KvRow>
          {r.diagnostics.length > 0 && (
            <table className="cpm-health-diag">
              <thead>
                <tr><th>Code</th><th>Message</th><th>Flags</th><th>Affects</th><th>Impact</th><th>Since</th><th>Cause</th><th>Remedy</th><th>Ref</th></tr>
              </thead>
              <tbody>
                {r.diagnostics.map(d => (
                  <tr key={d.diagnosticId}>
                    <td>{d.nativeCode ?? d.diagnosticId}</td>
                    <td>{d.message ?? '—'}</td>
                    <td>{d.flags.join(' ') || '—'}</td>
                    <td>{d.affectedVariableIds.join(', ') || '—'}</td>
                    <td>{d.measurementImpact ?? '—'}</td>
                    <td>{d.firstObservedAt ? fmtDateTime(d.firstObservedAt) : '—'}</td>
                    <td>{d.cause ?? '—'}</td>
                    <td>{d.remedy ?? '—'}</td>
                    {/* A source record reference is shown as text; deep links are allow-listed per site, not guessed. */}
                    <td>{d.sourceRecordRef ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </article>
  );
};

export const TransmitterHealthPanel: React.FC<{
  health?: LoopInstrumentHealth;
  loading?: boolean;
  error?: unknown;
}> = ({ health, loading, error }) => {
  if (loading && !health) return <p className="cpm-event-row__sub">Loading transmitter health…</p>;
  if (error && !health) {
    return (
      <p role="alert" className="cpm-event-row__sub">
        Transmitter health could not be loaded — {error instanceof Error ? error.message : 'request failed'}.
      </p>
    );
  }
  if (!health) return null;
  const summary = loopHealthSummary(health);
  return (
    <section className="cpm-health" aria-label="Transmitter health">
      <header className="cpm-health__head">
        <TonePill tone={summary.tone}>{summary.label}</TonePill>
        <span className="cpm-event-row__sub">
          as of {fmtDateTime(health.at)}
          {health.sourceState ? ` · source ${health.sourceState}${health.sourceSince ? ` since ${fmtDateTime(health.sourceSince)}` : ''}` : ''}
        </span>
      </header>
      {health.roles.map(r => <RoleCard key={r.role} r={r} sourceState={health.sourceState} />)}
    </section>
  );
};

export default TransmitterHealthPanel;
