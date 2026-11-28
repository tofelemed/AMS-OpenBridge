# Gate property values: show what is really used, and where it is set

| | |
|---|---|
| Status | **APPROVED 23 Nov 2026 (owner) with changes - see section 0. Built as CHG-224 (backend) + CHG-221 (screens), in the System Response release.** |
| Date | 23 Nov 2026 |
| Basis | `gate-property-sources-inventory.md` (all 100 affected properties, one by one, checked against the engine and cplm-api code and the lab data) |
| Who builds | Backend (cplm-api): CPA Updates session. Screens: system response Updates session, inside the Gate Configuration redesign (CHG-221) |

## 0. Owner's decisions (23 Nov 2026)

| # | Decision |
|---|---|
| D1 | Yes - edits that change nothing are refused, and values already stored for such properties are **removed** (dropped automatically whenever a new version is made from a stored one; never shown) |
| D2 | Yes - G3 objective type and G14 evidence types no longer need a SuperAdmin; a plant-wide bundle still does |
| D3 | Words - the data source's sample grid and mode words are described, not read |
| D4 / extra | **Gate Configuration shows only what can be edited there.** Retention, Loop Registry values, fixed rules, values worked out automatically and checks the system does not perform are **removed from Gate Configuration** (not shown read-only, not collapsed). The API still describes them (kind, value, basis) for other pages; Gate Configuration does not list them |
| D5 | Yes - G5's cycle and period values are the editable ones; the G6 / G7 / G9 copies are not editable (they follow G5) |
| D6 | **In this release**, with a proper end-to-end Gate Configuration interface: editing panel and dialogs for bundles and regions (the redesign, CHG-221) |

What stays in Gate Configuration: the properties the engine reads and a person may change - the region limits, the two
decisions (at-limit dwell warning, tuning target λ), the set-point band override and the other gate thresholds the
engine reads. Each shows the value in use for the loop (correctly scaled) and where it comes from (factory, loop type,
plant, this loop, or "worked out automatically" with how).

## 1. In one paragraph

The Gate Configuration page lists 165 properties for a loop. For 60 of them it says "No value / unset", for 40 more it shows
a number that nothing uses, and for a few it shows a number that differs from the one the engine really applies. The
proposal: every property shows **the value in use for this loop, where that value is set, and why**, in plain words.
Values that cannot be changed in Gate Configuration are shown read-only with a link to where they are changed, and Gate
Configuration stops accepting edits that would change nothing. The engine itself does not change.

## 2. What happens today

| # | Problem | Count | Example (lab loop FIC10302) |
|---|---|---|---|
| P1 | "No value / unset" although the system does use a value, taken from somewhere else | 60 | G3 objective type: comes from Loop Registry (Tight). G2 set-point band: 1 % of the PV range = 2.0 kg/h. Evidence retention: set per record type, not per gate |
| P2 | A number is shown, but no calculation uses it | 40 | G8 surrogate repetitions 199, G12 confidence level 0.95, every gate "mode OPERATIONAL" and "role" |
| P3 | The number shown is not the number used | 9 | G12 minimum step shows 1.0, the engine uses 2.0 (scaled to the PV range 0-200); G3 smoothing shows 0.2, real 0.33; G6 harmonics shows "up to 5", real 2nd/3rd/5th; G0 minimum samples shows 10, long windows need 32 |
| P4 | A value can be edited and approved, but the edit changes nothing | 17 + 38 | editing any `evidence_retention_days` is stored without any warning; the 38 "not read" properties give a warning only in Validate |
| P5 | Approval rules built on a property that changes nothing | 2 | an edit to G3 objective type or G14 evidence types needs a SuperAdmin, but neither changes a result |
| P6 | Two or three properties feed one engine setting, so one silently wins | 5 | G5 / G6 period limits; G5 / G7 / G9 minimum cycles |

Why it happened: the property list comes from the specification. Some properties were later implemented differently
(taken from the registry, fixed by the method, or not implemented), and the page still shows the specification's
default or nothing.

## 3. What we propose

### 3.1 Every property gets one of five answers

| Kind | What the user sees | Count | Editable in Gate Configuration |
|---|---|---|---|
| **Set in Gate Configuration** | the value, its level (factory, loop type, plant, this loop) - as today, but with the correct number | 67 (65 read as shown + the 2 region limits) | yes |
| **Needs a decision** | "Not decided - 150 s used (30 samples at 5 s)" - the value in use meanwhile, shown first on the page | 2 | yes (that is the decision) |
| **Set in Loop Registry** | "Tight - set in Loop Registry ↗" (link opens the loop's registry page) | 3 (+ values worked out from the registry's PV range) | no |
| **Evidence retention** | "Live 6 hours · daily archive 30 days · diagnosis episodes 2 days after they close" | 17 | no |
| **Automatic** | the value and how it is worked out: "2.0 kg/h - 1 % of the PV range", "A new set point must hold 30 s - fixed rule" | 57 (43 fixed rules, 14 worked out per loop) | no - except the set-point band, which a loop or loop type may still override with a fixed value |
| **Not checked by this system** | one collapsed group listing the checks the system does not perform ("No notifications are sent", "Not checked") | 19 | no |

The full wording for each of the 100 properties is in the inventory (sections 4.1 to 4.14). No text mentions builds,
versions, releases, catalogues or code names.

### 3.2 Backend (cplm-api)

