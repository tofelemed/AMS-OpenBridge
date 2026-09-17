/**
 * 2026-09-17 audit F22: the fast conditions on the Loop Events page. A limit dwell (G10) or a
 * freeze (G11) is detected within a minute by the Condition Engine and lands here long before the
 * next fused window judges it - open ones first with their age, closed ones with their reason.
 * Each row leads to the loop's short windows in the workbench, where the dwell / freeze is drawn.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { CpmCondition } from '../../../api/cpm/conditions';
import { EmptyState, PanelHead, QueryError, TonePill, fmtDateTime, fmtDuration } from '../shared';
import { ageText } from '../verdictAge';

const KIND_LABEL: Record<string, string> = { FREEZE: 'Freeze', LIMIT_LOW: 'Limit low', LIMIT_HIGH: 'Limit high' };

export interface ConditionRow {
  key: string;
  loopId: string;
  displayName: string;
  gateLabel: string;
  label: string;
  open: boolean;
  state: string;
  since: string;
  startedAt: string;
  duration: string;
  reason: string;
}

export function conditionRows(conditions: CpmCondition[], now: number): ConditionRow[] {
  return conditions.map(c => ({
    key: `${c.loopId}|${c.gate}|${c.kind}|${c.startMs}`,
    loopId: c.loopId,
    displayName: c.displayName ?? c.loopId,
    gateLabel: c.gate,
    label: KIND_LABEL[c.kind] ?? c.kind.toLowerCase().replace(/_/g, ' '),
    open: c.state !== 'CLOSED',
    state: c.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
    since: ageText(Math.max(0, now - c.startMs)),
    startedAt: fmtDateTime(new Date(c.startMs).toISOString()),
    duration: fmtDuration(c.durationS * 1000),
    reason: c.closeReason ?? '',
  }));
}

export const ConditionsPanel: React.FC<{ conditions: CpmCondition[]; isLoading: boolean; error: unknown; now?: number; onRetry?: () => void }> =
  ({ conditions, isLoading, error, now = Date.now(), onRetry }) => {
    const rows = conditionRows(conditions, now);
    const open = rows.filter(r => r.open).length;
    return (
      <section className="cpm-surface">
        <PanelHead eyebrow="Fast conditions · G10 limit dwell / G11 freeze" title={`Conditions${rows.length ? ` · ${open} open` : ''}`}
          right={<span className="cpm-copy">detected within a minute, before the next fused window</span>} />
        {isLoading && <EmptyState title="Loading the fast conditions…" />}
        {error != null && <QueryError title="Conditions unavailable" error={error} retry={onRetry} />}
        {!isLoading && error == null && rows.length === 0 && (
          <EmptyState title="No fast conditions in scope" copy="A limit dwell or a freeze on any loop in scope appears here as soon as the Condition Engine sees it." />
        )}
        {rows.length > 0 && (
          <div className="cpm-matrix-scroll">
            <table className="cpm-table" aria-label="Fast conditions">
              <thead>
                <tr><th>State</th><th>Loop</th><th>Condition</th><th>Since</th><th>Duration</th><th>Close reason</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key} data-open={r.open}>
                    <td><TonePill tone={r.open ? 'warn' : 'muted'}>{r.state}</TonePill></td>
                    <td>
                      <Link className="cpm-link" to={`/cpm/evidence?loop=${encodeURIComponent(r.loopId)}&kind=15m`} title={`Open the 15m windows of ${r.loopId} in the workbench`}>{r.loopId}</Link>
                      <span className="cpm-event-row__sub"> {r.displayName}</span>
                    </td>
                    <td><span className="cpm-mono">{r.gateLabel}</span> {r.label}</td>
                    <td title={r.startedAt}>{r.since}</td>
                    <td>{r.duration}</td>
                    <td>{r.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };
