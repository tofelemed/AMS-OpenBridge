/**
 * CHG-171 fix 3 — "Reset to default" must restore the SEEDED defaults.
 *
 * The reset reads the code catalog (permission-catalog.ts). On 4 Nov 2026 a reset of a system
 * role on the lab silently dropped keys the SQL seeds grant (the ten cpm.* keys of
 * 59_cpm_v25_permissions.sql were not in the catalog). These tests read every seed script and
 * fail when the catalog's role defaults and the seeds disagree, so they cannot drift again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  defaultPermissionsForRole,
  type SystemRole,
} from '../src/rbac/permission-catalog';
import { evaluateSeeds, repairPairs, seedFiles } from './support/seed-grants';

const ROLES = SYSTEM_ROLES.map((r) => r.name);
const categories = new Map(PERMISSION_CATALOG.map((p) => [p.key, p.category]));
const sorted = (xs: Iterable<string>) => [...xs].sort();

test('the seed reader finds the known seed scripts', () => {
  const files = seedFiles();
  for (const f of [
    'database/scripts/17_traverse_auth_schema.sql',
    'database/scripts/37_rbac_catalog.sql',
    'database/scripts/59_cpm_v25_permissions.sql',
    'scripts/cpm-14-superadmin-role.sql',
    'src/services/auth-service/database/schema.sql',
  ]) {
    assert.ok(files.includes(f), `${f} is read`);
  }
});

test('every key a seed inserts into permissions is in the catalog', () => {
  const { seededKeys } = evaluateSeeds(seedFiles(), categories, ROLES);
  const missing = sorted(seededKeys).filter((k) => !categories.has(k));
  assert.deepEqual(missing, [], 'seeded keys missing from permission-catalog.ts');
});

for (const role of ROLES) {
  test(`reset default of ${role} equals what the seeds grant it`, () => {
    const { grants } = evaluateSeeds(seedFiles(), categories, ROLES);
    assert.deepEqual(sorted(defaultPermissionsForRole(role as SystemRole)), sorted(grants.get(role)!));
  });
}

test('the 4 Nov regression: reset keeps the gate-configuration and analysis keys', () => {
  const superAdmin = defaultPermissionsForRole('SuperAdmin');
  for (const k of ['cpm.config.read', 'cpm.config.draft', 'cpm.config.validate', 'cpm.config.shadow',
    'cpm.config.approve', 'cpm.config.activate', 'cpm.config.rollback', 'cpm.analysis.create',
    'cpm.context.manage', 'cpm.model.review']) {
    assert.ok(superAdmin.includes(k), `SuperAdmin default keeps ${k}`);
  }
  const engineer = defaultPermissionsForRole('Engineer');
  assert.ok(engineer.includes('cpm.analysis.create'), 'Engineer default keeps cpm.analysis.create');
  assert.ok(engineer.includes('cpm.context.manage'), 'Engineer default keeps cpm.context.manage');
  assert.ok(!engineer.some((k) => k.startsWith('cpm.config.')), 'gate configuration stays SuperAdmin-only (CHG-081)');
});

test('SuperAdmin default holds every catalog key', () => {
  assert.deepEqual(sorted(defaultPermissionsForRole('SuperAdmin')), sorted(categories.keys()));
});

test('the OPTIONAL repair script re-grants exactly the catalog defaults, and removes nothing', () => {
  const pairs = repairPairs();
  assert.deepEqual(sorted(pairs.keys()), sorted(ROLES));
  for (const role of ROLES) {
    assert.deepEqual(sorted(pairs.get(role)!), sorted(defaultPermissionsForRole(role as SystemRole)), role);
  }
});
