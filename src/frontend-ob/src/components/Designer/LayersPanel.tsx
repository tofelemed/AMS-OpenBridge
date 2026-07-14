'use client';

// Object tree / layers.
//
// Table stakes for an industrial editor: an imported PI Vision display carries ~720 symbols, many of
// them stacked (transparent hotspots over P&ID artwork). With overlapping objects you cannot select an
// occluded item on the canvas AT ALL. `zIndex`, `hidden`, `locked` and `groupId` have been in the model
// and honored by the renderer for phases — `hidden` in particular had no UI whatsoever, so an item you
// hid could never be brought back. This panel is what makes them reachable.
import React, { useMemo, useState } from 'react';
import type { CanvasItem } from './types';
import { ObiCommandLocked } from '@oicl/openbridge-webcomponents-react/icons/icon-command-locked';
// OpenBridge has no eye/visibility icon, so we do NOT invent one: icon-on / icon-off carry exactly the
// visible/hidden semantics and are real members of the set.
import { ObiOn } from '@oicl/openbridge-webcomponents-react/icons/icon-on';
import { ObiOff } from '@oicl/openbridge-webcomponents-react/icons/icon-off';

interface Props {
  items: CanvasItem[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void;
}

const itemName = (i: CanvasItem) => {
  if (i.label) return i.label;
  const bound = Object.values(i.bindings ?? {}).find(v => typeof v === 'string' && v.includes('/'));
  if (bound) return `{${bound.split('/').pop()}}`;
  return i.type.split('.').pop() ?? i.type;
};

export const LayersPanel: React.FC<Props> = ({ items, selectedIds, onSelect, onUpdateItem }) => {
  const [filter, setFilter] = useState('');

  // Top of the list = front-most, which is how every layers panel reads.
  const ordered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...items]
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
      .filter(i => !q || itemName(i).toLowerCase().includes(q) || i.type.toLowerCase().includes(q));
  }, [items, filter]);

  return (
    <div className="layers-panel" data-testid="layers-panel">
      <input
        className="layers-panel__search"
        placeholder="Filter objects…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      <div className="layers-panel__list">
        {ordered.map(i => {
          const sel = selectedIds.includes(i.id);
          return (
            <div
              key={i.id}
              className={`layers-row${sel ? ' active' : ''}`}
              data-testid="layer-row"
              data-item-id={i.id}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) onSelect([...new Set([...selectedIds, i.id])]);
                else onSelect([i.id]);
              }}
            >
              <button
                className="layers-row__btn"
                data-testid="layer-eye"
                title={i.hidden ? 'Show' : 'Hide'}
                onClick={(e) => { e.stopPropagation(); onUpdateItem(i.id, { hidden: !i.hidden }); }}
              >
                {i.hidden ? <ObiOff /> : <ObiOn />}
              </button>
              <button
                className={`layers-row__btn${i.locked ? ' active' : ''}`}
                data-testid="layer-lock"
                title={i.locked ? 'Unlock' : 'Lock'}
                onClick={(e) => { e.stopPropagation(); onUpdateItem(i.id, { locked: !i.locked }); }}
              >
                <ObiCommandLocked />
              </button>
              <span className={`layers-row__name${i.hidden ? ' dimmed' : ''}`}>{itemName(i)}</span>
              {i.groupId && <span className="layers-row__group" title="Grouped">grp</span>}
              <span className="layers-row__z">{i.zIndex ?? 0}</span>
            </div>
          );
        })}
        {ordered.length === 0 && <div className="property-hint">No objects match.</div>}
      </div>
    </div>
  );
};

export default LayersPanel;
