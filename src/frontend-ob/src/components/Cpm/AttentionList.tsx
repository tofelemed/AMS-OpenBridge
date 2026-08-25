'use client';

/**
 * Opportunity ranking — "bad actors", with two fixes over the previous panel.
 *
 * 1. NOT_EVALUATED loops are no longer ranked. A worst-offenders list whose
 *    bottom five entries carry no verdict looks authoritative while saying
 *    nothing; the count of unrankable loops is stated instead.
 * 2. Each row names the gates that produced the verdict. That is the missing
 *    bridge between this panel and the matrix — previously the ranking told you
 *    WHICH loop and the matrix told you WHY, with no link between them. Clicking
 *    a row now selects it in the matrix and jumps to the driving gate.
 */
import React from 'react';
import { ObcDropdownButton } from '@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button';
import type { CpmHeatmapLoop, CpmRankedLoop } from '../../api/cpmApi';
import { EmptyState, PanelHead, QueryError, TonePill, toneFor } from './shared';
import { drivingGates } from './gateStatus';

export type RankBy = 'confidence' | 'error';

const RANK_OPTIONS = [
  { value: 'confidence', label: 'By confidence' },
  { value: 'error', label: 'By control error' },
];

export interface AttentionListProps {
  ranked: CpmRankedLoop[];
  heatmapLoops: CpmHeatmapLoop[];
  gateKeys: string[];
  rankBy: RankBy;
  onRankByChange: (next: RankBy) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  retry: () => void;
  selectedLoopId: string | null;
  onSelectLoop: (loopId: string) => void;
  onOpenGate: (loopId: string, gate: string) => void;
}

export const AttentionList: React.FC<AttentionListProps> = ({
  ranked, heatmapLoops, gateKeys, rankBy, onRankByChange,
  isLoading, isError, error, retry, selectedLoopId, onSelectLoop, onOpenGate,
}) => {
  // Gate detail lives in the heatmap feed, the ranking feed carries metrics —
  // join them on loopId so a ranked row can name its own driving gates.
  const gatesByLoop = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of heatmapLoops) m.set(row.loopId.toLowerCase(), drivingGates(row, gateKeys));
    return m;
  }, [heatmapLoops, gateKeys]);

  const rankable = React.useMemo(
    () => ranked.filter(l => l.diagnosis !== 'NOT_EVALUATED'), [ranked]);
  const unrankable = ranked.length - rankable.length;

  return (
    <section className="cpm-surface">
      <PanelHead
        eyebrow="Opportunity ranking"
        title="Loops needing attention"
        right={
          <ObcDropdownButton
            options={RANK_OPTIONS}
            value={rankBy}
            onDropdownChange={(e: CustomEvent<{ value: string }>) =>
              onRankByChange(e.detail.value as RankBy)}
          />
        }
      />

      {isLoading && <EmptyState title="Ranking…" />}
      {isError && <QueryError title="Ranking unavailable" error={error} retry={retry} />}

      {!isLoading && !isError && rankable.length === 0 && (
        <EmptyState
          title="No loop has a verdict yet"
          copy={
            unrankable > 0
              ? `${unrankable} loop(s) are in scope but have not completed an evaluation window.`
              : 'Onboard loops in the Loop Registry to populate the ranking.'
          }
        />
      )}

      {rankable.length > 0 && (
        <ol className="cpm-attention">
          {rankable.map((l, i) => {
            const driving = gatesByLoop.get(l.loopId.toLowerCase()) ?? [];
            const selected = selectedLoopId?.toLowerCase() === l.loopId.toLowerCase();
            const metric = rankBy === 'error'
              ? (l.metrics.goodErrorPct != null
                ? `good error ${(l.metrics.goodErrorPct * 100).toFixed(0)}%` : null)
              : (l.confidence != null ? `confidence ${(l.confidence * 100).toFixed(0)}%` : null);
            return (
              <li
                key={l.loopId}
                className={`cpm-attention__row${selected ? ' cpm-attention__row--selected' : ''}`}
              >
                <button
                  type="button"
                  className="cpm-attention__main"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => onSelectLoop(l.loopId)}
                >
                  <span className="cpm-attention__rank" aria-hidden>#{i + 1}</span>
                  <span className="cpm-attention__id">
                    <strong>{l.loopId}</strong>
                    <span className="cpm-event-row__sub">{l.displayName}</span>
                  </span>
                </button>

                <span className="cpm-attention__verdict">
                  <TonePill tone={toneFor(l.diagnosis)}>{l.diagnosis.replace(/_/g, ' ')}</TonePill>
                  {metric && <span className="cpm-attention__metric">{metric}</span>}
                </span>

                <span className="cpm-attention__gates">
                  {driving.length === 0 ? (
                    <span className="cpm-attention__metric">no gate flagged</span>
                  ) : (
                    <>
                      <span className="cpm-attention__metric">driven by</span>
                      {driving.slice(0, 4).map(g => (
                        <button
                          key={g}
                          type="button"
                          className="cpm-attention__gate"
                          aria-label={`Open ${g} evidence for ${l.loopId}`}
                          onClick={() => { onSelectLoop(l.loopId); onOpenGate(l.loopId, g); }}
                        >
                          {g}
                        </button>
                      ))}
                      {driving.length > 4 && (
                        <span className="cpm-attention__metric">+{driving.length - 4}</span>
                      )}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {unrankable > 0 && rankable.length > 0 && (
        <p className="cpm-copy cpm-attention__footnote">
          {unrankable} further loop(s) returned by the ranking have no verdict yet and are
          not listed.
        </p>
      )}
    </section>
  );
};

export default AttentionList;
