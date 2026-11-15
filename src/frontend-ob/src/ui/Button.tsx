/**
 * SPEC §6.15: `ObcButton` stays (RD2). CHG-183 (owner review 2026-11-14, item 17): the app's one button standard.
 * primary = the one main action of a panel or dialog; secondary = every other action (Secondary A); destructive =
 * confirms a delete or retire; ghost = icon-only and close buttons; link = opens another page. The looks come
 * from variables (styles/button-standard.css, ui/components.css), with no shadow-DOM changes. A disabled action
 * says why, on screen (guide p.7): a disabled button never silently does nothing.
 */
import React, { useId } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'link';

const OBC_VARIANT = {
  primary: 'raised',
  secondary: 'normal',
  destructive: 'raised',
  ghost: 'flat',
  link: 'flat',
} as const;

/** The opt-out classes the bridge styles on the ObcButton host. */
const HOST_CLASS: Partial<Record<ButtonVariant, string>> = { ghost: 'ui-ghost', link: 'ui-link' };

export const Button: React.FC<{
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  /** Why the action is unavailable. Shown while disabled. */
  reason?: string;
  children: React.ReactNode;
}> = ({ variant = 'secondary', onClick, disabled, reason, children }) => {
  const id = useId();
  const showReason = !!disabled && !!reason;
  return (
    <span className={`ui-button ui-button--${variant}`}>
      <ObcButton variant={OBC_VARIANT[variant]} className={HOST_CLASS[variant]} disabled={disabled} onClick={onClick}
        aria-describedby={showReason ? id : undefined}>
        {children}
      </ObcButton>
      {showReason && <span id={id} className="ui-button__reason">{reason}</span>}
    </span>
  );
};
