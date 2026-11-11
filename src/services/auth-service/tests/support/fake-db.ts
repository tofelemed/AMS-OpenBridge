/**
 * In-memory stand-in for the auth database, wired into the shared `pg` pool.
 *
 * It understands exactly the statements the services under test send (matched on
 * whitespace-normalised SQL) and THROWS on anything else, so a new or changed query
 * fails a test instead of silently returning nothing. BEGIN/ROLLBACK and savepoints
 * snapshot and restore the state, so a refused change inside a transaction is proven
 * to leave no trace.
 */
import { mock } from 'node:test';
import { randomUUID } from 'node:crypto';
import pool from '../../src/config/database';

export interface FakeUser {
  user_id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  password_hash: string;
  /** Epoch seconds. */
  credentials_changed_at: number;
}

interface State {
  users: FakeUser[];
  roles: Map<string, boolean>; // role_name -> is_system_role
  rolePerms: Map<string, Set<string>>;
  permissions: Set<string>;
  refreshTokens: { user_id: string; token: string }[];
}

type Rows = { rows: any[]; rowCount: number };
const result = (rows: any[]): Rows => ({ rows, rowCount: rows.length });
const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const PUBLIC_COLS = ['user_id', 'username', 'email', 'full_name', 'role', 'is_active'];

function cloneState(s: State): State {
  return {
    users: s.users.map((u) => ({ ...u })),
    roles: new Map(s.roles),
    rolePerms: new Map([...s.rolePerms].map(([r, k]) => [r, new Set(k)])),
    permissions: new Set(s.permissions),
    refreshTokens: s.refreshTokens.map((t) => ({ ...t })),
  };
}

export class FakeDb {
  state: State = { users: [], roles: new Map(), rolePerms: new Map(), permissions: new Set(), refreshTokens: [] };
  /** Every statement received, normalised, in order. */
  readonly log: string[] = [];
  private snapshots: State[] = [];
  now = Math.floor(Date.now() / 1000);

  addRole(name: string, keys: string[], isSystem = true): this {
    this.state.roles.set(name, isSystem);
    this.state.rolePerms.set(name, new Set(keys));
    keys.forEach((k) => this.state.permissions.add(k));
    return this;
  }

  addUser(u: Partial<FakeUser> & { username: string; role: string }): FakeUser {
    const user: FakeUser = {
      user_id: u.user_id ?? randomUUID(),
      email: u.email ?? `${u.username}@example.test`,
      full_name: u.full_name ?? null,
      is_active: u.is_active ?? true,
      password_hash: 'not-a-real-hash',
      credentials_changed_at: u.credentials_changed_at ?? this.now - 3600,
      ...u,
    } as FakeUser;
    this.state.users.push(user);
    this.state.refreshTokens.push({ user_id: user.user_id, token: `rt-${user.username}` });
    return user;
  }

  user(id: string): FakeUser | undefined {
    return this.state.users.find((u) => u.user_id === id);
  }

  keysOf(role: string): string[] {
    return [...(this.state.rolePerms.get(role) ?? [])].sort();
  }

  /** Route the shared pool (query + connect) to this fake for the current test. */
  install(): this {
    const query = async (sql: string, params: unknown[] = []) => this.query(sql, params);
    mock.method(pool as any, 'query', query);
    mock.method(pool as any, 'connect', async () => ({ query, release: () => undefined }));
    return this;
  }

  private holders(key: string, keep: (u: FakeUser) => boolean): number {
    return this.state.users.filter(
      (u) => u.is_active && keep(u) && (this.state.rolePerms.get(u.role)?.has(key) ?? false)
    ).length;
  }

