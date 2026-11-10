/**
 * SPEC §6.10 accordion (K-07): native `details`. The caller owns `open`, so a summary click asks for
 * the change rather than letting the browser flip the element by itself; Enter and Space on a
 * summary arrive here as the same click.
 */
import React from 'react';
import { ObiChevronDownGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-down-google';
import { useDisabledReason } from './field';

export const Accordion: React.FC<{
  label: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  disabled?: boolean;
  reason?: string | null;
  /** One quiet line under the label, saying what is inside (CHG-158). */
  hint?: string;
  children: React.ReactNode;
}> = ({ label, open, onToggle, disabled, reason, hint, children }) => {
  const why = useDisabledReason(disabled, reason);
  return (
    <>
      <details className="ui-accordion" open={open}>
        <summary
          className="ui-accordion__summary"
          aria-disabled={disabled || undefined}
          aria-describedby={why.describedBy}
          onClick={e => {
            e.preventDefault();
            if (!disabled) onToggle(!open);
          }}
        >
          {hint ? (
            <span className="ui-accordion__text">
              <span className="ui-accordion__label">{label}</span>
              <span className="ui-accordion__hint">{hint}</span>
            </span>
          ) : <span className="ui-accordion__label">{label}</span>}
          <span className="ui-icon ui-accordion__chevron"><ObiChevronDownGoogle /></span>
        </summary>
        {children}
      </details>
      {why.note}
    </>
  );
};
