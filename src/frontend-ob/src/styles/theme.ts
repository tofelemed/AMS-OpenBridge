/**
 * L — shared design tokens for the "old generation" pages.
 *
 * These pages inlined a light-only `const T = { …raw hex… }` palette via
 * `style={{}}`, which beats every stylesheet — so they rendered white-on-light
 * in the night theme and ignored the theme switch entirely. This module maps the
 * SAME key names to OpenBridge CSS variables (the exact tokens the app shell and
 * the CPM suite already use), so a value like `color: T.textPrimary` re-themes
 * with everything else across day / dusk / night / bright.
 *
 * Keys are a superset of every palette that existed across the 20 files, so a
 * per-file `const T = {…}` can be replaced by `import { T } from '.../theme'`
 * with no other change. The mapping favours legibility over an exact shade match:
 * the point is that the value is a THEME TOKEN, not a fixed hex.
 */
export const T = {
  // Brand / accent (used as text, border, and small fills)
  blue:          'var(--element-active-color)',
  blueMid:       'var(--element-active-color)',
  blueLight:     'var(--container-section-color)',
  blueMuted:     'var(--border-divider-color)',

  // Surfaces
  bg:            'var(--container-backdrop-color)',
  card:          'var(--container-background-color)',
  border:        'var(--border-divider-color)',
  borderLight:   'var(--border-divider-color)',

  // Content
  text:          'var(--element-active-color)',
  textPrimary:   'var(--element-active-color)',
  textSecondary: 'var(--element-neutral-color)',
  textSub:       'var(--element-neutral-color)',
  textMuted:     'var(--element-inactive-color)',

  // Status — success / running
  success:       'var(--alert-running-color)',
  successBg:     'var(--container-section-color)',
  successBorder: 'var(--alert-running-color)',

  // Status — warning / caution
  warning:       'var(--alert-warning-color)',
  warningBg:     'var(--container-section-color)',
  warningBorder: 'var(--alert-warning-color)',
  caution:       'var(--alert-caution-color)',
  cautionBg:     'var(--container-section-color)',

  // Status — critical / danger (ISA-18.2 alarm)
  critical:      'var(--alert-alarm-color)',
  criticalBg:    'var(--container-section-color)',
  criticalBorder:'var(--alert-alarm-color)',
  danger:        'var(--alert-alarm-color)',
  dangerBg:      'var(--container-section-color)',

  // Informational accents
  notice:        'var(--element-active-color)',
  noticeBg:      'var(--container-section-color)',
  purple:        'var(--element-active-color)',
  purpleBg:      'var(--container-section-color)',
  purpleBorder:  'var(--border-divider-color)',

  // Non-color scalars
  radius:        '12px',
  radiusSm:      '8px',
  shadow:        'var(--shadow-flat)',
  shadowHover:   'var(--shadow-flat)',
} as const;

export default T;
