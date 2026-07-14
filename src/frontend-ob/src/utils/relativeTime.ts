/** "3m ago" / "2h ago" / "5d ago" — shared by the display list, the launcher and the designer header. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'never';

  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Full timestamp for a tooltip, so the relative label is never the only source of truth. */
export function absoluteTime(iso?: string | null): string {
  if (!iso) return 'never published';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : 'never published';
}
