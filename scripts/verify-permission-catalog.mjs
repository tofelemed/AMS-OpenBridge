#!/usr/bin/env node
/**
 * RBAC catalog drift guard (Full-RBAC build, Phase 1).
 *
 * Fails CI if the permission catalog and the permissions the services actually
 * enforce ever disagree — the drift that had left 12 enforced keys uncatalogued
 * and therefore ungrantable to any non-admin role.
 *
 * Checks three sources agree:
 *   1. Manifest  — src/services/auth-service/src/rbac/permission-catalog.ts (canonical)
 *   2. SQL seed  — src/services/auth-service/database/schema.sql (migrate path)
 *   3. Enforced  — every RequireClaim("permission", <key>) in the .NET services
 *                  + the shared Perms.All constants (asset-model etc. register a
 *                  policy per Perms.All key).
 *
 * Rules:
 *   A. Every ENFORCED key must be in the manifest   (no ungrantable enforced key).
 *   B. Every non-internal MANIFEST key must be enforced (no dead grant).
 *   C. The SQL seed catalog must equal the manifest  (seed matches source of truth).
 *
 * Usage: node scripts/verify-permission-catalog.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const fail = [];

/** Recursively collect files under `dir` matching `ext`, skipping build output. */
function walk(dir, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name === 'bin' || e.name === 'obj' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

// ── 1. Manifest ──────────────────────────────────────────────────────────────
const manifestSrc = readFileSync(
  `${ROOT}/src/services/auth-service/src/rbac/permission-catalog.ts`, 'utf8');

const manifestKeys = new Set();
const internalKeys = new Set();
for (const m of manifestSrc.matchAll(/\{\s*key:\s*'([^']+)'[^}]*\}/g)) {
  manifestKeys.add(m[1]);
  if (/internal:\s*true/.test(m[0])) internalKeys.add(m[1]);
}

// ── 2. SQL seed catalog (schema.sql permissions INSERT) ─────────────────────
const schemaSrc = readFileSync(
  `${ROOT}/src/services/auth-service/database/schema.sql`, 'utf8');
const schemaKeys = new Set();
// Only the INSERT INTO permissions (...) VALUES block: rows like  ('key', 'desc', 'cat'),
const permBlock = schemaSrc.slice(
  schemaSrc.indexOf('INSERT INTO permissions'),
  schemaSrc.indexOf('SEED: default role'));
for (const m of permBlock.matchAll(/\(\s*'([a-z][a-z0-9._]+)'\s*,/g)) {
  schemaKeys.add(m[1]);
}

// ── 3. Enforced keys from the .NET services (pure-Node scan, no ripgrep) ─────
const enforced = new Set();
const csFiles = [
  ...walk(`${ROOT}/src/backend`, '.cs'),
  ...walk(`${ROOT}/src/services`, '.cs'),
];
for (const file of csFiles) {
  const text = readFileSync(file, 'utf8');
  // RequireClaim("permission", "key")
  for (const m of text.matchAll(/RequireClaim\(\s*"permission"\s*,\s*"([^"]+)"/g)) {
    enforced.add(m[1]);
  }
}
// Shared Perms.All constants: asset-model etc. register a policy per Perms.All key,
// so every Perms constant value is effectively enforced.
const permsSrc = readFileSync(`${ROOT}/src/services/_shared/TraverseAuth.cs`, 'utf8');
const permsClass = permsSrc.slice(
  permsSrc.indexOf('class Perms'),
  permsSrc.indexOf('public static class TraverseAuthExtensions'));
for (const m of permsClass.matchAll(/=\s*"([a-z][a-z0-9._]+)"\s*;/g)) {
  enforced.add(m[1]);
}

// ── Assertions ───────────────────────────────────────────────────────────────
const sorted = (s) => [...s].sort();

// A. enforced ⊆ manifest
const enforcedNotCatalogued = sorted(enforced).filter((k) => !manifestKeys.has(k));
if (enforcedNotCatalogued.length) {
  fail.push(`Enforced but NOT in the manifest (ungrantable): ${enforcedNotCatalogued.join(', ')}`);
}

// B. manifest (non-internal) ⊆ enforced
const catalogedNotEnforced = sorted(manifestKeys)
  .filter((k) => !internalKeys.has(k) && !enforced.has(k));
if (catalogedNotEnforced.length) {
  fail.push(`In the manifest but enforced by no service (dead grant): ${catalogedNotEnforced.join(', ')}`);
}

// C. schema.sql catalog == manifest
const schemaMissing = sorted(manifestKeys).filter((k) => !schemaKeys.has(k));
const schemaExtra   = sorted(schemaKeys).filter((k) => !manifestKeys.has(k));
if (schemaMissing.length) fail.push(`In manifest but missing from schema.sql: ${schemaMissing.join(', ')}`);
if (schemaExtra.length)   fail.push(`In schema.sql but not in manifest: ${schemaExtra.join(', ')}`);

// ── D. Manifest role-hierarchy invariants (no DB needed) ────────────────────
// The tiers must nest: Viewer ⊆ Operator ⊆ Engineer ⊆ Admin, and Admin holds
// every key. Guards against a manifest edit that quietly breaks the tiering.
const GROUP = {
  ALL: ['Viewer', 'Operator', 'Engineer', 'Admin'],
  OPERATOR_UP: ['Operator', 'Engineer', 'Admin'],
  ENGINEER_UP: ['Engineer', 'Admin'],
  ADMIN_ONLY: ['Admin'],
};
const roleSet = { Viewer: new Set(), Operator: new Set(), Engineer: new Set(), Admin: new Set() };
for (const m of manifestSrc.matchAll(/\{\s*key:\s*'([^']+)'[\s\S]*?roles:\s*([A-Z_]+)/g)) {
  for (const r of GROUP[m[2]] ?? []) roleSet[r].add(m[1]);
}
const subset = (a, b) => [...a].every((k) => b.has(k));
if (!subset(roleSet.Viewer, roleSet.Operator)) fail.push('Viewer is not a subset of Operator');
if (!subset(roleSet.Operator, roleSet.Engineer)) fail.push('Operator is not a subset of Engineer');
if (!subset(roleSet.Engineer, roleSet.Admin)) fail.push('Engineer is not a subset of Admin');
if (roleSet.Admin.size !== manifestKeys.size) fail.push('Admin does not hold every permission');

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`RBAC catalog guard:`);
console.log(`  roles         : Viewer ${roleSet.Viewer.size} ⊆ Operator ${roleSet.Operator.size} ⊆ Engineer ${roleSet.Engineer.size} ⊆ Admin ${roleSet.Admin.size}`);
console.log(`  manifest keys : ${manifestKeys.size} (${internalKeys.size} internal)`);
console.log(`  schema.sql    : ${schemaKeys.size}`);
console.log(`  enforced (.NET): ${enforced.size}`);

if (fail.length) {
  console.error('\n❌ RBAC catalog drift detected:');
  for (const f of fail) console.error('   - ' + f);
  console.error('\nReconcile permission-catalog.ts, schema.sql (+ database/scripts/37_rbac_catalog.sql),');
  console.error('and the .NET RequireClaim/Perms keys so all three agree.');
  process.exit(1);
}
console.log('\n✅ Catalog, SQL seed, and enforced keys are in sync.');
