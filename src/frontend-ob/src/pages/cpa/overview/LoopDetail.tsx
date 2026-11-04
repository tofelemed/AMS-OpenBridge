/**
 * The inspector with a loop selected (SPEC §5.1): identity, condition, why this loop, named
 * statistics, the aligned trend for the same evaluated window, and the episode. Verdict and window
 * come from the row in the table, so the inspector can never contradict the row beside it.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type { FleetKpiBasis } from '../../../api/cpm/fleetKpis';
import { cpaHref } from '../../../components/Cpm/cpaHref';
import { gateName } from '../../../components/Cpm/gateStatus';
import { diagnosisLabel } from '../../../components/Cpm/vocabulary';
import { useCpmEvents, useCpmLoop } from '../../../hooks/useCpm';
import { Button } from '../../../ui/Button';
import { DataState } from '../../../ui/DataState';
import { GateBadge } from '../../../ui/GateBadge';
import { StatusBadge } from '../../../ui/StatusBadge';
import { NEUTRAL } from '../../../ui/statusTones';
import { episodeBadge } from './episodeView';
import { alsoCheck, gateFacts, loopStatistics, whyLines } from './loopFacts';
import { LoopWindowTrend } from './LoopWindowTrend';
import { MetricHelp } from './MetricHelp';
import { shortStamp, windowPhrase } from './overviewFormat';
import type { ReviewKey } from './reviewFilters';
import type { ReviewRow } from './reviewRows';

const EPISODES_READ = 5;

const EpisodeState: React.FC<{ loopId: string; windowKind: string; zoneId: string; search: URLSearchParams }> = ({ loopId, windowKind, zoneId, search }) => {
  const events = useCpmEvents({ loopId, openOnly: false, includeShelved: true, limit: EPISODES_READ, sort: 'recent' }, 60_000);
  const list = events.data?.events ?? [];
  const episode = list.find(e => e.window_kind === windowKind && e.closed_at == null)
    ?? list.find(e => e.window_kind === windowKind) ?? list[0];

  if (events.isLoading) return <DataState kind="loading" label="Loading the episode" rows={2} />;
  if (events.isError) return <DataState kind="error" title="Could not load the episode" error={events.error} onRetry={() => void events.refetch()} />;
  if (!episode) return <p className="ui-meta">No episode recorded for this loop.</p>;

  const badge = episodeBadge(episode, Date.now());
  return (
    <>
      <p className="ov-episode">{diagnosisLabel(episode.peak_diagnosis)} <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></p>
      <p className="ui-meta">Opened {shortStamp(episode.opened_at, zoneId)}</p>
      <Link className="ui-link" to={cpaHref('/cpm/events', search, { loop: loopId, event: episode.id })}>Open episode</Link>
    </>
  );
};

export const LoopDetail: React.FC<{
  row: ReviewRow;
  review: ReviewKey;
  zoneId: string;
  search: URLSearchParams;
  basis?: FleetKpiBasis;
  onClear: () => void;
}> = ({ row, review, zoneId, search, basis, onClear }) => {
  const loop = useCpmLoop(row.loopId).data;
  const stats = loopStatistics(row);
  const gates = gateFacts(row, review);
  const check = alsoCheck(row, review);

  return (
    <div className="ov-inspector">
      <dl className="ov-facts">
        <div><dt>Service</dt><dd>{row.name ?? loop?.displayName ?? '—'}</dd></div>
        <div><dt>Asset</dt><dd>{row.asset || '—'}</dd></div>
        <div><dt>Criticality</dt><dd>{row.criticality ? <StatusBadge tone={NEUTRAL.tone}>{row.criticality}</StatusBadge> : '—'}</dd></div>
        <div><dt>Condition</dt><dd><StatusBadge tone={row.condition.tone}>{row.condition.label}</StatusBadge></dd></div>
      </dl>

      <section className="ov-section" aria-label="Why this loop">
        <h3 className="ov-section__title">Why this loop</h3>
        {whyLines(row, review, Date.now()).map(line => <p key={line} className="ov-line">{line}</p>)}
        {row.windowEnd && <p className="ui-meta">{windowPhrase(row.windowKind, row.windowEnd, zoneId)}</p>}
      </section>

      <section className="ov-section" aria-label="Statistics for the evaluated window">
        <h3 className="ov-section__title">Statistics</h3>
        <dl className="ov-facts">
          {stats.map(s => (
            <div key={s.key}>
              <dt>{s.label} <MetricHelp metric={s.metric} label={s.label} basis={basis} extra={s.extra} /></dt>
              <dd>{s.value ?? 'Not measured'}</dd>
            </div>
          ))}
          {gates.map(g => (
            <div key={g.gate}>
              <dt>{gateName(g.gate)} · {g.gate}</dt>
              <dd><GateBadge status={g.status} gate={g.gate} /></dd>
            </div>
          ))}
        </dl>
        {check && <p className="ui-meta">Also check: {check}</p>}
      </section>

      <LoopWindowTrend loopId={row.loopId} windowKind={row.windowKind} windowEnd={row.windowEnd} loop={loop} zoneId={zoneId} />

      <section className="ov-section" aria-label="Episode">
        <h3 className="ov-section__title">Episode</h3>
        <EpisodeState loopId={row.loopId} windowKind={row.windowKind} zoneId={zoneId} search={search} />
      </section>

      <Button variant="ghost" onClick={onClear}>Clear selection</Button>
    </div>
  );
};
