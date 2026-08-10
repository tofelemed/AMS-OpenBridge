# Alarm Identity Contract (DATA-07)

One alarm, one identity, one sanitisation rule — across Flink, the Sparkplug edge node,
binding-resolver, and the browser.

## The canonical rule

- **Identity:** the Kafka `alarmId` (from `raw-alarms` / the ISA-18.2 state machine;
  `AlarmKeys.stableAlarmId(...)` when the feed doesn't carry one).
- **Historian path:** `root.ams.site1.alarms.<sanitised>` where
  **`sanitised = alarmId.replaceAll("[^a-zA-Z0-9_]", "_")`** — alphanumerics and
  underscores only; hyphens and dots become `_`.

This is exactly what `IoTDBPersistenceJob` has always stored, so the canonical rule
required **no historian data migration**.

## Who derives it

| Component | Role | Where |
|---|---|---|
| `IoTDBPersistenceJob` (Flink) | **Writer** — stores series under the canonical path; logs a warning when two distinct ids collide onto one path (`FIC-101` vs `FIC.101` → `FIC_101`) | `parseToRow` / `warnOnSanitisationCollision` |
| `binding-resolver` | **The one derivation service**: `GET /resolve/alarm?alarmId=…` returns the canonical historian path (prefix configurable via `Alarm:HistorianPrefix`) | `Program.cs` |
| Browser | Asks binding-resolver (`resolveHistorianPathServerFirst`); the local rule in `iotdbPaths.ts` is only the offline fallback | `src/frontend-ob/src/utils/iotdbPaths.ts` |
| Edge node | Publishes the bridging `alarmId` **metric** on every alarm device (DBIRTH + DDATA + snapshot), which is what maps a live Sparkplug device back to the canonical id | `AlarmMetricPublisher` |

## The known, deliberate divergence

The Sparkplug **device id** (MQTT topic segment) uses a *different* sanitiser that
**preserves hyphens** (`[^a-zA-Z0-9_\-]` → `_`), so `FIC-101`'s live topic is
`.../FIC-101` while its historian path is `...alarms.FIC_101`. Changing the device rule
would change MQTT topics, Redis snapshot keys, and every live subscription — a
coordinated migration (dual-publish window or a planned outage), **not** something to
slip into a data-layer phase. Until then the `alarmId` metric is the bridge, and
binding-resolver is the only component that needs to know both rules.

**Collision policy:** collisions are *detected and logged* (Flink warning + counter-worthy),
not silently absorbed; renaming stored series to resolve one is a migration decision to make
with the historian owner.
