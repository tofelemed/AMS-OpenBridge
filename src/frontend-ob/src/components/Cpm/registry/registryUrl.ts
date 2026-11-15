/**
 * CHG-201: the Loop Registry list and a loop's own page share one address context. The list's search, status filter, page and
 * plant scope stay in the query when a row opens its loop, so "‹ All loops" returns to the same list. The old `?loop=` names
 * no list state: it is never carried (the list redirects such a link to the loop's page).
 */
import { registryHref } from '../cpaHref';

const query = (current: URLSearchParams | string): string => {
  const q = new URLSearchParams(current);
  q.delete('loop');
  const s = q.toString();
  return s ? `?${s}` : '';
};

/** A loop's page, keeping the list's address. */
export const loopPageHref = (loopId: string, current: URLSearchParams | string): string => `${registryHref(loopId)}${query(current)}`;

/** The list, at the address a loop's page was opened from. */
export const listPageHref = (current: URLSearchParams | string): string => `${registryHref()}${query(current)}`;
