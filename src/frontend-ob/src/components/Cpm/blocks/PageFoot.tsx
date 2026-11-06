/** Quiet links under a page: how a number is worked out, and where the setup lives. */
import React from 'react';

export const PageFoot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <footer className="cpm-page-foot">{children}</footer>
);

export default PageFoot;