  async query(sqlIn: string, params: any[] = []): Promise<Rows> {
    const sql = norm(sqlIn);
    this.log.push(sql);
    const s = this.state;
    const p = params;

    if (sql === 'BEGIN' || sql === 'SAVEPOINT row_sp') { this.snapshots.push(cloneState(s)); return result([]); }
    if (sql === 'COMMIT' || sql === 'RELEASE SAVEPOINT row_sp') { this.snapshots.pop(); return result([]); }
    if (sql === 'ROLLBACK' || sql === 'ROLLBACK TO SAVEPOINT row_sp') {
      const snap = this.snapshots.pop();
      if (snap) this.state = snap;
      return result([]);
    }
    if (/^SELECT pg_advisory_xact_lock\(\d+\)$/.test(sql)) return result([{}]);

    switch (sql) {
      case 'SELECT user_id, username, email, full_name, role, is_active FROM users WHERE user_id = $1':
        return result(s.users.filter((u) => u.user_id === p[0]).map((u) => pick(u, PUBLIC_COLS)));
      case 'SELECT permission_key FROM role_permissions WHERE role_name = $1 ORDER BY permission_key':
        return result(this.keysOf(p[0]).map((k) => ({ permission_key: k })));
      case 'SELECT rp.permission_key FROM users u JOIN role_permissions rp ON rp.role_name = u.role WHERE u.user_id = $1 AND u.is_active = TRUE': {
        const u = s.users.find((x) => x.user_id === p[0] && x.is_active);
        return result(u ? this.keysOf(u.role).map((k) => ({ permission_key: k })) : []);
      }
      case 'SELECT COUNT(*)::int AS n FROM users u JOIN role_permissions rp ON rp.role_name = u.role WHERE rp.permission_key = $1 AND u.is_active = TRUE AND u.user_id <> $2':
        return result([{ n: this.holders(p[0], (u) => u.user_id !== p[1]) }]);
      case 'SELECT COUNT(*)::int AS n FROM users u JOIN role_permissions rp ON rp.role_name = u.role WHERE rp.permission_key = $1 AND u.is_active = TRUE AND u.role <> $2':
        return result([{ n: this.holders(p[0], (u) => u.role !== p[1]) }]);
      case 'SELECT COUNT(*)::int AS n FROM users WHERE role = $1 AND is_active = TRUE':
        return result([{ n: s.users.filter((u) => u.role === p[0] && u.is_active).length }]);
      case 'SELECT COUNT(*)::int AS n FROM users WHERE role = $1':
        return result([{ n: s.users.filter((u) => u.role === p[0]).length }]);
      case 'SELECT user_id FROM users WHERE username = $1':
        return result(s.users.filter((u) => u.username === p[0]).map((u) => ({ user_id: u.user_id })));
      case 'SELECT user_id FROM users WHERE email = $1':
        return result(s.users.filter((u) => u.email === p[0]).map((u) => ({ user_id: u.user_id })));
      case 'SELECT user_id FROM users WHERE email = $1 AND user_id != $2':
        return result(s.users.filter((u) => u.email === p[0] && u.user_id !== p[1]).map((u) => ({ user_id: u.user_id })));
      case 'SELECT user_id, username, email, role, is_active FROM users WHERE username = $1 OR email = $2':
        return result(s.users.filter((u) => u.username === p[0] || u.email === p[1])
          .map((u) => pick(u, ['user_id', 'username', 'email', 'role', 'is_active'])));
      case 'INSERT INTO users (username, email, password_hash, full_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, username, email, full_name, role, is_active, created_at': {
        this.requireRole(p[4]);
        const u = this.addUser({ username: p[0], email: p[1], full_name: p[3], role: p[4], is_active: p[5], credentials_changed_at: this.now });
        u.password_hash = p[2];
        return result([{ ...pick(u, PUBLIC_COLS), created_at: new Date(this.now * 1000) }]);
      }
      case 'INSERT INTO users (user_id, username, email, password_hash, full_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)': {
        this.requireRole(p[5]);
        const u = this.addUser({ user_id: p[0], username: p[1], email: p[2], full_name: p[4], role: p[5], is_active: p[6] });
        u.password_hash = p[3];
        return result([]);
      }
      case 'DELETE FROM refresh_tokens WHERE user_id = $1':
        s.refreshTokens = s.refreshTokens.filter((t) => t.user_id !== p[0]);
        return result([]);
      case 'DELETE FROM users WHERE user_id = $1': {
        const before = s.users.length;
        s.users = s.users.filter((u) => u.user_id !== p[0]);
        s.refreshTokens = s.refreshTokens.filter((t) => t.user_id !== p[0]); // ON DELETE CASCADE
        return { rows: [], rowCount: before - s.users.length };
      }
      case 'SELECT 1 FROM roles WHERE role_name = $1':
        return result(s.roles.has(p[0]) ? [{ '?column?': 1 }] : []);
      case 'SELECT is_system_role FROM roles WHERE role_name = $1':
        return result(s.roles.has(p[0]) ? [{ is_system_role: s.roles.get(p[0]) }] : []);
      case 'SELECT permission_key FROM permissions WHERE permission_key = ANY($1)':
        return result((p[0] as string[]).filter((k) => s.permissions.has(k)).map((k) => ({ permission_key: k })));
      case 'DELETE FROM role_permissions WHERE role_name = $1':
        s.rolePerms.set(p[0], new Set());
        return result([]);
      case 'INSERT INTO role_permissions (role_name, permission_key) VALUES ($1, $2)':
        s.rolePerms.get(p[0])!.add(p[1]);
        return result([]);
      case 'UPDATE users SET credentials_changed_at = NOW() WHERE role = $1':
        s.users.filter((u) => u.role === p[0]).forEach((u) => (u.credentials_changed_at = this.now));
        return result([]);
      case 'DELETE FROM refresh_tokens WHERE user_id IN (SELECT user_id FROM users WHERE role = $1)': {
        const ids = new Set(s.users.filter((u) => u.role === p[0]).map((u) => u.user_id));
        s.refreshTokens = s.refreshTokens.filter((t) => !ids.has(t.user_id));
        return result([]);
      }
      case 'UPDATE users SET role = $1, credentials_changed_at = NOW() WHERE role = $2':
        s.users.filter((u) => u.role === p[1]).forEach((u) => { u.role = p[0]; u.credentials_changed_at = this.now; });
        return result([]);
      case 'DELETE FROM roles WHERE role_name = $1':
        s.roles.delete(p[0]);
        s.rolePerms.delete(p[0]); // role_permissions ON DELETE CASCADE
        return result([]);
      case 'SELECT user_id, floor(EXTRACT(EPOCH FROM credentials_changed_at))::bigint AS changed, is_active FROM users WHERE credentials_changed_at > to_timestamp($1) OR is_active = false':
        return result(s.users.filter((u) => u.credentials_changed_at > p[0] || !u.is_active)
          .map((u) => ({ user_id: u.user_id, changed: String(u.credentials_changed_at), is_active: u.is_active })));
    }

    const upd = /^UPDATE users SET (.+) WHERE user_id = \$(\d+)( RETURNING (.+))?$/.exec(sql);
    if (upd) return this.updateUser(upd[1], p[Number(upd[2]) - 1], p, upd[4]);

    const page = this.usersPage(sql, p);
    if (page) return page;

    throw new Error(`FakeDb: unhandled SQL: ${sql}`);
  }

