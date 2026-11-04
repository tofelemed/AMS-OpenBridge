/** The shell's width bands (guide p.6) and the remembered sidebar choice. */
import { useCallback, useState, useSyncExternalStore } from 'react';

export type ShellBand = 'wide' | 'rail' | 'drawer';

const RAIL = '(max-width: 1279.98px)';
const DRAWER = '(max-width: 1023.98px)';

const matches = (q: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);

const subscribe = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const lists = [window.matchMedia(RAIL), window.matchMedia(DRAWER)];
  lists.forEach(l => l.addEventListener('change', notify));
  return () => lists.forEach(l => l.removeEventListener('change', notify));
};

const readBand = (): ShellBand => (matches(DRAWER) ? 'drawer' : matches(RAIL) ? 'rail' : 'wide');

/** wide at 1280 and up, a forced rail below that, a drawer below 1024. */
export const useShellBand = (): ShellBand => useSyncExternalStore(subscribe, readBand, () => 'wide');

/** Kept from the old shell, so a collapsed menu stays collapsed after the upgrade. */
const NAV_KEY = 'ams-show-main-nav';

const readExpanded = (): boolean => {
  try { return localStorage.getItem(NAV_KEY) !== 'false'; } catch { return true; }
};

export function useSidebarExpanded(): [boolean, () => void] {
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = useCallback(() => {
    setExpanded(prev => {
      try { localStorage.setItem(NAV_KEY, String(!prev)); } catch { /* storage unavailable */ }
      return !prev;
    });
  }, []);
  return [expanded, toggle];
}
