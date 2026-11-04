/**
 * The theme, in one place (CD4). The blocking script in index.html applies the same rule before
 * first paint; keep the two in step. Only this module and that script touch the theme attributes.
 */
export type Theme = 'day' | 'night';

export const THEME_STORAGE_KEY = 'ams-theme';

/** Maps any stored value to a theme. Bright and light become day, dark becomes night (CD3, CD4). */
export function normaliseTheme(value: string | null | undefined): Theme {
  return value === 'night' || value === 'dark' ? 'night' : 'day';
}

export function readTheme(): Theme {
  const applied = document.documentElement.getAttribute('data-theme');
  if (applied) return normaliseTheme(applied);
  try {
    return normaliseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'day';
  }
}

/** Sets the Traverse attribute and the OpenBridge one together, and stores the choice. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-obc-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable; the attributes still apply for this session.
  }
}
