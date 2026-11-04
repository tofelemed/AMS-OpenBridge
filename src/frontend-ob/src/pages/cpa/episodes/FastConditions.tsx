/**
 * Fast conditions (audit F22): limit dwell and freeze as they are detected, beside the slower episodes.
 * Each row leads to the loop's short windows in Evidence. The list has no time filter either.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { conditionRows, type ConditionRow } from '../../../components/Cpm/events/ConditionsPanel';
import { useCpmConditions } from '../../../components/Cpm/events/useConditions';
import { gateName } from '../../../components/Cpm/gateStatus';
import { siteDateTime } from '../../../cpa/siteTime';
import { useCpaContext } from '../../../cpa/useCpaContext';
import { DataTable, type Column } from '../../../ui/DataTable';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Toggletip } from '../../../ui/Toggletip';

/** The read's limit: at this many rows the list may be cut short, and the page says so. */
const LIMIT = 200;

type Row = ConditionRow & { started: string };

const State: React.FC<{ row: Row }> = ({ row }) => {
  if (row.stale) {
    return (
      <span className="episodes__peak">
        <StatusBadge tone="unknown">Open, stale</StatusBadge>
        <span className="ui-meta">Last update {row.lastUpdate}</span>
      </span>
    );
  }
  return <StatusBadge tone={row.open ? 'warning' : 'neutral'}>{row.open ? 'Open' : 'Closed'}</StatusBadge>;
};

const columns = (search: string): Array<Column<Row>> => [
  { key: 'state', header: 'State', cell: r => <State row={r} /> },
  {
    key: 'loop',
    header: 'Loop',
    cell: r => (
      <span className="episodes__episode">
        <Link className="ui-link episodes__tag" to={cpaHref('/cpm/evidence', search, { loop: r.loopId, kind: '15m' })}>{r.loopId}</Link>
        {r.displayName !== r.loopId && <span className="ui-meta">{r.displayName}</span>}
      </span>
    ),
  },
  {
    key: 'condition',
    header: 'Condition',
    cell: r => (
      <span className="episodes__episode">
        <span>{r.label}</span>
        <span className="ui-meta">{gateName(r.gateLabel)} · {r.gateLabel}</span>
      </span>
    ),
  },
  {
    key: 'since',
    header: 'Since',
    cell: r => (
      <span className="episodes__episode">
        <span>{r.since}</span>
        <span className="ui-meta">{r.started}</span>
      </span>
    ),
  },
  { key: 'duration', header: 'Duration', cell: r => r.duration },
  { key: 'reason', header: 'Close reason', cell: r => r.reason || '—' },
];

export const FastConditions: React.FC = () => {
  const { scope, zone } = useCpaContext();
  const { search } = useLocation();
  const query = useCpmConditions(scope.params, false, LIMIT);
  const conditions = query.data?.conditions ?? [];
  const rows: Row[] = conditionRows(conditions, Date.now())
    .map((r, i) => ({ ...r, started: siteDateTime(conditions[i].startMs, zone.id) }));
  const open = rows.filter(r => r.open).length;

  return (
    <section className="episodes__panel episodes__ledger" aria-labelledby="episodes-fast-conditions">
      <h2 id="episodes-fast-conditions" className="episodes__title">
        Fast conditions{rows.length > 0 ? ` · ${open} open` : ''}
        <Toggletip metric="M-126" label="Fast conditions" />
      </h2>
      <DataTable
        caption="Fast conditions"
        density="compact"
        columns={columns(search)}
        rows={rows}
        rowKey={r => r.key}
        loading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No fast conditions in scope"
        emptyReason="No loop in scope is held at a limit or frozen."
        footer={rows.length >= LIMIT ? <p className="ui-meta">First {LIMIT} shown.</p> : undefined}
      />
    </section>
  );
};
