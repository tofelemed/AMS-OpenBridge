/**
 * SPEC §6.14: the one loop picker. Search by tag or description, scoped by the header's plant
 * selection, with recently opened loops, as a keyboard listbox (WAI-ARIA combobox).
 */
import React, { useId, useMemo, useRef, useState } from 'react';
import type { CpmLoop } from '../api/cpmApi';
import { loopMatchesQuery } from '../components/Cpm/plantScope';

const RECENT_KEY = 'cpa-recent-loops';
const RECENT_MAX = 5;
const LIST_MAX = 50;

export function readRecentLoops(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

export function rememberLoop(loopId: string): void {
  const next = [loopId, ...readRecentLoops().filter(id => id !== loopId)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
}

const locationOf = (l: CpmLoop) => [l.site, l.area, l.unit].filter(Boolean).join(' › ');

export const AssetPicker: React.FC<{
  label?: string;
  /** The loops already narrowed to the header scope. */
  loops: CpmLoop[];
  value: string;
  onSelect: (loopId: string) => void;
  loading?: boolean;
  error?: boolean;
}> = ({ label = 'Loop', loops, value, onSelect, loading, error }) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = loops.find(l => l.loopId.toLowerCase() === value.toLowerCase());

  const options = useMemo(() => {
    const matching = loops.filter(l => loopMatchesQuery(l, text));
    if (text.trim()) return matching.slice(0, LIST_MAX);
    const recent = readRecentLoops()
      .map(id => matching.find(l => l.loopId === id))
      .filter((l): l is CpmLoop => !!l);
    const rest = matching.filter(l => !recent.includes(l));
    return [...recent, ...rest].slice(0, LIST_MAX);
  }, [loops, text, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentCount = text.trim() ? 0 : readRecentLoops().filter(id => loops.some(l => l.loopId === id)).length;
  const optionId = (i: number) => `${listId}-${i}`;

  const commit = (loop: CpmLoop | undefined) => {
    if (!loop) return;
    rememberLoop(loop.loopId);
    onSelect(loop.loopId);
    setText('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(options.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); commit(options[cursor]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setText(''); }
  };

  return (
    <div className="ui-picker">
      <label className="ui-field">
        <span className="ui-field__label">{label}</span>
        <input
          ref={inputRef}
          className="ui-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[cursor] ? optionId(cursor) : undefined}
          value={open ? text : (selected ? `${selected.loopId} · ${selected.displayName}` : value)}
          placeholder="Search by tag or description"
          onFocus={() => { setOpen(true); setText(''); setCursor(0); }}
          onBlur={() => setOpen(false)}
          onChange={e => { setText(e.target.value); setCursor(0); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} results`} className="ui-picker__list">
          {loading && <li className="ui-picker__note" role="presentation">Loading loops</li>}
          {error && <li className="ui-picker__note" role="presentation">Loops are unavailable.</li>}
          {!loading && !error && options.length === 0 && (
            <li className="ui-picker__note" role="presentation">No loop matches in this scope.</li>
          )}
          {options.map((l, i) => (
            <li
              key={l.loopId}
              id={optionId(i)}
              role="option"
              aria-selected={l.loopId === value}
              data-active={i === cursor || undefined}
              className="ui-picker__option"
              onMouseDown={e => { e.preventDefault(); commit(l); }}
            >
              <span className="ui-picker__tag">{l.loopId}</span>
              <span className="ui-picker__desc">{l.displayName}</span>
              <span className="ui-picker__where">{i < recentCount ? 'Recent' : locationOf(l)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
