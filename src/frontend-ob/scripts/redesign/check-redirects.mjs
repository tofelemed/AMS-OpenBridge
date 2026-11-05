#!/usr/bin/env node
// PRM-004 gate: SPEC §2.3, every row, parameters included. Reads the rows from the SPEC so a new row
// cannot go untested, then checks the live table in src/cpa/redirects.ts. A row that is on is also
// opened in a browser when CPA_BASE_URL is set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '../..');
const repo = path.resolve(web, '../..');

const source = fs.readFileSync(path.join(web, 'src/cpa/redirects.ts'), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { REDIRECTS, SHIPPED_PHASE, rewriteLegacy } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

// Old route and query, then the new route and query, for every row. Unchanged rows have want = null.
const CASES = [
  ['/cpm', 'site=a', null],
  ['/cpm/kpi', 'kpi=K&site=a', '/cpm?review=K&site=a'],
  ['/cpm/performance', 'window=12h&loop=L&gate=G0&rows=x&fg=y&page=1&view=v&health=h', null],
  ['/cpm/events', 'filter=f&event=1&sort=s&loop=L', null],
  ['/cpm/explorer', 'loop=L', '/cpm/loop?loop=L&tab=summary'],
  ['/cpm/explorer', 'loop=L&tab=Summary', '/cpm/loop?loop=L&tab=summary'],
  ['/cpm/explorer', 'loop=L&tab=Signals', '/cpm/loop?loop=L&tab=signals'],
  ['/cpm/explorer', 'loop=L&tab=Relationships', '/cpm/loop?loop=L&tab=signals'],
  ['/cpm/explorer', 'loop=L&tab=Calculations', '/cpm/loop?loop=L&tab=calculations'],
  ['/cpm/explorer', 'loop=L&tab=History', '/cpm/loop?loop=L&tab=history'],
  ['/cpm/historical', 'loop=L&kpi=K&signals=s&from=f&to=t&normalize=1&focus=x', '/cpm/loop?loop=L&kpi=K&signals=s&from=f&to=t&normalize=1&focus=x&tab=historical'],
  ['/cpm/historical', 'loop=L&window=2026-11-04T00:00:00Z', '/cpm/loop?loop=L&tab=historical&window=2026-11-04T00:00:00Z'],
  ['/cpm/investigation', 'loop=L&profile=12h&case=C&mode=m&window=w', '/cpm/loop?loop=L&profile=12h&case=C&mode=m&window=w&tab=diagnosis'],
  ['/cpm/response', 'loop=L&event=E&methodRun=R', '/cpm/loop?loop=L&event=E&methodRun=R&tab=model'],
  ['/cpm/evidence', 'loop=L&gate=G&before=b&methodRun=R&view=v&kind=k', '/cpm/evidence?loop=L&gate=G&before=b&methodRun=R&view=v&kind=k&tab=gates'],
  ['/cpm/replay', 'loop=L&gate=G&window=w', '/cpm/evidence?loop=L&gate=G&window=w&tab=replay'],
  ['/cpm/windows', 'loop=L&profile=p&window=w', '/cpm/evidence?loop=L&profile=p&window=w&tab=windows'],
  ['/cpm/calculations', 'loop=L&gate=G&metric=M', '/cpm/evidence?loop=L&gate=G&metric=M&tab=calculations'],
  ['/cpm/registry', 'loop=L', '/cpm/setup?loop=L&tab=loops'],
  ['/cpm/config', 'loop=L&view=v&bundle=B&gate=G&tab=T', '/cpm/setup?loop=L&view=v&bundle=B&gate=G&tab=configuration&sub=T'],
  ['/cpm/pipeline', '', '/cpm/system?tab=pipeline'],
  ['/cpm/governance', '', '/cpm/system?tab=governance'],
  ['/trend', 'tags=a&range=r&from=f&to=t', null],
  ['/admin/users', '', null],
];

const canonical = url => {
  if (url == null) return null;
  const [p, q = ''] = url.split('?');
  return `${p}?${[...new URLSearchParams(q).entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')}`;
};

const failures = [];

// 1. Every row in the SPEC has a case.
const spec = fs.readFileSync(path.join(repo, 'docs/theme/CPA-UI-SPEC-001-R01.md'), 'utf8');
const section = spec.slice(spec.indexOf('### 2.3 Route map'), spec.indexOf('## 3. Page anatomy'));
const specRoutes = [...section.matchAll(/^\| `(\/[^?`\s]*)/gm)].map(m => m[1].replace('/*', '/users')).filter(r => r !== '/');
for (const route of new Set(specRoutes)) {
  if (!CASES.some(c => c[0] === route)) failures.push(`SPEC row without a case: ${route}`);
}

// 2. Every case holds.
for (const [route, query, want] of CASES) {
  const got = rewriteLegacy(route, query);
  if (canonical(got) !== canonical(want)) failures.push(`${route}?${query}\n  want ${want}\n  got  ${got}`);
}

// 3. Every table row has a case.
for (const row of REDIRECTS) {
  if (!CASES.some(c => c[0] === row.from)) failures.push(`table row without a case: ${row.from}`);
}

// 4. Rows that are on, in a real browser.
const on = CASES.filter(([route, , want]) => want && (route === '/cpm/evidence' ? 6 : REDIRECTS.find(r => r.from === route)?.phase) <= SHIPPED_PHASE);
let opened = 0;
if (process.env.CPA_BASE_URL && on.length) {
  const session = pathToFileURL(path.join(repo, 'docs/theme/tools/lib/session.mjs')).href;
  const guardLib = pathToFileURL(path.join(repo, 'docs/theme/tools/lib/guard.mjs')).href;
  const { chromium, requireEnv, login } = await import(session);
  const { installGuard } = await import(guardLib);
  const env = requireEnv();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await installGuard(page, { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null }, { ratePerMin: 40 });
  await login(page, env);
  for (const [route, query, want] of on) {
    await page.goto(`${env.base}${route}${query ? `?${query}` : ''}`);
    await page.waitForFunction(p => location.pathname === p, want.split('?')[0], { timeout: 8000 }).catch(() => {});
    const got = await page.evaluate(() => location.pathname + location.search);
    if (canonical(got) !== canonical(want)) failures.push(`browser ${route}?${query}\n  want ${want}\n  got  ${got}`);
    opened++;
  }
  await browser.close();
}

const summary = `check-redirects: ${new Set(specRoutes).size} SPEC routes, ${CASES.length} cases, ${on.length} rows on (phase ${SHIPPED_PHASE}), ${opened} opened in a browser`;
if (failures.length) {
  console.error(`${summary}\nFAILED ${failures.length}\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`${summary}, 0 failures`);
