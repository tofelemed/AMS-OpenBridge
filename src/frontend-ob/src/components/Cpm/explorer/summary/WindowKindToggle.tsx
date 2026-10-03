'use client';

/**
 * Explorer › Summary — the fused window kind picker (12h / 24h) for the gate strip.
 *
 * Same contract as the Performance page's toggle: the value lives in `?window=`;
 * the group can emit an empty value on its first update (its slot is not assigned
 * yet when willUpdate runs) and a stale bookmark can name a kind the engine does
 * not fuse, so only a served kind reaches `onChange`.
 */
import React from 'react';
import { ObcToggleButtonGroup } from '@oicl/openbridge-webcomponents-react/components/toggle-button-group/toggle-button-group';
import { ObcToggleButtonOption } from '@oicl/openbridge-webcomponents-react/components/toggle-button-option/toggle-button-option';

export interface WindowKindToggleProps {
  value: string;
  /** The fused kinds the engine serves (`resolutions.fusion.firesOn`). */
  kinds: readonly string[];
  onChange: (kind: string) => void;
}

const WindowKindToggle: React.FC<WindowKindToggleProps> = ({ value, kinds, onChange }) => (
  <ObcToggleButtonGroup
    value={value}
    aria-label="Fused evaluation window"
    onValue={(e: CustomEvent<{ value: string }>) => {
      const v = e.detail.value;
      if (kinds.includes(v)) onChange(v);
    }}
  >
    {kinds.map(k => (
      <ObcToggleButtonOption key={k} value={k}>{k}</ObcToggleButtonOption>
    ))}
  </ObcToggleButtonGroup>
);

export default WindowKindToggle;
