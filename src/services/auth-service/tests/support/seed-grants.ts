/**
 * Reads every SQL seed that grants permissions to roles and computes what each SYSTEM role
 * holds once the seeds have run, in the production world where the SuperAdmin role exists
 * (CHG-081, cpm-14). This is the "seeded default" the Reset action must restore (CHG-171).
 *
 * Steady state: auth-service re-applies schema.sql on every start and catalog-sync puts every
 * catalog key into `permissions`, so each grant is evaluated against the full key set, with the
 * catalog's categories. cpm-14's strip of the platform keys is applied last.
 *
 * Deliberately strict: an INSERT INTO / DELETE FROM role_permissions in a shape this reader does
 * not know THROWS, so a new seed can never slip past the comparison unread.
 */
import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = path.resolve(__dirname, '../../../../..');
export const REPAIR_SCRIPT = 'database/optional/69_auth_restore_seeded_role_defaults.sql';

/** Every .sql file that writes role_permissions, except rollbacks and the CHG-171 repair script. */
export function seedFiles(): string[] {
  const dirs = ['database/scripts', 'scripts', 'migration/sql'];
  const files = dirs.flatMap((d) =>
    fs.readdirSync(path.join(REPO_ROOT, d)).filter((f) => f.endsWith('.sql')).map((f) => `${d}/${f}`)
  );
  files.push('src/services/auth-service/database/schema.sql');
  return files.filter((f) =>
    !f.endsWith('.rollback.sql') && f !== REPAIR_SCRIPT &&
    /role_permissions/i.test(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
  ).sort();
}

/** SQL text -> statements: drops comments, psql meta-commands and DO $$ blocks. */
export function statements(sql: string): string[] {
  const body = sql
    .replace(/DO \$\$[\s\S]*?\$\$;/g, '')
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith('\\'))
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
  return body.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ── A tiny boolean evaluator for the WHERE clauses the seeds use ─────────────────────────────
type Bind = { key: string; category: string; role?: string };
type Tok = { t: 'str' | 'id' | 'sym'; v: string };

function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:'((?:[^']|'')*)'|(<>|[(),=])|([A-Za-z_][A-Za-z0-9_.]*|\d+))/y;
  let m: RegExpExecArray | null;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1] !== undefined) out.push({ t: 'str', v: m[1].replace(/''/g, "'") });
    else if (m[2]) out.push({ t: 'sym', v: m[2] });
    else out.push({ t: 'id', v: m[3] });
  }
  if (re.lastIndex < s.trimEnd().length) throw new Error(`seed reader: cannot tokenise "${s.slice(re.lastIndex)}"`);
  return out;
}

