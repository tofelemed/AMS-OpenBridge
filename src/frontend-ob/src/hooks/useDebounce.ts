import { useEffect, useState } from 'react';

/**
 * FE-02: debounce a fast-changing value (filter/search inputs). The consumer filters
 * on the RETURNED value, so typing issues one filter pass per pause instead of one
 * per keystroke. Extracted from the UserManagement search (the one pre-existing
 * debounce in the app) so every filter shares the same behaviour.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default useDebounce;
