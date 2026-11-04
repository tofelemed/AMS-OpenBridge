/**
 * SPEC §6.8: a tone, a glyph and a text label, always all three (G05). Status colour appears only
 * here. The field-to-tone rules (CD8) are in statusTones.ts. NE107 is a separate component because
 * it is a diagnostic category, not a severity (CD9), and its fills do not change with the theme.
 */
import React from 'react';
import type { BadgeTone } from './statusTones';
import './status-badge.css';

const GLYPH: Record<BadgeTone, string> = {
  danger: '✕',
  warning: '!',
  success: '✓',
  info: 'i',
  unknown: '–',
  neutral: '·',
};

export const StatusBadge: React.FC<{
  tone: BadgeTone;
  /** Overrides the tone's glyph, for example a limited pass beside a pass. */
  glyph?: string;
  /** Names the field, so "Good" beside a diagnosis is never read as a verdict on it. */
  caption?: string;
  children: React.ReactNode;
}> = ({ tone, glyph, caption, children }) => (
  <span className={`ui-badge ui-badge--${tone}`}>
    {caption && <span className="ui-badge__caption">{caption}</span>}
    <span className="ui-badge__glyph" aria-hidden="true">{glyph ?? GLYPH[tone]}</span>
    <span>{children}</span>
  </span>
);

export type Ne107Code = 'F' | 'C' | 'S' | 'M';

export const NE107_LABEL: Record<Ne107Code, string> = {
  F: 'Failure',
  C: 'Function check',
  S: 'Out of specification',
  M: 'Maintenance request',
};

/** Code and label together: the chip alone is never the only cue (skill §5). */
export const Ne107Badge: React.FC<{ code: Ne107Code }> = ({ code }) => (
  <span className="ui-ne107">
    <span className={`ui-ne107__chip ui-ne107__chip--${code.toLowerCase()}`} aria-hidden="true">{code}</span>
    <span>{NE107_LABEL[code]}</span>
  </span>
);
