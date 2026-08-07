/**
 * P1-5 — the single source of truth for a loop's IoTDB device path.
 *
 * Four different sanitizers existed: the writer (IotDbWriteClient.SafeNode)
 * maps every non-alphanumeric to '_' and prefixes a leading digit with '_';
 * six frontend files used `replace(/[^a-zA-Z0-9_-]/g,'_')`, which KEEPS hyphens
 * and adds no digit prefix. So a normally-named DCS tag diverged:
 *
 *   loop id     writer path            old reader path        result
 *   FIC-10409   root...cpm.FIC_10409   root...cpm.FIC-10409   HTTP 400, blank chart
 *   101FIC      root...cpm._101FIC     root...cpm.101FIC      HTTP 200 [], silent blank
 *
 * This mirrors SafeNode exactly. Keep the two in step — if you change one,
 * change src/services/cplm-api/Services/IotDbWriteClient.cs too.
 */

/** Historian tree root for loop data. Must match IotDbWriteOptions.LoopRootPrefix. */
export const LOOP_ROOT_PREFIX =
  (import.meta.env.VITE_LOOP_ROOT_PREFIX as string | undefined) || 'root.site1.cpm';

/** Sanitize a loop id into an IoTDB-safe node name — mirrors SafeNode in C#. */
export function safeNode(loopId: string): string {
  if (!loopId || !loopId.trim()) return 'unknown';
  let s = '';
  for (const ch of loopId) {
    s += /[a-zA-Z0-9]/.test(ch) ? ch : '_';
  }
  return /^[0-9]/.test(s) ? `_${s}` : s;
}

/** Full IoTDB device path for a loop's raw signals. */
export function loopSeries(loopId: string): string {
  return `${LOOP_ROOT_PREFIX}.${safeNode(loopId)}`;
}
