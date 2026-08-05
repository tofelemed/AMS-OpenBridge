'use client';

/**
 * CPLM Phase 7 (F0.4) — the ⌘K / Ctrl+K command palette, actually bound.
 * Searches three real sources: navigation entries (filtered by the caller's
 * permissions — an entry that would 403 is not offered), registered loops
 * (→ Loop Explorer deep link), and the calculations catalogue (→ Calculations
 * screen). Loops/calculations load lazily on first open and only when the
 * session carries analytics.view.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as cpm from '../api/cpmApi';
import { useAuthStore } from '../store/authStore';

export interface PaletteNavItem {
  path: string;
  label: string;
  group: string;
  permission?: string;
}

interface Entry {
  kind: 'nav' | 'loop' | 'calc';
  title: string;
  sub: string;
  path: string;
}

export const CommandPalette: React.FC<{ navItems: PaletteNavItem[] }> = ({ navItems }) => {
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const canAnalytics = hasPermission('analytics.view');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQuery('');
        setCursor(0);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const loops = useQuery({
    queryKey: ['cpm', 'loops'],
    queryFn: cpm.getLoops,
    enabled: open && canAnalytics,
    staleTime: 60_000,
  });
  const calcs = useQuery({
    queryKey: ['cpm', 'calculations'],
    queryFn: cpm.getCalculations,
    enabled: open && canAnalytics,
    staleTime: 5 * 60_000,
  });

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = navItems
      .filter(i => !i.permission || hasPermission(i.permission))
      .map(i => ({ kind: 'nav', title: i.label, sub: i.group, path: i.path }));
    const loopEntries: Entry[] = (loops.data?.loops ?? []).map(l => ({
      kind: 'loop',
      title: l.loopId,
      sub: `${l.displayName} · ${l.site}${l.area ? ` · ${l.area}` : ''}`,
      path: `/cpm/explorer?loop=${encodeURIComponent(l.loopId)}`,
    }));
    const calcEntries: Entry[] = (calcs.data?.gates ?? []).map(g => ({
      kind: 'calc',
      title: `${g.key} · ${g.name}`,
      sub: g.question,
      path: `/cpm/calculations?gate=${encodeURIComponent(g.key)}`,
    }));
    return [...nav, ...loopEntries, ...calcEntries];
  }, [navItems, hasPermission, loops.data, calcs.data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 12);
    return entries
      .filter(e => e.title.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q))
      .slice(0, 12);
  }, [entries, query]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setOpen(false);
    navigate(entry.path);
  };

  if (!open) return null;

  return (
    <>
      <div className="cmdk-backdrop" onClick={() => setOpen(false)} />
      <div className="cmdk" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk__input"
          placeholder="Go to screen, loop, or calculation…"
          value={query}
          onChange={e => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(results.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(results[cursor]); }
          }}
        />
        <div className="cmdk__list">
          {results.length === 0 && (
            <div className="cmdk__empty">
              No matches{!canAnalytics ? ' (loops and calculations need the analytics.view permission)' : ''}.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.kind}:${r.path}:${r.title}`}
              type="button"
              className={`cmdk__item${i === cursor ? ' cmdk__item--active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r)}
            >
              <span className={`cmdk__kind cmdk__kind--${r.kind}`}>
                {r.kind === 'nav' ? 'GO' : r.kind === 'loop' ? 'LOOP' : 'CALC'}
              </span>
              <span className="cmdk__title">{r.title}</span>
              <span className="cmdk__sub">{r.sub}</span>
            </button>
          ))}
        </div>
        <div className="cmdk__hint">↑↓ navigate · Enter open · Esc close</div>
      </div>
    </>
  );
};

export default CommandPalette;
