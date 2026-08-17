'use client';

import React from 'react';
import { T } from '../../styles/theme';
import { ObcButton } from '@oicl/openbridge-webcomponents-react/components/button/button';

/**
 * Prev / "Page X of Y" / Next footer for the client-side paged lists.
 *
 * The alarm & event pages all render from a capped in-memory buffer (the alarm
 * store keeps 500 SOE events, the MQTT store the live device set), so paging is
 * a slice of what is already in hand — no refetch. Renders nothing when the list
 * fits on one page.
 */
export interface ListPagerProps {
  page: number;                     // zero-based, already clamped by the caller
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
  /** Extra note beside the range, e.g. "live — page 1 tracks the newest". */
  note?: string;
}

export const ListPager: React.FC<ListPagerProps> = ({
  page, pageCount, pageSize, total, onPageChange, note,
}) => {
  if (total <= pageSize) return null;

  const from = page * pageSize + 1;
  const to   = Math.min((page + 1) * pageSize, total);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', flexWrap: 'wrap', padding: '10px 20px',
      borderTop: `1px solid ${T.border}`, background: T.bg,
    }}>
      <span style={{ fontSize: '11.5px', color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
        Showing {from}–{to} of {total}{note ? ` · ${note}` : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ObcButton
          variant="flat"
          size="small"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          ← Prev
        </ObcButton>
        <span style={{ fontSize: '11.5px', color: T.textSecondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          Page {page + 1} of {pageCount}
        </span>
        <ObcButton
          variant="flat"
          size="small"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
        >
          Next →
        </ObcButton>
      </div>
    </div>
  );
};

/** Clamped page + slice for a client-side paged list. */
export function usePagedSlice<TItem>(items: TItem[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage  = Math.min(Math.max(0, page), pageCount - 1);
  const pageItems = React.useMemo(
    () => items.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [items, safePage, pageSize],
  );
  return { pageCount, safePage, pageItems };
}
