/**
 * The pager: first, previous, numbered pages, next, last, and one status line. Numbered jumps show the
 * pages around the current one, with the first and last always in reach. A button at the end of the
 * range stays focusable, marked `aria-disabled`, because a natively disabled button would drop focus
 * the moment the last page is reached; the status line is its reason.
 */
import React, { useId } from 'react';
import { ObiChevronDoubleLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-double-left-google';
import { ObiChevronDoubleRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-double-right-google';
import { ObiChevronLeftGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-left-google';
import { ObiChevronRightGoogle } from '@oicl/openbridge-webcomponents-react/icons/icon-chevron-right-google';

/** The pages to offer: the ends, and two either side of the current page. A gap is null. */
export function pageWindow(current: number, pages: number): Array<number | null> {
  const wanted = new Set([1, pages]);
  for (let p = current - 2; p <= current + 2; p++) if (p >= 1 && p <= pages) wanted.add(p);
  const sorted = [...wanted].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

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
      {pageWindow(current, pages).map((p, i) => (p == null
        ? <span key={`gap-${i}`} className="ui-pagination__gap" aria-hidden="true">…</span>
        : (
          <button
            key={p}
            type="button"
            className="ui-control ui-control--icon ui-pagination__page"
            aria-current={p === current ? 'page' : undefined}
            onClick={() => { if (p !== current) onChange(p); }}
          >
            <span className="ui-sr">Page </span>{p}
          </button>
        )))}
      <span id={statusId} className="ui-pagination__status" aria-live="polite">Page {current} of {pages}</span>
      {button('Next page', Math.min(pages, current + 1), <ObiChevronRightGoogle />)}
      {button('Last page', pages, <ObiChevronDoubleRightGoogle />)}
    </nav>
  );
};
