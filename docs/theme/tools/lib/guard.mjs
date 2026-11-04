// Read-only guard and request pacing for the deep analysis. Everything here runs in the capture browser.
// Aborts every non-GET API call outside the allowlist, paces API requests, and records 429s.
import fs from 'node:fs';

export const READ_POSTS = ['/api/v1/cpm/method-runs/evidence/batch', '/api/bindings/resolve/batch'];

const BASE_DENY = ['Save', 'Submit', 'Apply', 'Acknowledge', 'Shelve', 'Unshelve', 'Run', 'Re-run', 'Evaluate', 'Recompute', 'Reconstruct',
  'Republish', 'Re-project', 'Import', 'Test', 'Delete', 'Deploy', 'Approve', 'Reject', 'Activate', 'Update loop', 'Sign out', 'New draft',
  'New version', 'Set', 'Reset to inherited', 'Rollback', 'Roll back', 'Verify', 'Link to this episode', 'Save note', 'Create', 'Remove', 'Revoke',
  'Enable', 'Disable', 'Start', 'Stop', 'Promote', 'Retire', 'Publish', 'Download', 'Export'];

/** Deny-list regex: built-in labels plus those proved from source (deep/data/deny-list.json), when present. */
export function denyPattern(file) {
  let extra = [];
  if (fs.existsSync(file)) {
    try { extra = JSON.parse(fs.readFileSync(file, 'utf8')).labels ?? []; } catch { /* still being written */ }
  }
  const labels = [...new Set([...BASE_DENY, ...extra])].filter(Boolean);
  return `(^|\\b)(${labels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(\\b|$)`;
}

/**
 * ratePerMin refills the bucket; burst keeps a route's first load close to real timing.
 * log collects blocked calls, 429s and pacing waits; log.trigger names the control being activated.
 */
export async function installGuard(page, log, { ratePerMin = 60, burst = 30 } = {}) {
  let tokens = burst;
  let last = Date.now();
  const rule = { fail: null, delayMs: 0 };
  const take = async () => {
    for (;;) {
      const now = Date.now();
      tokens = Math.min(burst, tokens + ((now - last) / 60000) * ratePerMin);
      last = now;
      if (tokens >= 1) { tokens -= 1; return; }
      log.pacedMs += 250;
      await new Promise(r => setTimeout(r, 250));
    }
  };
  await page.route('**/api/**', async route => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const read = ['GET', 'HEAD', 'OPTIONS'].includes(req.method());
    if (!read && !p.startsWith('/api/auth/') && !READ_POSTS.some(a => p.startsWith(a))) {
      log.blocked.push({ method: req.method(), path: p, trigger: log.trigger ?? null });
      return route.abort();
    }
    if (rule.fail?.test.test(p)) {
      return route.fulfill({ status: rule.fail.status, contentType: 'application/json', body: JSON.stringify({ title: 'Simulated by the capture tool' }) });
    }
    if (rule.delayMs && !p.startsWith('/api/auth')) await new Promise(r => setTimeout(r, rule.delayMs));
    await take();
    log.apiCalls += 1;
    return route.continue().catch(() => {});
  });
  page.on('response', r => {
    if (r.status() === 429) log.http429.push(new URL(r.url()).pathname);
  });
  return rule;
}

/** Proves the guard: a synthetic POST must be aborted before it leaves the browser. */
export async function proveGuard(page, log) {
  const before = log.blocked.length;
  log.trigger = 'read-only proof';
  const outcome = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/v1/cpm/loops', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
      return `reached server: ${r.status}`;
    } catch (e) { return `aborted: ${e.name}`; }
  });
  const proof = { outcome, blockedDelta: log.blocked.length - before };
  log.blocked.length = before;
  log.trigger = null;
  return proof;
}
