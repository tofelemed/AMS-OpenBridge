/**
 * CHG-140: the window Historical selects. A window named in the address is that window, compared by instant, or it is
 * not found: never the newest in its place. With no window named, the newest is the default.
 */
import type { HistoryWindow } from './useWindowKpis';
import { instantMs } from '../evidence/useWindowAt';

/** `windows` is oldest first, as the page holds them. */
export function selectedWindowOf(windows: HistoryWindow[], endParam: string | null): { window: HistoryWindow | undefined; notFound: boolean } {
  if (!endParam) return { window: windows[windows.length - 1], notFound: false };
  const ms = instantMs(endParam);
  const window = Number.isFinite(ms) ? windows.find(w => instantMs(w.windowEnd) === ms) : undefined;
  return { window, notFound: !window && (windows.length > 0 || !Number.isFinite(ms)) };
}
