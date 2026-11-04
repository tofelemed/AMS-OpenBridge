/**
 * SPEC §5.2 filters, in the table's toolbar. The rows filter, gate filter and view are shareable in
 * the URL. The text box is not: it would write one history entry per keystroke. The legend sits here,
 * above the matrix, so a mark never has to be guessed (SME review #16).
 */
import React from 'react';
import type { CpmHealthFilter } from '../../../api/cpmApi';
import { ROW_FILTERS, gateName, type MatrixView, type RowFilter } from '../../../components/Cpm/gateStatus';
import { Button } from '../../../ui/Button';
import { GateKey } from '../../../ui/GateBadge';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { Toggletip } from '../../../ui/Toggletip';
import { FilterChip } from '../../../ui/forms/FilterChip';
import { Select } from '../../../ui/forms/Select';
import { TextInput } from '../../../ui/forms/TextInput';
import { PAGE_SIZE, RANK_LIMIT, SORT_OPTIONS } from './performanceModel';
import type { PerformanceUrl } from './usePerformanceUrl';

export const HEALTH_FILTERS: ReadonlyArray<{ id: CpmHealthFilter; label: string }> = [
  { id: 'missing-binding', label: 'Missing binding' },
  { id: 'stale-collection', label: 'Stale collection' },
  { id: 'active-affected', label: 'Active affected-device condition' },
];

const VIEWS: ReadonlyArray<{ value: MatrixView; label: string }> = [
  { value: 'checks', label: 'Checks behind the result' },
  { value: 'matrix', label: 'Full gate matrix' },
];

export const PerformanceFilters: React.FC<{
  url: PerformanceUrl;
  counts: Record<RowFilter, number>;
  query: string;
  onQuery: (next: string) => void;
  /** Rows after filtering, and the first shown. */
  rowCount: number;
  start: number;
  /** Loops loaded, and monitored in scope. The matrix can serve fewer than exist. */
  loaded: number;
  total: number | null;
  rankingFailed: boolean;
  onRetryRanking: () => void;
  /** Below 1280 px the guide is not on screen, so it needs its own way in. */
  onOpenGuide?: () => void;
}> = ({ url, counts, query, onQuery, rowCount, start, loaded, total, rankingFailed, onRetryRanking, onOpenGuide }) => {
  const showing = rowCount === 0 ? '0' : `${start + 1}–${Math.min(start + PAGE_SIZE, rowCount)}`;
  const health = HEALTH_FILTERS.find(f => f.id === url.health);
  return (
    <div className="perf-filters">
      <div className="perf-filters__row">
        <SegmentedControl
          label="Rows"
          ignoreReselect
          value={url.rows}
          options={ROW_FILTERS.map(f => ({ value: f.value, label: `${f.label} ${counts[f.value]}` }))}
          onChange={url.setRows}
        />
        <Toggletip metric="M-040" label="Row filters" />
        <SegmentedControl label="View" ignoreReselect value={url.view} options={VIEWS} onChange={url.setView} />
      </div>

      <div className="perf-filters__row" role="group" aria-label="Quick filters">
        {HEALTH_FILTERS.map(f => (
          <FilterChip key={f.id} label={f.label} selected={url.health === f.id} onToggle={() => url.setHealth(url.health === f.id ? undefined : f.id)} />
        ))}
        {url.heldBy && (
          <FilterChip label={`Held back by ${gateName(url.heldBy)} · ${url.heldBy}`} selected onToggle={() => url.setHeldBy(null)} />
        )}
        <span className="perf-filters__sort">
          <Select label="Sort" hideLabel options={SORT_OPTIONS} value={url.sort} onChange={url.setSort} />
          <Toggletip label="Sort order" variant="info">
            <p>By evidence score: highest score first. The score ranks evidence. It is not a priority or a probability.</p>
            <p>By control error: lowest good-error time first.</p>
            <p>
              Both use each loop&apos;s newest verdict of any age, which can be older than the window in its row.
              Loops without one come last, by tag. At most {RANK_LIMIT} loops are ranked.
            </p>
          </Toggletip>
        </span>
        <span className="perf-filters__find">
          <TextInput label="Find a loop" hideLabel placeholder="Loop tag or description" clearable value={query} onChange={onQuery} />
        </span>
        <span className="ui-meta" aria-live="polite">
          Showing {showing} of {rowCount}
          {total != null && total > loaded ? ` · The matrix shows the first ${loaded} of ${total} loops in scope` : ''}
        </span>
        {onOpenGuide && <Button variant="ghost" onClick={onOpenGuide}>How to read this view</Button>}
      </div>

      {health && <p className="ui-meta">Only loops with {health.label.toLowerCase()}.</p>}
      {rankingFailed && (
        <p className="ui-meta" role="status">
          Sort unavailable: the ranking could not be read, so rows are listed by tag.{' '}
          <button type="button" className="ui-link" onClick={onRetryRanking}>Retry</button>
        </p>
      )}
      <GateKey />
    </div>
  );
};
