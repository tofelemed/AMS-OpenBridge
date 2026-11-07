/**
 * G07 while old pages remain: about 40 of their links are literal paths, and Phases 4 to 6 replace
 * them. One choke point keeps the context on all of them meanwhile: when the path changes and the
 * new URL lacks context the old one had, it is added. A value the link sets itself always wins. On
 * the same page nothing is added, so clearing the plant scope stays cleared. New pages use cpaHref.
 */
import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { destinationFor } from './destinations';
import { chosenKind } from './tabKind';

const isContextPath = (path: string) => path === '/cpm' || path.startsWith('/cpm/') || path === '/admin' || path.startsWith('/admin/');

/** The search to use for the new URL, or null when nothing needs adding. */
export function carriedSearch(prevSearch: string, nextPath: string, nextSearch: string): string | null {
  const trend = nextPath === '/trend';
  if (!trend && !isContextPath(nextPath)) return null;
  const prev = new URLSearchParams(prevSearch);
  const next = new URLSearchParams(nextSearch);
  const add = (key: string, value: string | null) => {
    if (value && !next.has(key)) { next.set(key, value); return true; }
    return false;
  };

  let changed = false;
  for (const key of ['site', 'area', 'unit']) changed = add(key, prev.get(key)) || changed;
  // Trend keeps the plant scope for the way back and the loop (UI-136): its own range and tags are its own.
  if (trend) {
    changed = add('loop', prev.get('loop')) || changed;
    return changed ? `?${next.toString()}` : null;
  }

  const range = prev.get('range');
  if (!next.has('range') && !next.has('from') && !next.has('to')) {
    if (range === 'custom' || (range == null && prev.get('from') && prev.get('to'))) {
      if (prev.get('from') && prev.get('to')) {
        next.set('range', 'custom');
        next.set('from', prev.get('from') as string);
        next.set('to', prev.get('to') as string);
        changed = true;
      }
    } else {
      changed = add('range', range) || changed;
    }
  }

  const dest = destinationFor(nextPath);
  if (dest?.carriesLoop) changed = add('loop', prev.get('loop')) || changed;
  if (dest?.carriesWindow) {
    const param = dest.kindParam ?? 'kind';
    // A link can leave a kind in `window` on a page that reads `window` as an evaluated END.
    const leftInWindow = dest.windowIsEnd ? chosenKind(new URLSearchParams(next.has('window') ? { window: next.get('window') as string } : {})) : undefined;
    if (leftInWindow) {
      next.delete('window');
      if (!next.has(param)) next.set(param, leftInWindow);
      changed = true;
    }
    const kind = chosenKind(prev);
    if (kind && !chosenKind(next)) {
      next.set(param, kind);
      changed = true;
    }
  }
  return changed ? `?${next.toString()}` : null;
}

export function useContextCarry(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const prev = useRef({ pathname: location.pathname, search: location.search });

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = { pathname: location.pathname, search: location.search };
    if (before.pathname === location.pathname) return;
    const search = carriedSearch(before.search, location.pathname, location.search);
    if (search != null) navigate({ pathname: location.pathname, search, hash: location.hash }, { replace: true, state: location.state });
  }, [location, navigate]);
}
