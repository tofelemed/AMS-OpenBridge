// Concurrency proof for the gateway under a Redis stall (2026-09-17): 40 concurrent reads per round,
// three rounds healthy and three rounds with Redis PAUSED, per-round p50 / p99 / max and the count of
// non-200 answers. Before the rewrite every in-flight request waited on Redis together (+7 s across
// the board); now the first few requests pay one bounded timeout and the rest decide in-process.
// Run from scripts/validation:  node gw-redis-stall-load.mjs   (env: GW_BASE, UI_USER, UI_PASS, REDIS_CONTAINER, CONCURRENCY, ROUNDS)
import { execFileSync } from 'node:child_process';

const BASE = process.env.GW_BASE ?? 'http://localhost:8081';
const REDIS = process.env.REDIS_CONTAINER ?? 'ams-redis';
const N = Number(process.env.CONCURRENCY ?? 40);
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const docker = (...args) => { try { execFileSync('docker', args, { stdio: 'ignore' }); } catch { /* already in that state */ } };

const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: process.env.UI_USER ?? 'admin', password: process.env.UI_PASS ?? 'ChangeMe123!' }) });
const { token } = await login.json();
if (!token) { console.error('login failed'); process.exit(2); }

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function round(label) {
  const results = await Promise.all(Array.from({ length: N }, async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(`${BASE}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } });
      return { ms: performance.now() - t0, status: r.status, source: r.headers.get('x-ratelimit-source') };
    } catch (e) { return { ms: performance.now() - t0, status: 0, source: String(e.code ?? e) }; }
  }));
  const ms = results.map(r => r.ms);
  const bad = results.filter(r => r.status !== 200).length;
  const sources = [...new Set(results.map(r => r.source))].join(',');
  console.log(`${label.padEnd(18)} n=${N} p50=${pct(ms, 0.5).toFixed(0)}ms p99=${pct(ms, 0.99).toFixed(0)}ms max=${Math.max(...ms).toFixed(0)}ms non-200=${bad} sources=${sources}`);
  return { p99: pct(ms, 0.99), max: Math.max(...ms), bad };
}

let failed = 0;
for (let i = 1; i <= ROUNDS; i++) await round(`healthy #${i}`);
docker('pause', REDIS);
try {
  for (let i = 1; i <= ROUNDS; i++) {
    const r = await round(`redis paused #${i}`);
    if (r.bad > 0) { failed++; console.log(`  FAIL ${r.bad} non-200 answers while Redis is paused`); }
    if (r.max > 1500) { failed++; console.log(`  FAIL max ${r.max.toFixed(0)} ms while Redis is paused (bound 1500)`); }
  }
} finally {
  docker('unpause', REDIS);
}
await new Promise(r => setTimeout(r, 1000));
await round('redis back');
const status = await (await fetch(`${BASE}/gw/ratelimit`)).json();
console.log('ratelimit status:', JSON.stringify(status));
console.log(failed ? `\n=== FAIL (${failed}) ===` : '\n=== PASS: every request answered 200 within the bound while Redis was paused ===');
process.exit(failed ? 1 : 0);
