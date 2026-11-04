/**
 * SPEC §5.1 review filters, with counts. A count the server has not given shows nothing, never 0. A
 * filter reached from the legend or an old link joins the set while it is active, so the pressed
 * option always names what the table shows.
 */
import React from 'react';
import { SegmentedControl } from '../../../ui/SegmentedControl';
import { EXTRA_FILTERS, REVIEW_FILTERS, type ReviewKey } from './reviewFilters';

export const ReviewFilterSet: React.FC<{
  review: ReviewKey;
  countOf: (key: ReviewKey) => string | number | null;
  onChange: (key: ReviewKey) => void;
}> = ({ review, countOf, onChange }) => {
  const extra = EXTRA_FILTERS.find(f => f.key === review);
  const options = [...REVIEW_FILTERS, ...(extra ? [extra] : [])].map(f => {
    const count = countOf(f.key);
    return { value: f.key, label: <>{f.label}{count != null && <span className="ov-count"> {count}</span>}</> };
  });
  return <SegmentedControl wrap label="Review filter" options={options} value={review} onChange={onChange} />;
};
