'use client';

/**
 * Explorer › Summary — the fused window kind picker (12h / 24h) for the gate strip.
 *
 * Same contract as the Performance page's toggle: the value lives in `?window=`.
 * A stale bookmark can name a kind the engine does not fuse; the first served kind
 * then reads as selected, and only a choice of another kind reaches `onChange`.
 */
import React from 'react';
import { SegmentedControl } from '../../../../ui/SegmentedControl';

export interface WindowKindToggleProps {
  value: string;
  /** The fused kinds the engine serves (`resolutions.fusion.firesOn`). */
  kinds: readonly string[];
  onChange: (kind: string) => void;
}

const WindowKindToggle: React.FC<WindowKindToggleProps> = ({ value, kinds, onChange }) => (
  <SegmentedControl
    label="Fused evaluation window"
    ignoreReselect
    value={kinds.includes(value) ? value : kinds[0]}
    options={kinds.map(k => ({ value: k, label: k }))}
    onChange={onChange}
  />
);

export default WindowKindToggle;
