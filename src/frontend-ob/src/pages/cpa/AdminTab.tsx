/** An Administration section inside a Setup or System tab, in the same card as on the old page. */
import React from 'react';

export const AdminTab: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="dest__panel">
    <h1 className="ui-sr">{title}</h1>
    {children}
  </div>
);
