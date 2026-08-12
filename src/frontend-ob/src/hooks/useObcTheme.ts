import { useEffect, useState } from 'react';

/**
 * The active OpenBridge theme (`data-obc-theme` on <html>), observed live.
 *
 * Charts resolve token values to literals with getComputedStyle() inside a
 * useMemo; without the theme in the dep array a day↔night switch left every
 * chart drawn in the previous theme's colors until the next data change. Adding
 * the return of this hook to those dep arrays re-derives the option on switch.
 */
export function useObcTheme(): string {
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.getAttribute('data-obc-theme') ?? 'day',
  );

  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setTheme(el.getAttribute('data-obc-theme') ?? 'day');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['data-obc-theme'] });
    return () => obs.disconnect();
  }, []);

  return theme;
}

export default useObcTheme;
