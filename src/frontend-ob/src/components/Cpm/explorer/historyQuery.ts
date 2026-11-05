/**
 * sort:'recent' is load-bearing, not a preference: the endpoint's default order
 * is triage (open first, then peak confidence), so under the default this LIMIT
 * kept the highest-CONFIDENCE frames while the tab rendered them as a timeline.
 */
export const HISTORY_QUERY = {
  openOnly: false, includeShelved: true, limit: 50, sort: 'recent' as const,
};
