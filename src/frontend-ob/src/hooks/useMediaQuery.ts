import { useEffect, useState } from 'react';

/**
 * Reactive `window.matchMedia`. Used where a layout DECISION (not just styling)
 * depends on width — e.g. the gate evidence panel docks beside the matrix on a
 * wide workspace but has to become a modal dialog when there is no room for a
 * second column. CSS alone cannot make that swap, because the two placements
 * need different ARIA semantics (non-modal vs `aria-modal`).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
