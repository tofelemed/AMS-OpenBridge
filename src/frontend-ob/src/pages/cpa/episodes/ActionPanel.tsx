/** An open action form. Focus moves into it, so the keyboard does not have to find it. */
import React, { useEffect, useRef } from 'react';

export const ActionPanel: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div ref={ref} className="episode__form" role="group" aria-label={label} tabIndex={-1}>
      {children}
    </div>
  );
};

export const refusal = (error: unknown, fallback: string): string =>
  (error instanceof Error && error.message ? error.message : fallback);
