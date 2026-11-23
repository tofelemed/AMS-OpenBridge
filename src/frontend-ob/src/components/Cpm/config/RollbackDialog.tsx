/**
 * CHG-169 (owner answer 2a): Roll back asks first (it acted on the first click). The dialog names the activation it rolls back
 * and the version that runs again. The server chooses that version (the most recently updated SUPERSEDED or ACTIVE_VERIFIED
 * bundle of the same scope, other than this one); the dialog reads the scope's versions only once it opens and applies the same
 * rule to name it, and says "The bundle that ran before it" until they are read or when none qualifies. Roll back here sends
 * the same request as before: the rollback of the verified activation.
 * CHG-220 (Gate Configuration check, gap 4): the version that runs again is the server's own answer (`rollbackTarget`), no longer
 * worked out here from the scope's versions by a rule that picked the wrong one after a supersede or a second click.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import { KvRow } from '../shared';
import type { Bundle, Deployment } from '../../../api/cpm/config';
import { stampZoned } from './configWords';

const Body: React.FC<{ bundle: Bundle; activation: Deployment; onCancel: () => void; onConfirm: () => void }> = ({ bundle, activation, onCancel, onConfirm }) => {
  const target = activation.rollbackTarget ?? null;
  return (
    <Dialog open onClose={onCancel} title="Roll back to the previous bundle"
      footer={<>
        <ObcButton variant="flat" onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" onClick={onConfirm}>Roll back</ObcButton>
      </>}>
      <KvRow label="Rolls back">The activation of v{bundle.version}, {stampZoned(activation.createdAt)}</KvRow>
      <KvRow label="Active again">
        {target
          ? <><span>v{target.version}</span><div className="cpm-event-row__sub">The bundle that ran before it</div></>
          : 'The bundle that ran before it'}
      </KvRow>
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const RollbackDialog: React.FC<{ open: boolean; bundle: Bundle; activation: Deployment; onCancel: () => void; onConfirm: () => void }> = ({ open, ...props }) =>
  (open ? createPortal(<Body {...props} />, document.body) : null);

export default RollbackDialog;
