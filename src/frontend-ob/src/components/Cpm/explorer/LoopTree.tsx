'use client';

/**
 * The Explorer rail: search plus a collapsible site/area/unit tree.
 *
 * What changed and why:
 * - The plant-scope filter left the rail. It writes `?site=&area=&unit=` and
 *   follows you to every other CPM screen, so it is page scope, not list scope;
 *   sitting inside the rail it claimed to filter the list AND ate ~300px of the
 *   only scrollable column, leaving four loops visible above the fold.
 * - Groups collapse and carry counts. The previous render flattened
 *   site/area/unit into one string key and emitted a flat button list with no
 *   way to fold anything — 200 loops meant 200 buttons and no navigation by
 *   area, which is how the plant is actually organised.
 * - The list states how much of the fleet it is showing.
 */
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObcTextInputField } from '@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field';
import type { CpmLoop } from '../../../api/cpmApi';
import { useDebounce } from '../../../hooks/useDebounce';
import { EmptyState, QueryError } from '../shared';
import { loopMatchesQuery } from '../plantScope';

/**
 * Above this many visible loops the tree stops opening every group — at plant
 * scale "everything expanded" is the same undifferentiated wall the flat list
 * was. Below it, collapsing would just add clicks.
 */
const AUTO_EXPAND_MAX = 40;

const groupKey = (l: CpmLoop) =>
  [l.site || 'unassigned', l.area, l.unit].filter(Boolean).join(' / ');

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
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});

  const groups = React.useMemo(() => {
    const byLocation = new Map<string, CpmLoop[]>();
    for (const l of loops.filter(x => loopMatchesQuery(x, search))) {
      const key = groupKey(l);
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(l);
    }
    return [...byLocation.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [loops, search]);

  const visibleCount = groups.reduce((n, [, ls]) => n + ls.length, 0);
  const activeGroup = React.useMemo(() => {
    const active = loops.find(l => l.loopId === selectedLoopId);
    return active ? groupKey(active) : null;
  }, [loops, selectedLoopId]);

  // Default openness is derived, not stored, so it re-evaluates when the scope
  // or the search changes; an explicit toggle overrides it for that group only.
  const defaultOpen = React.useCallback((key: string) =>
    search.trim().length > 0 || visibleCount <= AUTO_EXPAND_MAX || key === activeGroup,
  [search, visibleCount, activeGroup]);

  const isOpen = (key: string) => overrides[key] ?? defaultOpen(key);
  const toggle = (key: string) =>
    setOverrides(o => ({ ...o, [key]: !(o[key] ?? defaultOpen(key)) }));

  return (
    <>
      <ObcTextInputField
        value={draft}
        label="Find loop"
        placeholder="loop, service, area, unit or type"
        hasClearButton
        onInput={(e: Event) => setDraft((e.target as unknown as { value: string }).value ?? '')}
      />

      {!isLoading && !isError && (
        <p className="cpm-tree__count" aria-live="polite">
          {visibleCount} of {totalLoops} loop(s)
        </p>
      )}

      {isLoading && <EmptyState title="Loading…" />}
      {isError && (
        <QueryError title="Loop registry unavailable" error={error} retry={retry} />
      )}
      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState
          title="No loops"
          copy={search ? 'Nothing matches the search.' : 'Onboard loops in the Loop Registry.'}
          action={search
            ? { label: 'Clear search', onClick: () => setDraft('') }
            : { label: 'Open Loop Registry', onClick: onOpenRegistry }}
        />
      )}

      <div className="cpm-tree">
        {groups.map(([key, groupLoops]) => {
          const open = isOpen(key);
          return (
            <div key={key} className="cpm-tree__group">
              <button
                type="button"
                className="cpm-tree__group-head"
                aria-expanded={open}
                onClick={() => toggle(key)}
              >
                <span className="cpm-tree__caret" aria-hidden>{open ? '▾' : '▸'}</span>
                <span className="cpm-tree__group-name">{key}</span>
                <span className="cpm-tree__group-count">{groupLoops.length}</span>
              </button>
              {open && groupLoops.map(l => (
                <button
                  key={l.loopId}
                  type="button"
                  className={`cpm-tree-item${l.loopId === selectedLoopId ? ' cpm-tree-item--active' : ''}`}
                  aria-current={l.loopId === selectedLoopId ? 'true' : undefined}
                  // replace-navigation lives in the parent: selecting a loop is
                  // in-page selection in a master-detail view, not a page visit.
                  onClick={() => onSelect(l.loopId)}
                >
                  <strong>{l.loopId}</strong>
                  <span className="cpm-event-row__sub">{l.displayName}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {groups.length > 0 && (
        <div className="cpm-tree__foot">
          <ObcButton variant="flat" onClick={onOpenRegistry}>Loop Registry ›</ObcButton>
        </div>
      )}
    </>
  );
};

export default LoopTree;