  /** The five reads of the Users page batch (user-query.service.ts), over the WHERE clause it builds. */
  private usersPage(sql: string, p: any[]): Rows | null {
    if (sql === 'SELECT DISTINCT role FROM users ORDER BY role') {
      return result([...new Set(this.state.users.map((u) => u.role))].sort().map((role) => ({ role })));
    }
    const m = /^(SELECT .+?) FROM users( WHERE (.+?))?( GROUP BY role| ORDER BY created_at DESC LIMIT \$(\d+) OFFSET \$(\d+))?$/.exec(sql);
    if (!m) return null;
    const keep = whereFilter(m[3] ?? '', p);
    const rows = this.state.users.filter(keep);
    const select = m[1];
    if (m[5]) {
      // Newest first: the fake has no created_at, so the latest added comes first.
      const limit = Number(p[Number(m[5]) - 1]);
      const offset = Number(p[Number(m[6]) - 1]);
      if (select !== 'SELECT user_id, username, email, full_name, role, is_active, created_at') return null;
      return result([...rows].reverse().slice(offset, offset + limit)
        .map((u) => ({ ...pick(u, PUBLIC_COLS), created_at: new Date(this.now * 1000) })));
    }
    if (m[4] === ' GROUP BY role' && select === 'SELECT role, COUNT(*) as role_count') {
      const counts = new Map<string, number>();
      rows.forEach((u) => counts.set(u.role, (counts.get(u.role) ?? 0) + 1));
      return result([...counts].map(([role, n]) => ({ role, role_count: String(n) })));
    }
    if (!m[4] && select === 'SELECT COUNT(*) as total') return result([{ total: String(rows.length) }]);
    if (!m[4] && select === 'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = TRUE) as active, COUNT(*) FILTER (WHERE is_active = FALSE) as inactive') {
      return result([{
        total: String(rows.length),
        active: String(rows.filter((u) => u.is_active).length),
        inactive: String(rows.filter((u) => !u.is_active).length),
      }]);
    }
    return null;
  }

