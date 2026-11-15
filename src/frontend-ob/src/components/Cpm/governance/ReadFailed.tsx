/**
 * CHG-202 (owner, 15 Nov 2026: no backend text): a failed read on Governance, in words, with Retry. The shared QueryError
 * shows the error's own message, which can be the service's detail (a class name, a table, a stack line); this never does.
 */
import React from 'react';
import { EmptyState } from '../shared';

export const READ_FAILED_COPY = 'Try again shortly.';

export const ReadFailed: React.FC<{ title: string; retry: () => void }> = ({ title, retry }) => (
  <EmptyState title={title} copy={READ_FAILED_COPY} action={{ label: 'Retry', onClick: retry }} />
);

export default ReadFailed;
