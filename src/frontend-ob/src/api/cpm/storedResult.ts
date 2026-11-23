/**
 * CHG-226: a loop's 12 h / 24 h result kept on screen until a new one arrives. Wherever cplm-api serves a loop's result (the
 * fleet KPI drill-down rows, the rankings and priority queue, the heat map, gates/latest), the item may say that the result
 * shown is the loop's last stored one. Every field is optional: absent (an older cplm-api, or a new result) = not a stored result.
 */
export interface CpmStoredResult {
  /** True when the result shown is the loop's last stored result, kept while new results are being prepared. */
  lastStored?: boolean | null;
  /** ISO time of the result shown. */
  resultAt?: string | null;
  /** ISO time since when new results are being prepared; null when they are not. */
  updatingSince?: string | null;
}
