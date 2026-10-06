/**
 * SME review #21 (CHG-057): an action that is unavailable says why, on screen — not only in a hover title a
 * touch user never sees. The reason shows under the disabled button and is tied to it for screen readers.
 * Paging ("Next" at the last page) and in-progress states do not need it.
 */
import React, { useId } from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

export const ReasonedButton: React.FC<{
  variant?: 'normal' | 'raised' | 'flat';
  disabled?: boolean;
  /** Why the action is unavailable; shown only while disabled. */
  reason?: string | null;
  onClick?: () => void;
  title?: string;
  ariaPressed?: boolean;
  children: React.ReactNode;
}> = ({ variant = 'normal', disabled, reason, onClick, title, ariaPressed, children }) => {
  const id = useId();
  const showReason = !!disabled && !!reason;
  return (
    <span className="cpm-reasoned">
      <ObcButton variant={variant} disabled={disabled} onClick={onClick} title={title ?? (showReason ? reason! : undefined)}
        aria-describedby={showReason ? id : undefined} aria-pressed={ariaPressed}>
        {children}
      </ObcButton>
      {showReason && <span id={id} className="cpm-reasoned__why">{reason}</span>}
    </span>
  );
};

export default ReasonedButton;
