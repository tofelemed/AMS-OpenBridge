/** The audit trail lives on Governance, once. This tab says so and opens it; without the audit permission the button says why it is off. */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ReasonedButton } from '../Cpm/ReasonedButton';
import { governanceHref } from '../Cpm/cpaHref';
import { useAuthStore } from '../../store/authStore';

export const AuditLogLink: React.FC = () => {
  const navigate = useNavigate();
  const canAudit = useAuthStore(s => s.hasPermission)('admin.audit.view');
  return (
    <div className="cpm-admin-audit">
      <span>The audit log is on Governance.</span>
      <ReasonedButton
        variant="flat"
        disabled={!canAudit}
        reason="Your role does not include the audit log."
        onClick={() => navigate(governanceHref())}
      >
        Open Governance →
      </ReasonedButton>
    </div>
  );
};

export default AuditLogLink;
