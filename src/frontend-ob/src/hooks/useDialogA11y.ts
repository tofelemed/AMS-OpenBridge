import { useEffect, useRef } from 'react';
import { deepActiveElement, focusInitial, trapTab } from './focusTrap';

/**
 * J: minimal keyboard a11y for the hand-rolled CPM drawers/modals (which don't
 * use the shared Modal). Wires Escape-to-close, focuses the dialog on open, keeps
 * Tab inside it, and restores focus to the trigger on close, including a trigger
 * whose real button sits in a shadow root (ObcButton). Attach the returned ref to
 * the dialog element and set aria-modal="true" on it.
 */
export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = deepActiveElement();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab') trapTab(e, ref.current);
    };
    document.addEventListener('keydown', onKey);
    focusInitial(ref.current);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}

export default useDialogA11y;
