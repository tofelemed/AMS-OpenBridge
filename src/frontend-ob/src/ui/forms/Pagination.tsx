/**
 * SPEC §6.5 pager (K-10): four named buttons and one page-status line, so four Tab stops however
 * many pages there are. A button at the end of the range stays focusable, marked `aria-disabled`,
 * because a natively disabled button would drop focus the moment the last page is reached; the
 * status line is its reason.
 */
import React, { useId } from 'react';
import { ObiChevronDoubleLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-double-left-google';
import { ObiChevronDoubleRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-double-right-google';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';

export const Pagination: React.FC<{
  /** 1-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  label?: string;
}> = ({ page, pageCount, onChange, label = 'Pagination' }) => {
  const statusId = useId();
  const pages = Math.max(1, pageCount);
  const current = Math.max(1, Math.min(page, pages));

  const button = (name: string, target: number, icon: React.ReactNode) => {
    const unavailable = target === current;
    return (
      <button
        type="button"
        className="ui-control ui-control--icon"
        aria-label={name}
        aria-disabled={unavailable || undefined}
        aria-describedby={unavailable ? statusId : undefined}
        onClick={() => { if (!unavailable) onChange(target); }}
      >
        <span className="ui-icon ui-icon--small">{icon}</span>
      </button>
    );
  };

  return (
    <nav className="ui-pagination" aria-label={label}>
      {button('First page', 1, <ObiChevronDoubleLeftGoogle />)}
      {button('Previous page', Math.max(1, current - 1), <ObiChevronLeftGoogle />)}
      <span id={statusId} className="ui-pagination__status" aria-live="polite">Page {current} of {pages}</span>
      {button('Next page', Math.min(pages, current + 1), <ObiChevronRightGoogle />)}
      {button('Last page', pages, <ObiChevronDoubleRightGoogle />)}
    </nav>
  );
};
