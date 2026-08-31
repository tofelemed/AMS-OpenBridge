# Seed SQL (Phase 4) — applied by `03-seed.sh`

| File | Target DB | Status |
|---|---|---|
| `03-hdpe-hierarchy.sql` | `traverse_assets` | **Present.** Site `hdpe`, 8 areas, 25 units, `instrumental-pro` aliases. No devices/measurements. No houston/dallas. |
| `03-auth-rbac.sql` | `traverse_auth` | **Present.** Four system roles, full permission catalog (alarm + CPM + HMI + ingestion), role matrix. Admin user is inserted by `03-seed.sh` from `BOOTSTRAP_ADMIN_*`. |

Apply after `02-apply-schemas.sh`. Re-runnable (`ON CONFLICT DO NOTHING`). Do not put loop registry rows here unless a site-specific file is named explicitly.
