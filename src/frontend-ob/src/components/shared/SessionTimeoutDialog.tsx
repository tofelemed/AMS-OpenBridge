'use client';

// Session-policy end-of-session dialog (dual-clock: sliding idle + absolute max).
// Shown after endSession('inactivity' | 'expired') — including on the login page,
// because the reason survives the logout state change until dismissed.
// Owner, 12 Nov 2026: the Traverse dialog (neutral chrome) instead of the old warning modal — amber is reserved for
// process alarms and a session ending is not one; one short sentence per reason; the button says what comes next.
import React from 'react';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { Dialog } from '../../ui/Dialog';
import { useAuthStore } from '../../store/authStore';

const WORDING = {
  inactivity: { title: 'Signed out', body: 'No activity for the idle period. Sign in to continue.' },
  expired: { title: 'Session ended', body: 'The session reached its time limit. Sign in to continue.' },
} as const;

export const SessionTimeoutDialog: React.FC = () => {
  const reason = useAuthStore((s) => s.sessionEndReason);
  const clear = useAuthStore((s) => s.clearSessionEndReason);

  if (!reason) return null;
  const { title, body } = WORDING[reason];

  return (
    <Dialog open onClose={clear} title={title}
      footer={<ObcButton variant="raised" onClick={clear}>Sign in</ObcButton>}>
      <p className="cpm-copy">{body}</p>
    </Dialog>
  );
};

export default SessionTimeoutDialog;
