'use client';

import React from 'react';

interface PriorityBadgeProps {
  priority: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const p = priority?.toUpperCase() ?? 'LOW';
  return (
    <span className={`priority-badge priority-badge--${p.toLowerCase()}`}>
      {p}
    </span>
  );
};
