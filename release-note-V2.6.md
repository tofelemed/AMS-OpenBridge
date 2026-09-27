# Release note — v2.6 (CHG-033): evidence back on, disk bounded

**v2.6.1 (combined deployment):** this note also covers the Flink engine patch of 27 September (sample
idleness 30 minutes instead of 1; the Short Feature job on four processor slots). Both go in one window:
the Flink image and the `cplm-api` image, the switches set once before the jobs are resubmitted. If patch 2
is already running at the plant, the jar is the same one and nothing changes for the engines except a
restart with fresh window state.

**For:** the Marun plant owner and the operators of the loop performance system. **Applies to:** the v2.5
installation of 26 September 2026 with its two Flink patches. **Changes one service:** `cplm-api`. No
change to the OT gateway, to Instrumental, to the DCS or to the user interface.

## What you get

- **The Evidence Workbench has content again.** Evidence was switched off on day one because it was
  filling the shared disk (about 34 GB a day). It is now kept by rule: every artifact lives for six hours
  or until a 2 GB cache is full, whichever comes first, and the artifacts that belong to an episode's
  opening, escalation or closing are kept for 90 days after the episode closes. Short-window evidence
  (gates G0 to G4) is no longer produced live; the workbench rebuilds it on request as before.
- **Result tables no longer grow without bound.** Short features keep 3 days, long features 30 days,
  verdict history 30 days. Old days are dropped whole, which returns the space to the disk immediately.
  Each of these numbers is one row in the database and can be changed without a release.
- **Nothing is lost that the plant relies on.** Verdicts, episodes, acknowledgements, shelving, the
  loop model and the system-response results are untouched.

## What it costs

About 0.1 GB a day of permanent growth. Everything else settles at a plateau of roughly 25 to 45 GB,
depending on the verdict-history days chosen. The first 24 hours after switching evidence on are
measured before the tables are partitioned; if the plateau would leave less than 10 GB free, the
verdict history is set to 14 days until storage is added.

## What happens on the plant, in order

1. One online schema script (seconds), then the service image swap (a few seconds of API downtime).
2. Evidence switched on; three Flink jobs restarted (short windows rebuild within the hour, 12 h and
   24 h verdicts within a day, as after any restart).
3. 24 hours of measurement.
4. One script with the service stopped for a few minutes; the interim cron line removed.

Every command and its expected output is in the generated `VM-STEPS.md` of the release bundle.

## Still open from v2.5

The items in `release-note-V2.5.md` sections 5 and 6 (OT gateway timestamps and Instrumental health
feed) are unchanged. Separate storage for the analysis platform and disk monitoring remain the
recommended next steps (`docs/marun-capacity-remediation.md`, items 1 and 4).
