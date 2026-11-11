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
const { REDIRECTS, resolveRedirect } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

// Old route and query, then the new route and query, for every row. Unchanged rows have want = null.
const CASES = [
  ['/cpm', 'site=a', null],
  ['/cpm/kpi', 'kpi=K&site=a', '/cpm?review=K&site=a'],
  ['/cpm/kpi', '', '/cpm?review=acceptable'],
  ['/cpm/performance', 'window=12h&loop=L&gate=G0&rows=x&fg=y&page=1&view=v&health=h', null],
  ['/cpm/events', 'filter=f&event=1&sort=s&loop=L', null],
  ['/cpm/explorer', 'loop=L&tab=Signals', null],
  ['/cpm/historical', 'loop=L&kpi=K&signals=s&from=f&to=t&normalize=1&focus=x', null],
  ['/cpm/investigation', 'loop=L&profile=12h&case=C&mode=m&window=w', null],
  ['/cpm/response', 'loop=L&event=E&methodRun=R', null],
  ['/cpm/evidence', 'loop=L&gate=G&before=b&methodRun=R&view=v&kind=k', null],
  ['/cpm/replay', 'loop=L&gate=G&window=w', null],
  ['/cpm/windows', 'loop=L&profile=p&window=w', null],
  ['/cpm/calculations', 'loop=L&gate=G&metric=M', null],
  ['/cpm/registry', 'loop=L', null],
  ['/cpm/config', 'loop=L&view=v&bundle=B&gate=G&tab=T', null],
  ['/cpm/pipeline', '', null],
  ['/cpm/governance', '', null],
  ['/trend', 'tags=a&range=r&from=f&to=t', null],
  ['/admin', '', null],
  ['/admin/users', '', null],
  ['/admin/audit', '', '/cpm/governance'],
  ['/cpm/loop', 'loop=L', '/cpm/explorer?loop=L'],
  ['/cpm/loop', 'tab=summary&loop=L', '/cpm/explorer?loop=L'],
  ['/cpm/loop', 'tab=signals&loop=L', '/cpm/explorer?loop=L&tab=Signals'],
  ['/cpm/loop', 'tab=history&loop=L', '/cpm/explorer?loop=L&tab=History'],
  ['/cpm/loop', 'tab=calculations&loop=L', '/cpm/explorer?loop=L&tab=Calculations'],
  ['/cpm/loop', 'tab=historical&loop=L', '/cpm/historical?loop=L'],
  ['/cpm/loop', 'tab=diagnosis&loop=L', '/cpm/investigation?loop=L'],
  ['/cpm/loop', 'tab=model&loop=L&event=E', '/cpm/response?loop=L&event=E'],
  ['/cpm/evidence', 'tab=gates&loop=L', '/cpm/evidence?loop=L'],
  ['/cpm/evidence', 'tab=replay&loop=L&gate=G', '/cpm/replay?loop=L&gate=G'],
  ['/cpm/evidence', 'tab=windows&loop=L', '/cpm/windows?loop=L'],
  ['/cpm/evidence', 'tab=calculations&loop=L&metric=M', '/cpm/calculations?loop=L&metric=M'],
  ['/cpm/setup', 'tab=loops&loop=L', '/cpm/registry?loop=L'],
  ['/cpm/setup', 'tab=configuration&sub=T&loop=L', '/cpm/config?loop=L&tab=T'],
  ['/cpm/setup', 'tab=plant-model&search=b2', '/admin/plant-model?search=b2'],
  ['/cpm/setup', 'tab=data-sources', '/admin/data-sources'],
  ['/cpm/setup', 'tab=tag-aliases', '/admin/aliases'],
  ['/cpm/system', 'tab=pipeline', '/cpm/pipeline'],
  ['/cpm/system', 'tab=governance', '/cpm/governance'],
  ['/cpm/system', 'tab=users', '/admin/users'],
  ['/cpm/system', 'tab=roles', '/admin/roles'],
  ['/cpm/system', 'tab=settings', '/cpm/governance'],
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
  const got = resolveRedirect(route, query);
  if (canonical(got) !== canonical(want)) failures.push(`${route}?${query}\n  want ${want}\n  got  ${got}`);
}

// 3. Every table row has a case.
for (const row of REDIRECTS) {
  if (!CASES.some(c => c[0] === row.from)) failures.push(`table row without a case: ${row.from}`);
}

// 4. Every /cpm address the app links to exists: a live route, or an old one with a row.
const appRoutes = fs.readFileSync(path.join(web, 'src/app/AppRoutes.tsx'), 'utf8');
const live = new Set([...appRoutes.matchAll(/path="(\/[^"*]*)/g)].map(m => m[1]));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});
const linked = new Set();
for (const file of walk(path.join(web, 'src'))) {
  // Not comments: they also name API paths, such as /cpm/resolutions.
  const code = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  for (const m of code.matchAll(/['"`](\/cpm(?:\/[a-z][a-z-]*)*)(?=[?'"`$])/g)) linked.add(m[1]);
}
for (const p of linked) {
  if (!live.has(p) && !REDIRECTS.some(r => r.from === p)) failures.push(`the app links to an address that does not exist: ${p}`);
}

// 5. Rows that are on, in a real browser.
const on = CASES.filter(([, , want]) => want);
let opened = 0;
if (process.env.CPA_BASE_URL && on.length) {
  const session = pathToFileURL(path.join(repo, 'docs/theme/tools/lib/session.mjs')).href;
  const guardLib = pathToFileURL(path.join(repo, 'docs/theme/tools/lib/guard.mjs')).href;
  const { chromium, requireEnv, login, goto } = await import(session);
  const { installGuard } = await import(guardLib);
  const env = requireEnv();
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  await installGuard(page, { blocked: [], http429: [], apiCalls: 0, pacedMs: 0, trigger: null }, { ratePerMin: 40 });
  await login(page, env);
  for (const [route, query, want] of on) {
    // Inside the app: the session is in memory, and a page without context must not lend any.
    await goto(page, '/trend');
    await page.waitForTimeout(150);
    await goto(page, `${route}${query ? `?${query}` : ''}`);
    await page.waitForFunction(p => location.pathname === p, want.split('?')[0], { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(150);
    const got = await page.evaluate(() => location.pathname + location.search);
    // A page may add to the address once it opens (a landing run, a default view). What the row set must all be there.
    const [wantPath, wantQuery = ''] = want.split('?');
    const [gotPath, gotQuery = ''] = got.split('?');
    const gotParams = new URLSearchParams(gotQuery);
    const missing = [...new URLSearchParams(wantQuery).entries()].filter(([k, v]) => gotParams.get(k) !== v);
    if (gotPath !== wantPath || missing.length) failures.push(`browser ${route}?${query}\n  want ${want}\n  got  ${got}`);
    opened++;
  }
  await browser.close();
}

const summary = `check-redirects: ${new Set(specRoutes).size} SPEC routes, ${CASES.length} cases, ${on.length} rows, ${opened} opened in a browser`;
if (failures.length) {
  console.error(`${summary}\nFAILED ${failures.length}\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`${summary}, 0 failures`);
