/**
 * SPEC §6.12: a short state title, its reason and one recovery action (G06). Phase 2 needs the
 * restricted state; Phase 3 adds the rest of the kinds to this component.
 */
import React from 'react';

export const DataState: React.FC<{
  kind: 'restricted';
  title?: string;
  reason?: string;
  action?: React.ReactNode;
}> = ({ kind, title, reason, action }) => (
  <div className={`ui-state ui-state--${kind}`} role="status" data-testid={`state-${kind}`}>
    <h2 className="ui-state__title">{title ?? 'Not available for your role'}</h2>
    {reason && <p className="ui-state__reason">{reason}</p>}
    {action && <div className="ui-state__action">{action}</div>}
  </div>
);
