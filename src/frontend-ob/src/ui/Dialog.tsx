/**
 * SPEC §6.11: focus starts inside and is trapped, including buttons in shadow roots. Esc closes and
 * focus returns to the trigger. The close control has a name, and Tab reaches the footer.
 */
import React, { useId } from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import useDialogA11y from '../hooks/useDialogA11y';

const Open: React.FC<DialogProps & { onClose: () => void }> = ({ title, description, onClose, children, footer, size = 'default' }) => {
  const ref = useDialogA11y<HTMLDivElement>(onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <div className="ui-overlay ui-overlay--centre">
      <div className="ui-overlay__scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={ref}
        className={`ui-dialog ui-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <div className="ui-dialog__head">
          <h2 id={titleId} className="ui-dialog__title">{title}</h2>
          <button type="button" className="ui-control ui-control--ghost ui-control--icon" aria-label="Close dialog" onClick={onClose}>
            <span className="ui-icon"><ObiCloseGoogle /></span>
          </button>
        </div>
        {description && <p id={descId} className="ui-dialog__description">{description}</p>}
        <div className="ui-dialog__body">{children}</div>
        {footer && <div className="ui-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
};

interface DialogProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Actions, right-aligned, primary last (skill contract). */
  footer?: React.ReactNode;
  size?: 'default' | 'wide';
}

export const Dialog: React.FC<DialogProps & { open: boolean; onClose: () => void }> = ({ open, ...rest }) =>
  (open ? <Open {...rest} /> : null);
