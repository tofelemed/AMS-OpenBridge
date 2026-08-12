'use client';

// Session-policy end-of-session dialog (dual-clock: sliding idle + absolute max).
// Shown after endSession('inactivity' | 'expired') — including on the login page,
// because the reason survives the logout state change until dismissed.
import React from 'react';
import { Modal } from './Modal';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';
import { useAuthStore } from '../../store/authStore';

const WORDING = {
  inactivity: {
    title: 'Signed out due to inactivity',
    body: 'Your session ended because there was no activity for the configured idle period. Sign in again to continue.',
  },
  expired: {
    title: 'Session length limit reached',
    body: 'Your session reached its maximum allowed duration and was closed. Sign in again to continue.',
  },
} as const;

export const SessionTimeoutDialog: React.FC = () => {
  const reason = useAuthStore((s) => s.sessionEndReason);
  const clear = useAuthStore((s) => s.clearSessionEndReason);

  if (!reason) return null;
  const { title, body } = WORDING[reason];

  return (
    <Modal
      isOpen
      onClose={clear}
      title={title}
      variant="warning"
      width="420px"
      footer={
        <ObcButton variant="raised" onClick={clear}>
          OK
        </ObcButton>
      }
    >
      <p style={{ margin: 0 }}>{body}</p>
    </Modal>
  );
};

export default SessionTimeoutDialog;
