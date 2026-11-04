/**
 * Focus handling for dialogs and drawers (DEC-002 RD12).
 *
 * `querySelectorAll` stops at a shadow boundary, and `document.activeElement` reports a shadow
 * host rather than the element inside it. ObcButton keeps its real <button> in a shadow root, so a
 * light-DOM trap never saw footer buttons, and restoring focus to the host did nothing because the
 * host itself cannot take focus.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isRendered(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/** Every keyboard-focusable element under `root` in document order, including inside open shadow roots. */
export function focusableIn(root: ParentNode | null | undefined): HTMLElement[] {
  const found: HTMLElement[] = [];
  const walk = (node: ParentNode) => {
    for (const child of Array.from(node.children)) {
      const el = child as HTMLElement;
      if (el.matches(FOCUSABLE) && el.tabIndex >= 0 && isRendered(el)) found.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
      walk(el);
    }
  };
  if (root) walk(root);
  return found;
}

/** The element that really holds focus, looking through shadow hosts. */
export function deepActiveElement(): HTMLElement | null {
  let active = document.activeElement as HTMLElement | null;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement as HTMLElement;
  return active;
}

function containsDeep(root: Node, target: Node | null): boolean {
  for (let node: Node | null = target; node; node = node.parentNode ?? (node as ShadowRoot).host ?? null) {
    if (node === root) return true;
  }
  return false;
}

/** Keeps Tab and Shift+Tab inside `root`, wrapping at either end. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const items = focusableIn(root);
  if (items.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = deepActiveElement();
  if (!active || !containsDeep(root, active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Moves focus to the first field, else the first focusable element, else the container. */
export function focusInitial(root: HTMLElement | null): void {
  if (!root) return;
  const items = focusableIn(root);
  const field = items.find(el => el.matches('input, select, textarea'));
  (field ?? items[0] ?? root).focus();
}
