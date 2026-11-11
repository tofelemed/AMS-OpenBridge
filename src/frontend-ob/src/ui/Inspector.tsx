/**
 * SPEC §6.6: a 320 to 400 px panel beside the main view at 1280 px and up, a focus-trapped drawer
 * below. One primary action sits at its foot. Esc closes the drawer and focus returns to the trigger.
 */
import React, { useId } from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import useDialogA11y from '../hooks/useDialogA11y';
import { useShellBand } from './shell/shellHooks';

interface InspectorProps {
  title: string;
  /** A short word above the title, what kind of item it is (CHG-170: a job's role). */
  eyebrow?: string;
  /** A short identifier beside the title, at the head's end (CHG-166: a calculation's id). */
  meta?: React.ReactNode;
  children: React.ReactNode;
  /** The panel's one primary action (SPEC §3). */
  primaryAction?: React.ReactNode;
}

const Body: React.FC<InspectorProps & { titleId: string; onClose?: () => void }> = ({ title, eyebrow, meta, titleId, children, primaryAction, onClose }) => (
  <>
    <div className="ui-inspector__head">
      {eyebrow ? (
        <div className="ui-inspector__heading">
          <span className="ui-inspector__eyebrow">{eyebrow}</span>
          <h2 id={titleId} className="ui-inspector__title">{title}</h2>
        </div>
      ) : <h2 id={titleId} className="ui-inspector__title">{title}</h2>}
      {meta != null && <span className="ui-inspector__meta">{meta}</span>}
      {onClose && (
        <button type="button" className="ui-control ui-control--ghost ui-control--icon" aria-label="Close inspector" onClick={onClose}>
          <span className="ui-icon"><ObiCloseGoogle /></span>
        </button>
      )}
    </div>
    <div className="ui-inspector__body">{children}</div>
    {primaryAction && <div className="ui-inspector__foot">{primaryAction}</div>}
  </>
);

const Drawer: React.FC<InspectorProps & { titleId: string; onClose: () => void }> = props => {
  const ref = useDialogA11y<HTMLDivElement>(props.onClose);
  return (
    <div className="ui-overlay">
      <div className="ui-overlay__scrim" aria-hidden="true" onClick={props.onClose} />
      <div ref={ref} className="ui-inspector ui-inspector--drawer" role="dialog" aria-modal="true" aria-labelledby={props.titleId}>
        <Body {...props} />
      </div>
    </div>
  );
};

export const Inspector: React.FC<InspectorProps & {
  /** Below 1280 px the drawer shows only while open. Persistent panels ignore this. */
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose, ...rest }) => {
  const band = useShellBand();
  const titleId = useId();
  if (band === 'wide') {
    return <aside className="ui-inspector" aria-labelledby={titleId}><Body {...rest} titleId={titleId} /></aside>;
  }
  return open ? <Drawer {...rest} titleId={titleId} onClose={onClose} /> : null;
};

/** The main view beside its inspector. Below 1280 px the main view takes the full width. */
export const WithInspector: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-with-inspector">{children}</div>
);