| # | Change |
|---|---|
| B1 | **One source map**: a new embedded file next to `unsupported-in-build.json` that says, per property, its kind, the sentence to show, how its value is worked out, and where it is changed. One place for all wording; a test checks that every catalogue property is covered |
| B2 | **`GET /configuration/effective`** returns, per property, `value` (in use for this loop), `kind`, `setIn` (Gate Configuration / Loop Registry / evidence retention / automatic, with the link target), `basis` (the plain sentence) and `editable`. Per-loop values come from data the endpoint already loads (registry: PV range, objective, data arrival, loop links) plus three small reads: the retention table, the loop's latest validated model (dead time) and the latest short result (sample interval) |
| B3 | **Correct numbers (P3)**: the G12 values the engine scales by the PV range are shown scaled ("2.0 kg/h - 1.0 per 100 of the PV range"); the fixed-method values show the real rule |
| B4 | **Edits that change nothing are refused (P4)**: a draft cannot set a property whose kind is not "Set in Gate Configuration" or "Needs a decision"; the message says where it is changed ("The control goal is set in Loop Registry") |
| B5 | **Approval rule (P5)**: G3 objective type and G14 evidence types no longer require a SuperAdmin (they are not editable any more); a plant-wide bundle still does |
| B6 | **Overlaps (P6)**: G5's values are the editable ones; G6 periods and G7 / G9 cycles show "same as G5 …" read-only |

### 3.3 Screens (system response Updates session, in the redesign)

- Loop page **Values in use**: Setting · Value in use · Set in · Why, grouped: *Needs a decision* (top), *Set in Gate
  Configuration*, *Set elsewhere* (registry, retention), *Automatic*, *Not checked by this system* (collapsed).
- Bundle editor: only editable properties have an input; the others are read-only with the link to where they are set.
- No "No value", "unset", "NO_VALUE", "FACTORY" or "not read by this build" anywhere.

### 3.4 What does not change

- The engine (Flink): no change, no restart needed for this fix.
- Gate results, diagnoses, KPIs, Overview: no change - the fix changes what the page **says**, not what the system **does**.
- The property catalogue file itself: unchanged, so its fingerprint (which the workers check) stays the same.

## 4. What is affected

| Area | Effect |
|---|---|
| cplm-api | `/effective` response grows (new fields per property); validation of drafts; the approval sensitivity rule; new embedded source map + test |
| Gate Configuration screens | built against the new fields (part of the redesign already under way) |
| Existing bundles at the plant and on the lab | bundles that already store a value for a now read-only property keep working (the engine ignores those values today, as it will tomorrow), but the next edit of such a bundle is refused until that value is removed - the editor offers "Remove" for it |
| Drafts in progress | a draft holding such a value fails Validate until it is removed |
| Governance / approval text | the SuperAdmin rule no longer mentions objective or test-permission changes |
| SME review form (`sme-review.md`) | questions about properties that become automatic or registry-owned move to "for information" |
| Documents | `prod_decision.md` (where each kind of setting lives), the release technical document, the KPI and application logic document |
| Engine, KPIs, Overview, retention | none |

## 5. Consequences and risks of each change

| Change | What it can cause | How we handle it |
|---|---|---|
| B2 per-loop values | three extra reads per page open; slightly slower page (milliseconds) | indexed reads already exist; the fleet summary is not affected |
| B3 scaled numbers | users see numbers change (1.0 → 2.0) although nothing changed in the plant | the "Why" text says how the number is worked out; one line in the release notes |
| B4 refusing edits | a plant bundle that today stores, for example, a retention value can no longer be edited until that value is removed | before the plant deploy, query the plant's bundles for such values (one SQL query); the editor offers "Remove"; nothing changes in results |
| B5 approval rule | fewer changes need a SuperAdmin | only for properties that are no longer editable at all, so no real change in who approves what |
| B6 overlaps | a loop or plant setting that set G6 / G7 / G9 differently from G5 would now follow G5 | the lab and the packs use equal values today; check the plant's bundles before the deploy |
| Data-source values (sample grid, mode words) | these live in the ingestion database, which cplm-api does not read | shown in words without the number ("joined on the data source's grid") unless the owner wants a new read (decision D3) |
| Not changing the catalogue file | the catalogue keeps the specification's defaults for unused properties | the page no longer shows them; removing them from the catalogue is a later, separate change (it changes the fingerprint and needs the jar and cplm-api together) |

## 6. Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| D1 | Refuse edits of properties that change nothing (B4)? | **Yes**, with "Remove" offered for values already stored |
| D2 | Drop the SuperAdmin requirement for G3 objective type and G14 evidence types (B5)? | **Yes** - neither changes a result |
| D3 | Show the data source's sample grid and mode words as numbers (new database read) or in words? | **Words** now; numbers later if wanted |
| D4 | The 19 checks the system does not perform: collapsed group, or remove from the catalogue? | **Collapsed group** now; removal later as its own change |
| D5 | Overlapping properties: G5 editable, G6 / G7 / G9 copies read-only (B6)? | **Yes** |
| D6 | When: in the System Response release (adds cplm-api work, the screens are in the redesign anyway), or the next one? | Owner's call; the backend is about 2-3 days with tests |

## 7. Order of work once approved

1. Source map (B1) with its coverage test, then the new `/effective` fields (B2, B3) - cplm-api tests on the lab database.
2. Contract sent to the screens session; the redesign's *Values in use* switches to the new fields.
3. Validation and approval rule (B4, B5, B6), with the plant bundle check query.
4. Records: `changes_tracker.md` (new CHG number), `prod_decision.md`, the release technical document.
