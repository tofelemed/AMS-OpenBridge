/**
 * CHG-172 (owner review, the approved sample docs/theme/redesign/samples/administration-proposal.html, badge 1): the open tab's
 * own actions sit top right in the page header, beside How to read; they were a bar inside each tab's card. The page header
 * holds an empty slot and each tab puts its buttons there. A tab rendered on its own (a test) keeps them in place.
 */
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/** The header's slot: undefined outside the page, null until the header has mounted. */
export const AdminActionsSlot = createContext<HTMLElement | null | undefined>(undefined);

export const AdminActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const slot = useContext(AdminActionsSlot);
  if (slot === undefined) return <div className="cpm-admin-actions">{children}</div>;
  return slot ? createPortal(children, slot) : null;
};

export default AdminActions;
