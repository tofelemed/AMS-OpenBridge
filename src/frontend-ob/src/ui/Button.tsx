/**
 * SPEC §6.15: `ObcButton` stays (RD2). This wrapper names the Traverse variants and adds the
 * destructive and accent looks through variables, with no shadow-DOM changes. A disabled action
 * says why, on screen (guide p.7): a disabled button never silently does nothing.
 */
import React, { useId } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive' | 'accent';

const OBC_VARIANT = {
  primary: 'raised',
  outline: 'normal',
  ghost: 'flat',
  destructive: 'raised',
  accent: 'normal',
} as const;

export const Button: React.FC<{
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  /** Why the action is unavailable. Shown while disabled. */
  reason?: string;
  children: React.ReactNode;
}> = ({ variant = 'outline', onClick, disabled, reason, children }) => {
  const id = useId();
  const showReason = !!disabled && !!reason;
  return (
    <span className={`ui-button ui-button--${variant}`}>
      <ObcButton variant={OBC_VARIANT[variant]} disabled={disabled} onClick={onClick} aria-describedby={showReason ? id : undefined}>
        {children}
      </ObcButton>
      {showReason && <span id={id} className="ui-button__reason">{reason}</span>}
    </span>
  );
};
