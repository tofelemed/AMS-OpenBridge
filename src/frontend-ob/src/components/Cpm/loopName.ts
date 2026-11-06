/**
 * CHG-128: what a loop is, without repeating its tag. Beside the tag, "Flow controller FIC00701 (FCS0102)" reads
 * "Flow controller (FCS0102)". Display only: the registry keeps the full name, and search still matches it.
 */
export function serviceName(loop: { loopId: string; displayName?: string | null }): string {
  const name = loop.displayName?.trim() ?? '';
  if (!name) return '';
  const tag = loop.loopId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shorter = name.replace(new RegExp(`(^|\\s)${tag}(?=\\s|$)`, 'g'), '$1').replace(/\s{2,}/g, ' ').trim();
  return shorter || name;
}
