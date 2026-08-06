-- ═══════════════════════════════════════════════════════════════════════════
-- 32_cpm_loop_registry.sql — CPLM loop identity (Phase 4.3/4.4, decision S-A)
--
-- Hybrid identity model: cpm.loop_registry owns what a LOOP is; Traverse's
-- assets.assets (separate database, traverse_assets) owns where each SIGNAL
-- lives. asset_id is therefore a soft reference — a cross-database FK is
-- impossible — reconciled by a job, not by the database.
--
-- Schema `cpm` is collision-free in this database (verified). Numbering starts
-- at 30+ to avoid the 15/17/19/20/21/24 collisions in CPA's originals.
-- ═══════════════════════════════════════════════════════════════════════════

-- CPLM extraction Phase 1: this schema lives in traverse_cplm (created by 29_traverse_cplm_db.sql), not ams.
\c traverse_cplm

CREATE SCHEMA IF NOT EXISTS cpm;

CREATE TABLE IF NOT EXISTS cpm.loop_registry (
    loop_id              VARCHAR(64) PRIMARY KEY,
    -- Soft reference into traverse_assets.assets.assets(id). No FK: different
    -- database. Nullable so a loop can be onboarded before its asset exists.
    asset_id             UUID,
    display_name         VARCHAR(255) NOT NULL,
    -- site is NOT NULL from the first row (decision M-A): retrofitting a
    -- discriminator after loops exist is the expensive version.
    site                 VARCHAR(64)  NOT NULL,
    area                 VARCHAR(64),
    unit                 VARCHAR(64),
    -- loop_type is MANDATORY (plan 4.4). Traverse tags are named
    -- pump101.discharge_press, not FIC10409, so ISA first-letter inference
    -- fails and every loop would fall to the UNKNOWN profile — where the
    -- geometry prior is 0.0 and geometry is disabled entirely.
    loop_type            VARCHAR(32)  NOT NULL
                         CHECK (loop_type IN ('FIC','PIC','PIC_GAS','PIC_VAPOUR','LIC','TIC','UNKNOWN')),
    criticality          VARCHAR(16)  NOT NULL DEFAULT 'medium'
                         CHECK (criticality IN ('low','medium','high','critical')),
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    -- {"enabled": bool} — drives whether CPLM evaluates this loop at all.
    monitoring           JSONB        NOT NULL DEFAULT '{"enabled": false}'::jsonb,
    -- Denormalised {pv,sp,op,vp,mode} UNS paths for fast reads; cpm.loop_tag_map
    -- is the normalised source of truth (both are written by the onboarding API).
    tags                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
    engineering          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    threshold_profile_id VARCHAR(64),
    timezone             VARCHAR(64)  DEFAULT 'UTC',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_asset ON cpm.loop_registry (asset_id);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_site  ON cpm.loop_registry (site);
-- Matches the hot predicate COALESCE((monitoring->>'enabled')::boolean, FALSE)
-- exactly — CPA indexed the bare text expression, which the cast made unusable.
CREATE INDEX IF NOT EXISTS idx_cpm_loop_registry_enabled
    ON cpm.loop_registry ((COALESCE((monitoring->>'enabled')::boolean, FALSE)));

-- ───────────────────────────────────────────────────────────────────────────
-- Signal roles (Phase 4.3). Traverse has NO role concept on a tag: "role" there
-- means transport role (live|history|alarm) or an RBAC role — never a signal
-- role. Keeping this in cpm avoids adding a column to assets.assets, which six
-- services read.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.loop_tag_map (
    loop_id       VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    signal_role   VARCHAR(16) NOT NULL
                  CHECK (signal_role IN ('PV','SP','OP','VP','MODE','STATUS','QUALITY','UPSTREAM','UTILITY')),
    -- UNS path resolved through binding-resolver (path + role -> transport).
    uns_path      VARCHAR(512) NOT NULL,
    source_system VARCHAR(32),
    source_tag    VARCHAR(128),
    unit_conversion JSONB,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (loop_id, signal_role, uns_path)
);

CREATE INDEX IF NOT EXISTS idx_cpm_loop_tag_map_loop ON cpm.loop_tag_map (loop_id);

-- ───────────────────────────────────────────────────────────────────────────
-- Discovered-tag catalogue: the pick-list the onboarding UI maps roles from.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.loop_tag_catalog (
    site           VARCHAR(64)  NOT NULL,
    area           VARCHAR(64)  NOT NULL DEFAULT '',
    unit           VARCHAR(64)  NOT NULL DEFAULT '',
    source_system  VARCHAR(32)  NOT NULL DEFAULT 'uns',
    raw_tag_name   VARCHAR(256) NOT NULL,
    uns_path       VARCHAR(512),
    data_type      VARCHAR(16)  DEFAULT 'float',
    engineering_unit VARCHAR(32),
    discovered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (site, area, unit, source_system, raw_tag_name)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Threshold profiles. NOTE: CPA declared profile_id alone as PK and then seeded
-- nine rows sharing one profile_id — eight were silently swallowed by
-- ON CONFLICT DO NOTHING. The key is composite here.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.threshold_profile (
    profile_id      VARCHAR(64) NOT NULL,
    loop_type       VARCHAR(32) NOT NULL,
    gate_name       VARCHAR(64) NOT NULL,
    pass_threshold  JSONB,
    warn_threshold  JSONB,
    fail_threshold  JSONB,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to    TIMESTAMPTZ,
    PRIMARY KEY (profile_id, loop_type, gate_name)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Loop groups (fleet views / rankings in Phase 5).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.loop_group (
    group_id    VARCHAR(64) PRIMARY KEY,
    group_name  VARCHAR(255) NOT NULL,
    site        VARCHAR(64),
    area        VARCHAR(64),
    unit        VARCHAR(64),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cpm.loop_group_member (
    group_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_group(group_id) ON DELETE CASCADE,
    loop_id  VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, loop_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- Peer/upstream links between LOOPS, projected from assets.asset_relationships
-- by the onboarding service (the asset graph lives in another database, so it
-- cannot be joined at query time). This is what feeds HAS_PEER_LINKS into the
-- CPLM parameter-set broadcast, unlocking G13.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cpm.loop_link (
    from_loop_id VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    to_loop_id   VARCHAR(64) NOT NULL REFERENCES cpm.loop_registry(loop_id) ON DELETE CASCADE,
    rel_type     VARCHAR(24) NOT NULL
                 CHECK (rel_type IN ('PEER','UPSTREAM_OF','DOWNSTREAM_OF','CASCADE_PRIMARY','CASCADE_SECONDARY')),
    -- 'asset-graph' when projected from assets.asset_relationships, 'manual'
    -- when declared directly against loops.
    origin       VARCHAR(16) NOT NULL DEFAULT 'asset-graph',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (from_loop_id, to_loop_id, rel_type),
    CONSTRAINT chk_loop_link_not_self CHECK (from_loop_id <> to_loop_id)
);

CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_from ON cpm.loop_link (from_loop_id);
CREATE INDEX IF NOT EXISTS idx_cpm_loop_link_to   ON cpm.loop_link (to_loop_id);
