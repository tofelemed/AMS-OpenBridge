/** The one CPA age format (CHG-065): words for days. Its own module so vocabulary-level files can use it without a cycle. */
export function ageText(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 36 * 3_600_000) return `${Math.round(ms / 3_600_000)} h ago`;
  const d = Math.round(ms / 86_400_000);
  return `${d} day${d === 1 ? '' : 's'} ago`;   // CHG-065: the one CPA age format (words for days)
}
