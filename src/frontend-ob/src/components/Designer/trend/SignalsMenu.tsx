'use client';

/**
 * CHG-175 (owner's answer 4): "Signals ▾" in the chart's head row brings a removed pen back. It lists the loop's roles,
 * ticked while drawn; a role the registry has not mapped is listed and cannot be ticked (VP says why, as on Historical's
 * chip). Ticking writes the same `roles=` the legend's × writes.
 */
import React from 'react';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import type { CpmLoop } from '../../../api/cpmApi';
import { Popover } from '../../../ui/Popover';
import { vpChipNote } from '../../Cpm/historical/RangeToolbar';
import { PEN_ROLES, type PenRole } from './loopPens';

export const SignalsMenu: React.FC<{
  loop: CpmLoop;
  /** The roles drawn now. */
  shown: PenRole[];
  onChange: (roles: PenRole[]) => void;
}> = ({ loop, shown, onChange }) => (
  <Popover
    label="Signals"
    align="end"
    trigger={t => (
      <button type="button" className="ui-control ui-control--ghost" {...t}>
        Signals <span className="ui-icon ui-icon--small"><ObiChevronDownGoogle /></span>
      </button>
    )}
  >
    <div className="trend-signals">
      {PEN_ROLES.map(role => {
        const mapped = !!loop.tags?.[role];
        const note = mapped ? null : (role === 'VP' ? vpChipNote(loop)?.text : null) ?? 'unmapped';
        return (
          <label key={role} className="ui-checkbox trend-signals__row">
            <input type="checkbox" className="ui-checkbox__box" disabled={!mapped} checked={mapped && shown.includes(role)}
              onChange={e => onChange(PEN_ROLES.filter(r => (r === role ? e.target.checked : shown.includes(r))))} />
            <span className="trend-core__swatch" aria-hidden="true" style={{ background: `var(--signal-${role.toLowerCase()})` }} />
            <span>{role}</span>
            {note && <span className="trend-signals__note">{note}</span>}
          </label>
        );
      })}
    </div>
  </Popover>
);

export default SignalsMenu;
