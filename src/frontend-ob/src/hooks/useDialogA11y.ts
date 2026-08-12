import { useEffect, useRef } from 'react';

/**
 * J: minimal keyboard a11y for the hand-rolled CPM drawers/modals (which don't
 * use the shared Modal). Wires Escape-to-close, focuses the dialog on open, and
 * restores focus to the trigger on close. Attach the returned ref to the dialog
 * element and set aria-modal="true" on it.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Focus the first control, else the dialog itself.
    const first = ref.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (first ?? ref.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}

export default useDialogA11y;
