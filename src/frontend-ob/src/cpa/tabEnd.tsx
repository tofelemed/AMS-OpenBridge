/**
 * CHG-128: the end of a destination's tab row. A page hosted as a tab has no heading of its own, because the tab already names
 * it; what the heading carried (12h / 24h, the page's buttons, the ?) sits here instead.
 */
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/** `undefined` outside a tab host; `null` for the moment before the row has mounted. */
export const TabEndContext = createContext<HTMLElement | null | undefined>(undefined);

export const useHostedTab = (): boolean => useContext(TabEndContext) !== undefined;

export const TabEnd: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const node = useContext(TabEndContext);
  if (node === undefined) return <>{children}</>;
  return node ? createPortal(children, node) : null;
};
