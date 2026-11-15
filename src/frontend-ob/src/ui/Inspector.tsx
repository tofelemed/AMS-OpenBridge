/**
 * SPEC §6.6: a 320 to 400 px panel beside the main view at 1280 px and up, a focus-trapped drawer
 * below. One primary action sits at its foot. Esc closes the drawer and focus returns to the trigger.
 * CHG-190 (owner review 2026-11-14, items 13 and 14): the owner's reference design for a detail panel, opt-in with
 * `variant="reference"`: the title with its ? and its links top right, even label / value rows, a Details grid of
 * buttons, and the one primary action full width on the page colour.
 */
import React, { useId } from 'react';
import { ObiCloseGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-close-google';
import useDialogA11y from '../hooks/useDialogA11y';
import { useShellBand } from './shell/shellHooks';
import './inspector-reference.css';

interface InspectorProps {
  title: string;
  /** A short word above the title, what kind of item it is (CHG-170: a job's role). */
  eyebrow?: string;
  /** A short identifier beside the title, at the head's end (CHG-166: a calculation's id). */
  meta?: React.ReactNode;
  /** CHG-190: a ? beside the title, for what the item is. */
  titleTip?: React.ReactNode;
  /** CHG-190: links to other pages, top right of the head. In the drawer they open the body: the band is the action colour. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** CHG-190: the Details grid (ui/DetailsGrid), between the rows and the foot. */
  details?: React.ReactNode;
  /** The panel's one primary action (SPEC §3). */
  primaryAction?: React.ReactNode;
  /** CHG-190: `reference` is the owner's detail-panel design (even rows, full-width primary on the page colour). */
  variant?: 'default' | 'reference';
}

const Body: React.FC<InspectorProps & { titleId: string; onClose?: () => void }> = ({ title, eyebrow, meta, titleTip, actions, titleId, children, details, primaryAction, onClose }) => {
  const h2 = <h2 id={titleId} className="ui-inspector__title">{title}</h2>;
  const heading = titleTip ? <span className="ui-inspector__title-row">{h2}{titleTip}</span> : h2;
  return (
    <>
      <div className="ui-inspector__head">
        {eyebrow ? (
          <div className="ui-inspector__heading">
            <span className="ui-inspector__eyebrow">{eyebrow}</span>
            {heading}
          </div>
        ) : heading}
        {meta != null && <span className="ui-inspector__meta">{meta}</span>}
        {actions && !onClose && <span className="ui-inspector__actions">{actions}</span>}
        {onClose && (
          <button type="button" className="ui-control ui-control--ghost ui-control--icon" aria-label="Close inspector" onClick={onClose}>
            <span className="ui-icon"><ObiCloseGoogle /></span>
          </button>
        )}
      </div>
      <div className="ui-inspector__body">
        {actions && onClose && <div className="ui-inspector__actions ui-inspector__actions--body">{actions}</div>}
        {children}
      </div>
      {details}
      {primaryAction && <div className="ui-inspector__foot">{primaryAction}</div>}
    </>
  );
};

const classOf = (variant: InspectorProps['variant'], drawer: boolean) =>
  ['ui-inspector', drawer && 'ui-inspector--drawer', variant === 'reference' && 'ui-inspector--reference'].filter(Boolean).join(' ');

const Drawer: React.FC<InspectorProps & { titleId: string; onClose: () => void }> = props => {
  const ref = useDialogA11y<HTMLDivElement>(props.onClose);
  return (
    <div className="ui-overlay">
      <div className="ui-overlay__scrim" aria-hidden="true" onClick={props.onClose} />
      <div ref={ref} className={classOf(props.variant, true)} role="dialog" aria-modal="true" aria-labelledby={props.titleId}>
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
    return <aside className={classOf(rest.variant, false)} aria-labelledby={titleId}><Body {...rest} titleId={titleId} /></aside>;
  }
  return open ? <Drawer {...rest} titleId={titleId} onClose={onClose} /> : null;
};

/** The main view beside its inspector. Below 1280 px the main view takes the full width. */
export const WithInspector: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-with-inspector">{children}</div>
);