export function evaluateCondition(cond: string, bind: Bind, existingRoles: Set<string>): boolean {
  const ts = tokens(cond);
  let i = 0;
  const peek = (v?: string) => (ts[i] && (v === undefined || ts[i].v.toUpperCase() === v) ? ts[i] : undefined);
  const take = (v?: string) => {
    const t = peek(v);
    if (!t) throw new Error(`seed reader: expected ${v ?? 'token'} at "${ts.slice(i).map((x) => x.v).join(' ')}" in: ${cond}`);
    i++;
    return t;
  };
  const value = (col: string): string => {
    if (col === 'permission_key' || col === 'k' || col === 'rp.permission_key') return bind.key;
    if (col === 'category') return bind.category;
    if (col === 'role_name' && bind.role !== undefined) return bind.role;
    throw new Error(`seed reader: unknown column ${col} in: ${cond}`);
  };
  const like = (v: string, pattern: string) =>
    new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`).test(v);

  const primary = (): boolean => {
    if (peek('NOT')) { take(); return !primary(); }
    if (peek('EXISTS')) {
      take(); take('(');
      for (const w of ['SELECT', '1', 'FROM', 'ROLES', 'WHERE', 'ROLE_NAME', '=']) take(w);
      const role = take().v;
      take(')');
      return existingRoles.has(role);
    }
    if (peek('(')) { take(); const v = or(); take(')'); return v; }
    const col = take().v;
    const op = take().v.toUpperCase();
    if (op === '=') return value(col) === take().v;
    if (op === '<>') return value(col) !== take().v;
    if (op === 'LIKE') return like(value(col), take().v);
    if (op === 'IN') {
      take('(');
      const list = [take().v];
      while (peek(',')) { take(); list.push(take().v); }
      take(')');
      return list.includes(value(col));
    }
    throw new Error(`seed reader: unknown operator ${op} in: ${cond}`);
  };
  const and = (): boolean => { let v = primary(); while (peek('AND')) { take(); const r = primary(); v = v && r; } return v; };
  const or = (): boolean => { let v = and(); while (peek('OR')) { take(); const r = and(); v = v || r; } return v; };
  const result = or();
  if (i !== ts.length) throw new Error(`seed reader: trailing tokens in: ${cond}`);
  return result;
}

// ── Grants ───────────────────────────────────────────────────────────────────────────────────
const GRANT = /^INSERT INTO role_permissions \(role_name, permission_key\) SELECT '([^']+)', (.+?) ON CONFLICT DO NOTHING$/i;
const FROM_PERMISSIONS = /^permission_key FROM permissions(?: WHERE (.+))?$/i;
const FROM_VALUES = /^k FROM \(VALUES (.+?)\) AS v\(k\)(?: WHERE (.+))?$/i;
const LITERAL = /^'([^']+)'$/;
const PERMISSIONS_INSERT = /^INSERT INTO permissions \(permission_key, description, category\) VALUES (.+?) ON CONFLICT/i;
const STRIP_TABLE = /^CREATE TEMP TABLE (\w+) ON COMMIT DROP AS SELECT role_name, permission_key FROM role_permissions WHERE (.+)$/i;
const STRIP_DELETE = /^DELETE FROM role_permissions rp USING (\w+) r WHERE rp\.role_name = r\.role_name AND rp\.permission_key = r\.permission_key$/i;

export interface SeedResult {
  /** Steady-state grants per system role. */
  grants: Map<string, Set<string>>;
  /** Every key any seed inserts into `permissions`. */
  seededKeys: Set<string>;
}

export function evaluateSeeds(
  files: string[],
  categories: Map<string, string>,
  systemRoles: string[]
): SeedResult {
  const existing = new Set(systemRoles); // SuperAdmin included: the production world
  const grants = new Map(systemRoles.map((r) => [r, new Set<string>()]));
  const seededKeys = new Set<string>();
  const parsed = files.map((f) => ({ f, stmts: statements(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')) }));

  for (const { stmts } of parsed) {
    for (const s of stmts) {
      const pm = PERMISSIONS_INSERT.exec(s);
      if (pm) for (const m of pm[1].matchAll(/\(\s*'([^']+)'\s*,/g)) seededKeys.add(m[1]);
    }
  }
  const allKeys = new Set([...categories.keys(), ...seededKeys]);
  const category = (k: string) => categories.get(k) ?? '';
  const strips: { role: string; key: string }[] = [];
  const stripConds = new Map<string, string>();

  for (const { f, stmts } of parsed) {
    for (const s of stmts) {
      const st = STRIP_TABLE.exec(s);
      if (st) { stripConds.set(st[1], st[2]); continue; }
      const sd = STRIP_DELETE.exec(s);
      if (sd) {
        const cond = stripConds.get(sd[1]);
        if (!cond) throw new Error(`seed reader: ${f}: DELETE uses unknown table ${sd[1]}`);
        for (const role of systemRoles) for (const key of allKeys) {
          if (evaluateCondition(cond, { key, category: category(key), role }, existing)) strips.push({ role, key });
        }
        continue;
      }
      if (/^DELETE FROM role_permissions/i.test(s)) throw new Error(`seed reader: ${f}: unknown delete: ${s}`);
      if (!/^INSERT INTO role_permissions/i.test(s)) continue;

      const g = GRANT.exec(s);
      if (!g) throw new Error(`seed reader: ${f}: unknown grant shape: ${s}`);
      const [, role, rest] = g;
      if (!grants.has(role)) continue; // a site role such as Supervisor, not a system role
      const target = grants.get(role)!;
      const fp = FROM_PERMISSIONS.exec(rest);
      const fv = FROM_VALUES.exec(rest);
      const lit = LITERAL.exec(rest);
      if (fp) {
        for (const key of allKeys) {
          if (!fp[1] || evaluateCondition(fp[1], { key, category: category(key) }, existing)) target.add(key);
        }
      } else if (fv) {
        for (const m of fv[1].matchAll(/\(\s*'([^']+)'\s*\)/g)) {
          const key = m[1];
          if (!fv[2] || evaluateCondition(fv[2], { key, category: category(key) }, existing)) target.add(key);
        }
      } else if (lit) {
        target.add(lit[1]);
      } else {
        throw new Error(`seed reader: ${f}: unknown grant source: ${rest}`);
      }
    }
  }
  for (const { role, key } of strips) grants.get(role)?.delete(key);
  return { grants, seededKeys };
}

/** The (role, key) pairs the CHG-171 repair script would re-grant. */
export function repairPairs(): Map<string, Set<string>> {
  const sql = fs.readFileSync(path.join(REPO_ROOT, REPAIR_SCRIPT), 'utf8');
  const ins = statements(sql).find((s) => /^INSERT INTO chg171_defaults/i.test(s));
  if (!ins) throw new Error('repair script: no INSERT INTO chg171_defaults');
  const out = new Map<string, Set<string>>();
  for (const m of ins.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1])!.add(m[2]);
  }
  return out;
}
