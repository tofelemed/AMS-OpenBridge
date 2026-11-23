/**
 * CHG-169 (owner answer 2a): Roll back asks first (it acted on the first click). The dialog names the activation it rolls back
 * and the version that runs again. The server chooses that version (the most recently updated SUPERSEDED or ACTIVE_VERIFIED
 * bundle of the same scope, other than this one); the dialog reads the scope's versions only once it opens and applies the same
 * rule to name it, and says "The bundle that ran before it" until they are read or when none qualifies. Roll back here sends
 * the same request as before: the rollback of the verified activation.
 * CHG-220 (Gate Configuration check, gap 4): the version that runs again is the server's own answer (`rollbackTarget`), no longer
 * worked out here from the scope's versions by a rule that picked the wrong one after a supersede or a second click.
 * Task 8 (journey): the title names the version that runs again ("Roll back to Own settings v11"); one line says what goes back
 * ("Region maximum goes back from 125 to 120") when the two versions are known (additive optional prop `changes`).
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../../ui/Dialog';
import type { Bundle, Deployment } from '../../../api/cpm/config';
import { settingName, valueWords } from './configWords';
import { versionLabel } from './levelWords';
import type { SettingChange } from './lifecycle';

/** "Region maximum goes back from 125 to 120"; more than two read "… and 3 more". */
export const goesBackWords = (changes: SettingChange[]): string | null => {
  if (changes.length === 0) return null;
  const line = changes.slice(0, 2).map(c => `${settingName(c.property)} goes back from ${valueWords(c.before)} to ${valueWords(c.after)}`).join('; ');
  return changes.length > 2 ? `${line} and ${changes.length - 2} more` : line;
};

const Body: React.FC<{ bundle: Bundle; activation: Deployment; changes?: SettingChange[]; onCancel: () => void; onConfirm: () => void }> = ({ bundle, activation, changes = [], onCancel, onConfirm }) => {
  const target = activation.rollbackTarget ?? null;
  const line = goesBackWords(changes);
  return (
    <Dialog open onClose={onCancel} title={target ? `Roll back to ${versionLabel({ scopeKind: bundle.scopeKind, version: target.version })}` : 'Roll back to the previous version'}
      footer={<>
        <ObcButton variant="flat" onClick={onCancel}>Cancel</ObcButton>
        <ObcButton variant="raised" onClick={onConfirm}>Roll back</ObcButton>
      </>}>
      {line && <p>{line}</p>}
    </Dialog>
  );
};

/** On the page body, so the panel's own box (or its drawer) never clips it. */
export const RollbackDialog: React.FC<{ open: boolean; bundle: Bundle; activation: Deployment; changes?: SettingChange[]; onCancel: () => void; onConfirm: () => void }> = ({ open, ...props }) =>
  (open ? createPortal(<Body {...props} />, document.body) : null);

export default RollbackDialog;
