/**
 * CHG-203 (task-19 shared item 6): a failed read in plain words, by what the answer was. The error's own message is the
 * server's detail whenever one is sent (apiFetch.friendlyHttpMessage puts the detail first: a class name, a table, a stack
 * line), so it is never shown; QueryError sends it to the console instead.
 */
export const QUERY_ERROR_WORDS = {
  forbidden: 'You do not have permission to see this.',
  notFound: 'Not found.',
  noAnswer: 'The service did not answer. Try again.',
  other: 'This could not be loaded. Try again.',
} as const;

const statusOf = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === 'number' ? status : null;
};

/** No answer at all: fetch's network failure (Chrome, Firefox, Safari words) or a timeout; not a TypeError from code. */
const noAnswer = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === 'TimeoutError') return true;
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
};

export function queryErrorCopy(error: unknown): string {
  const status = statusOf(error);
  if (status === 403) return QUERY_ERROR_WORDS.forbidden;
  if (status === 404) return QUERY_ERROR_WORDS.notFound;
  if (status === 408 || (status !== null && status >= 500) || (status === null && noAnswer(error))) return QUERY_ERROR_WORDS.noAnswer;
  return QUERY_ERROR_WORDS.other;
}