  private requireRole(role: string): void {
    if (!this.state.roles.has(role)) throw new Error(`insert or update on table "users" violates foreign key constraint (role ${role})`);
  }

  private updateUser(setList: string, id: string, p: any[], returning?: string): Rows {
    const u = this.state.users.find((x) => x.user_id === id);
    if (!u) return result([]);
    for (const part of setList.split(', ')) {
      const [col, rhs] = part.split(' = ');
      if (rhs === 'NOW()' || rhs === 'CURRENT_TIMESTAMP') {
        if (col === 'credentials_changed_at') u.credentials_changed_at = this.now;
        continue; // updated_at is not modelled
      }
      const m = /^\$(\d+)$/.exec(rhs);
      if (!m) throw new Error(`FakeDb: unhandled SET clause: ${part}`);
      if (col === 'role') this.requireRole(p[Number(m[1]) - 1]);
      (u as any)[col] = p[Number(m[1]) - 1];
    }
    if (!returning) return result([]);
    return result([{ ...pick(u, PUBLIC_COLS), created_at: new Date(this.now * 1000) }]);
  }
}

function pick<T extends object>(o: T, cols: string[]): Record<string, unknown> {
  return Object.fromEntries(cols.map((c) => [c, (o as any)[c]]));
}

/** SQL LIKE on one value: % any run, _ any one character (no escape character is used by the service). */
function like(value: string | null, pattern: string): boolean {
  if (value == null) return false;
  const rx = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${rx}$`, 's').test(value);
}

/**
 * The Users page WHERE clause: terms joined by AND, each `(LOWER(col) LIKE LOWER($n) OR …)`, `role = $n`
 * or `is_active = $n`. Anything else throws, so a changed query fails a test.
 */
function whereFilter(where: string, p: any[]): (u: FakeUser) => boolean {
  if (!where) return () => true;
  const terms = where.split(' AND ').map((term): ((u: FakeUser) => boolean) => {
    const search = /^\((.+)\)$/.exec(term);
    if (search) {
      const ors = search[1].split(' OR ').map((part) => {
        const lk = /^LOWER\((\w+)\) LIKE LOWER\(\$(\d+)\)$/.exec(part);
        if (!lk) throw new Error(`FakeDb: unhandled search clause: ${part}`);
        const col = lk[1];
        const pattern = String(p[Number(lk[2]) - 1]).toLowerCase();
        return (u: FakeUser) => like(((u as any)[col] ?? null)?.toLowerCase() ?? null, pattern);
      });
      return (u) => ors.some((f) => f(u));
    }
    const eq = /^(role|is_active) = \$(\d+)$/.exec(term);
    if (!eq) throw new Error(`FakeDb: unhandled WHERE term: ${term}`);
    const value = p[Number(eq[2]) - 1];
    return (u) => (u as any)[eq[1]] === value;
  });
  return (u) => terms.every((f) => f(u));
}

/** A role matrix shaped like production: SuperAdmin alone holds the administration keys. */
export function seedStandardRoles(db: FakeDb): FakeDb {
  const base = ['alarm.view', 'analytics.view'];
  return db
    .addRole('SuperAdmin', [...base, 'alarm.acknowledge', 'admin.users.edit', 'admin.audit.view', 'rbac.manage', 'system.manage'])
    .addRole('Admin', [...base, 'alarm.acknowledge'])
    .addRole('Engineer', [...base, 'alarm.acknowledge'])
    .addRole('Viewer', base)
    // A user administrator: may edit users, holds no role-management right.
    .addRole('UserAdmin', [...base, 'admin.users.edit'], false);
}
