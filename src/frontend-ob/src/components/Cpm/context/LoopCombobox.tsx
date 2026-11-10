/**
 * CHG-160 (owner review of Investigation): the loop control is a search field (WAI-ARIA combobox). Typing lists the loops
 * that match; a click on the field or the arrow lists every loop in the header scope. There is one list with one scroll
 * bar: no Find loop box inside a popover, no Loop Registry link and no Clear loop. Loops are listed flat, by tag, because
 * the header sets the plant scope (CHG-158).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { ObiSearch } from '@oicl/openbridge-webcomponents-react/icons/icon-search';
import type { CpmLoop } from '../../../api/cpmApi';
import { serviceName } from '../loopName';
import { loopMatchesQuery } from '../plantScope';
import { TonePill } from '../shared';

export const LoopCombobox: React.FC<{
  /** The loops to offer: the header scope, or a narrower list the page passes. */
  loops: CpmLoop[];
  /** The chosen loop as the address names it, which may not be in the registry. */
  loopId: string | null | undefined;
  /** The chosen loop's registry entry, when it has one. */
  loop: CpmLoop | undefined;
  onSelect: (loopId: string) => void;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}> = ({ loops, loopId, loop, onSelect, isLoading, isError, retry }) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const tag = loop?.loopId ?? loopId ?? '';
  const name = loop ? serviceName(loop) : '';
  const sorted = useMemo(() => loops.slice().sort((a, b) => a.loopId.localeCompare(b.loopId)), [loops]);
  const shown = useMemo(() => sorted.filter(l => loopMatchesQuery(l, text)), [sorted, text]);
  const optionId = (i: number) => `${listId}-${i}`;

  // The list opens on the chosen loop, so the arrows move on from it.
  const openAt = (list: CpmLoop[]) => { setCursor(Math.max(0, list.findIndex(l => l.loopId === loop?.loopId))); setOpen(true); };
  const close = () => { setOpen(false); setText(''); };
  const choose = (l: CpmLoop | undefined) => { if (!l) return; close(); onSelect(l.loopId); };

  useEffect(() => {
    if (open) document.getElementById(optionId(cursor))?.scrollIntoView?.({ block: 'nearest' });
  }, [open, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) setCursor(c => Math.min(shown.length - 1, c + 1)); else openAt(shown);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(shown[cursor]);
    } else if (e.key === 'Escape' && (open || text)) {
      e.stopPropagation();
      close();
    }
  };

  // The arrow lists every loop, whatever was typed; on the full list it closes it.
  const toggle = () => {
    if (open && !text) { close(); return; }
    setText('');
    openAt(sorted);
    inputRef.current?.focus();
  };

  return (
    <div className={`cpm-loop-combo${open ? ' cpm-loop-combo--open' : ''}`}>
      <span className="ui-icon ui-icon--small cpm-loop-combo__icon" aria-hidden="true"><ObiSearch /></span>
      <input
        ref={inputRef}
        className="cpm-loop-combo__input"
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-label={tag ? `Loop ${tag}${name ? ` ${name}` : ''}` : 'Loop'}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[cursor] ? optionId(cursor) : undefined}
        value={text}
        placeholder={tag ? (open ? `${tag} ${name}`.trim() : '') : 'Search loops'}
        onClick={() => { if (!open) openAt(shown); }}
        onBlur={close}
        onChange={e => { setText(e.target.value); setCursor(0); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {tag && !open && !text && (
        <span className="cpm-loop-combo__value" aria-hidden="true"><strong>{tag}</strong>{name && <> <span>{name}</span></>}</span>
      )}
      <button type="button" className="cpm-loop-combo__toggle" aria-label="Show all loops" aria-expanded={open} tabIndex={-1}
        onMouseDown={e => e.preventDefault()} onClick={toggle}>
        <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>
      </button>
      {open && (
        <div className="cpm-loop-combo__panel">
          {isLoading && <p className="cpm-loop-combo__note">Loading loops…</p>}
          {isError && (
            <p className="cpm-loop-combo__note" onMouseDown={e => e.preventDefault()}>
              The loop list is unavailable. <ObcButton variant="flat" onClick={retry}>Retry</ObcButton>
            </p>
          )}
          {!isLoading && !isError && shown.length === 0 && <p className="cpm-loop-combo__note">No loop matches the search.</p>}
          <ul id={listId} role="listbox" aria-label="Loops" className="cpm-loop-combo__list">
            {shown.map((l, i) => (
              <li key={l.loopId} id={optionId(i)} role="option" aria-selected={l.loopId === loop?.loopId}
                data-active={i === cursor || undefined} className="cpm-loop-combo__option"
                onMouseDown={e => { e.preventDefault(); choose(l); }} onMouseEnter={() => setCursor(i)}>
                <strong>{l.loopId}</strong>
                <span className="cpm-loop-combo__name">{serviceName(l)}</span>
                {l.isActive === false && <TonePill tone="muted">Retired</TonePill>}
              </li>
            ))}
          </ul>
          <span className="cpm-sr-only" role="status">{shown.length} loop(s)</span>
        </div>
      )}
    </div>
  );
};

export default LoopCombobox;
