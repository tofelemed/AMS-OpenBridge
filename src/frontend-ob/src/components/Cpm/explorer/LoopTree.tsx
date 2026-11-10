'use client';

/**
 * The loop list: search, then the loops by tag. The Explorer shows it while no loop is open, and the loop band opens it
 * from its control.
 *
 * - The plant scope is not set here. It writes `?site=&area=&unit=` and follows you to every other CPM screen, so its
 *   control sits in the application header and this list only follows it.
 * - CHG-158 (owner review): the list is flat. The header already narrows it to a site, area or unit, so grouping the
 *   loops by that hierarchy again here repeated it.
 * - The list states how much of the fleet it is showing.
 */
import React from 'react';
import { serviceName } from '../loopName';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { TextInput } from '../../../ui/forms/TextInput';
import type { CpmLoop } from '../../../api/cpmApi';
import { useDebounce } from '../../../hooks/useDebounce';
import { EmptyState, QueryError, TonePill } from '../shared';
import { loopMatchesQuery } from '../plantScope';

export interface LoopTreeProps {
  loops: CpmLoop[];
  selectedLoopId: string | undefined;
  onSelect: (loopId: string) => void;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  retry: () => void;
  onOpenRegistry: () => void;
  /** Fleet size before the plant scope narrowed it, for the honest count. */
  totalLoops: number;
}

export const LoopTree: React.FC<LoopTreeProps> = ({
  loops, selectedLoopId, onSelect, isLoading, isError, error, retry,
  onOpenRegistry, totalLoops,
}) => {
  const [draft, setDraft] = React.useState('');
  const search = useDebounce(draft, 200);
  const shown = React.useMemo(
    () => loops.filter(l => loopMatchesQuery(l, search)).sort((a, b) => a.loopId.localeCompare(b.loopId)),
    [loops, search],
  );

  return (
    <>
      <TextInput label="Find loop" placeholder="loop, service, area, unit or type" clearable value={draft} onChange={setDraft} />

      {!isLoading && !isError && (
        <p className="cpm-tree__count" aria-live="polite">
          {shown.length} of {totalLoops} loop(s)
        </p>
      )}

      {isLoading && <EmptyState title="Loading…" />}
      {isError && (
        <QueryError title="Loop registry unavailable" error={error} retry={retry} />
      )}
      {!isLoading && !isError && shown.length === 0 && (
        <EmptyState
          title="No loops"
          copy={search ? 'Nothing matches the search.' : 'Onboard loops in the Loop Registry.'}
          action={search
            ? { label: 'Clear search', onClick: () => setDraft('') }
            : { label: 'Open Loop Registry', onClick: onOpenRegistry }}
        />
      )}

      <div className="cpm-tree">
        {shown.map(l => (
          <button
            key={l.loopId}
            type="button"
            className={`cpm-tree-item${l.loopId === selectedLoopId ? ' cpm-tree-item--active' : ''}`}
            aria-current={l.loopId === selectedLoopId ? 'true' : undefined}
            // replace-navigation lives in the parent: selecting a loop is in-page selection in a master-detail view, not a page visit.
            onClick={() => onSelect(l.loopId)}
          >
            <strong>{l.loopId}</strong>
            <span className="cpm-event-row__sub">{serviceName(l)}</span>
            {l.isActive === false && <TonePill tone="muted">Retired</TonePill>}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="cpm-tree__foot">
          <ObcButton variant="flat" onClick={onOpenRegistry}>Loop Registry ↗</ObcButton>
        </div>
      )}
    </>
  );
};

export default LoopTree;
