-- ═══════════════════════════════════════════════════════════════════════════
-- 43_traverse_assets_transport_overrides.sql — per-asset transport overrides
--
-- Every transport an asset advertises (IoTDB path, Sparkplug group/edge/device/
-- metric) was DERIVED from the contextual path text, with no way to store an
-- exception. That is correct for plant signals fed through the UNS pipeline and
-- wrong for signals whose pipeline keys storage by something else:
--
--   CPLM loop signals live in IoTDB at  root.<site>.cpm.<loopId>.<role>
--   (RawLoopIotDbConsumer keys by LOOP id) and publish live under
--   ams_site1/ams_edge1 with device = sanitized loopId (LoopLiveRbeJob →
--   sparkplug-edge-node). The derived transports point at locations nothing
--   writes, so a registered loop signal resolved "successfully" to emptiness —
--   which is why loop PV/SP/OP could not be trended on the Trend page.
--
-- Null = derive from the path exactly as before; the columns change nothing for
-- existing assets. Written by cplm-api's loop-signal projection (onboarding /
-- republish-evidence); manually settable for other special-cased signals.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════

\c traverse_assets

-- The EF model maps to schema "assets" (AssetDbContext), table "assets".
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS iotdb_path_override        TEXT NULL;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS sparkplug_group_override   TEXT NULL;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS sparkplug_edge_override    TEXT NULL;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS sparkplug_device_override  TEXT NULL;
ALTER TABLE assets.assets ADD COLUMN IF NOT EXISTS sparkplug_metric_override  TEXT NULL;

COMMENT ON COLUMN assets.assets.iotdb_path_override IS
    'Historian series override (full IoTDB path incl. measurement). NULL = derive root.<contextual_path>.';
COMMENT ON COLUMN assets.assets.sparkplug_device_override IS
    'Sparkplug device override. NULL = derive <unit>_<device> from the contextual path.';
