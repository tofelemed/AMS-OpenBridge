/**
 * Reconciles the DB permission catalog with the canonical manifest.
 *
 * Runs on migrate and on server startup. It upserts every manifest key into the
 * `permissions` table so the catalog is always complete regardless of how the DB
 * was initialised — the catalog is code-owned (see permission-catalog.ts).
 *
 * It deliberately does NOT touch `role_permissions`: role→permission mappings are
 * admin-owned after the initial seed, so reasserting them on every startup would
 * silently undo an administrator's changes. Initial/upgrade mappings are handled
 * by the SQL seed (database/scripts/37_rbac_catalog.sql + schema.sql); realigning
 * a system role to its default is the explicit "reset to default" admin action.
 */

import { Pool } from 'pg';
import { PERMISSION_CATALOG } from './permission-catalog';

export async function ensurePermissionCatalog(pool: Pool): Promise<number> {
  let upserted = 0;
  for (const p of PERMISSION_CATALOG) {
    const res = await pool.query(
      `INSERT INTO permissions (permission_key, description, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (permission_key)
       DO UPDATE SET description = EXCLUDED.description, category = EXCLUDED.category
       WHERE permissions.description IS DISTINCT FROM EXCLUDED.description
          OR permissions.category    IS DISTINCT FROM EXCLUDED.category`,
      [p.key, p.description, p.category]
    );
    upserted += res.rowCount ?? 0;
  }
  return upserted;
}
