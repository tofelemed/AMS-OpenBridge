'use client';

/**
 * Loop combobox — ONE control for one decision.
 *
 * It replaces LoopPicker, which was a `<select>` plus a separate filter box
 * wired to a `<datalist>`. Only the select could actually choose: the filter
 * box's handler was `setQuery` and nothing else, so picking a search suggestion
 * wrote the loop id into the SEARCH TEXT and you then had to open the dropdown
 * and pick the same loop a second time. The two controls also fought — the
 * filter changed what the select OFFERED without changing what it HELD, which
 * is why a synthetic "(outside current filter)" option existed to keep the
 * committed value alive.
 *
 * This is the WAI-ARIA combobox-with-list-autocomplete pattern: type to filter,
 * arrow to move, Enter to commit. Opening without typing still shows the whole
 * in-scope list, so the browse path the `<select>` did well is preserved.
 *
 * Filtering is CLIENT-SIDE on purpose. `useCpmLoops` fetches the registry
 * unpaged and react-query caches it, so every page already holds the full list;
 * a per-keystroke fetch would add latency, request churn and out-of-order races
 * to something that is currently instant. Revisit when the registry outgrows a
 * single response — then add `GET /cpm/loops?q=` with a debounce.
 */
import React from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import type { CpmLoop } from '../../api/cpmApi';
import { CpmIconButton } from './shared';
import { loopMatchesQuery, type CpmScope } from './plantScope';

const locationOf = (l: CpmLoop) =>
  [l.site, l.area, l.unit].filter(Boolean).join(' / ') || 'Unassigned';

export interface LoopComboboxProps {
  loops: CpmLoop[];
  /** Committed loop id, or '' for no selection. */
  value: string;
  onChange: (loopId: string) => void;
  /** Omit to hide the clear affordance (pages that require a selection). */
  onClear?: () => void;
  label?: string;
  /** When set, out-of-scope loops are hidden and reported as a count. */
  scope?: CpmScope;
}

export const LoopCombobox: React.FC<LoopComboboxProps> = ({
  loops, value, onChange, onClear, label = 'Control loop', scope,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const inScope = React.useMemo(
    () => (scope ? loops.filter(l => scope.matches(l)) : loops), [loops, scope]);
  const hidden = loops.length - inScope.length;

  /** Flat, in display order — keyboard navigation indexes into THIS. */
  const matches = React.useMemo(
    () => inScope.filter(l => loopMatchesQuery(l, query))
      .sort((a, b) => locationOf(a).localeCompare(locationOf(b))
        || a.loopId.localeCompare(b.loopId)),
    [inScope, query]);

  const selected = loops.find(l => l.loopId.toLowerCase() === value.toLowerCase());
  /** The committed selection can sit outside the scope; never drop it silently. */
  const outOfScope = !!selected && !inScope.some(l => l.loopId === selected.loopId);

  const displayLabel = selected ? `${selected.loopId} · ${selected.displayName}` : '';

  // Close on outside click. Blur alone is not enough: clicking an option blurs
  // the input before the click lands, which is why the list suppresses mousedown.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open]);

  const openList = () => {
    if (open) return;
    setQuery('');
    setActive(Math.max(0, matches.findIndex(l => l.loopId === value)));
    setOpen(true);
  };

  const commit = (loopId: string) => {
    onChange(loopId);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { openList(); return; }
        setActive(i => Math.min(matches.length - 1, i + 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (open) setActive(i => Math.max(0, i - 1));
        return;
      case 'Home':
        if (open) { e.preventDefault(); setActive(0); }
        return;
      case 'End':
        if (open) { e.preventDefault(); setActive(matches.length - 1); }
        return;
      case 'Enter':
        if (open && matches[active]) { e.preventDefault(); commit(matches[active].loopId); }
        return;
      case 'Escape':
        // Cancel without committing; the input falls back to the committed label.
        if (open) { e.preventDefault(); setOpen(false); setQuery(''); }
        return;
      case 'Tab':
        setOpen(false); setQuery('');
        return;
      default:
    }
  };

  let renderedIndex = -1;

  return (
    <div className="cpm-field cpm-combo" ref={rootRef}>
      <label className="cpm-field__label" htmlFor={`${listId}-input`}>{label}</label>
      <div className="cpm-combo__control">
        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="cpm-input cpm-combo__input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? optionId(active) : undefined}
          placeholder={selected ? undefined : 'Search or select a loop'}
          value={open ? query : displayLabel}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
        />
        {selected && onClear && (
          <CpmIconButton label="Clear the selected loop"
            onClick={() => { onClear(); setQuery(''); setOpen(false); }}>
            <ObiCloseGoogle />
          </CpmIconButton>
        )}
        <CpmIconButton label={open ? 'Close the loop list' : 'Open the loop list'}
          onClick={() => (open ? (setOpen(false), setQuery('')) : (inputRef.current?.focus(), openList()))}>
          <ObiChevronDownGoogle />
        </CpmIconButton>
      </div>

      {open && (
        // Suppressing mousedown keeps focus on the input, so the option's click
        // fires before any blur handling can close the list under the cursor.
        <ul
          id={listId}
          ref={listRef}
          className="cpm-combo__list"
          role="listbox"
          aria-label={label}
          onMouseDown={e => e.preventDefault()}
        >
          {matches.length === 0 && (
            <li className="cpm-combo__empty">
              No loop matches “{query}”
              {scope?.active ? ' in this plant scope' : ''}.
            </li>
          )}
          {matches.map((l, i) => {
            const isFirstOfGroup = i === 0 || locationOf(matches[i - 1]) !== locationOf(l);
            renderedIndex = i;
            return (
              <React.Fragment key={l.loopId}>
                {isFirstOfGroup && (
                  <li className="cpm-combo__group" role="presentation">{locationOf(l)}</li>
                )}
                <li
                  id={optionId(renderedIndex)}
                  role="option"
                  aria-selected={l.loopId === value}
                  className={`cpm-combo__option${i === active ? ' cpm-combo__option--active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(l.loopId)}
                >
                  <strong>{l.loopId}</strong>
                  <span className="cpm-event-row__sub">{l.displayName} · {l.loopType}</span>
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}

      <span className="cpm-combo__hint">
        {open
          ? `${matches.length} of ${inScope.length} loop(s) match · ↑↓ move · Enter select`
          : selected
            ? `${inScope.length} loop(s) in scope${hidden > 0 ? ` · ${hidden} hidden by scope` : ''}`
            : `${inScope.length} loop(s) available`}
      </span>
      {outOfScope && (
        <span className="cpm-combo__hint cpm-combo__hint--warn">
          {selected!.loopId} sits outside the current plant scope — it stays selected until
          you pick another.
        </span>
      )}
    </div>
  );
};

export default LoopCombobox;
