# Task 18 — CHG-201: Loop Registry as a list page + a Loop detail sub-page, in plain words

Branch `feat/cpa-redesign` after CHG-200 records (`bff8b170`). Brief: `.superpowers/sdd/2026-11-15-owner-prod-review/chg201-brief.md`;
approved mockup `docs/theme/redesign/samples/loop-detail-proposal.html` (+ the three PNGs). One commit (this report rides in
it). Not pushed. No docker, no subagents. Text changes: `docs/theme/redesign/text-changes.md` `## CHG-201`. Screens (PNG, device
scale 1, not committed) in `docs/theme/redesign/evidence/chg201/`; capture tool in the scratchpad (`chg201/shots.mjs`: the
guard's read-only rules, 0 blocked calls, 0 HTTP 429). `prod_decision.md` / `changes_tracker.md` untouched: the facts for them
are under "For the release records".

## What changed

**cplm-api (additive, read-only)**
- `CpmLoopDto` gains three optional trailing fields: `CreatedAt`, `UpdatedAt` (`cpm.loop_registry.created_at / updated_at`) and
  `SourceTags` (`cpm.loop_tag_map.source_tag` per role, active rows only, trimmed, a blank tag is none; null when the loop has none,
  so the JSON leaves it out under the existing WhenWritingNull option). Both reads carry them: `GET /loops` and `GET /loops/{id}`
  (`CpmLoopRegistryReads`: `RegistrySelect` selects the two dates; the tag-map queries select `source_tag`; a new
  `Hydrate(row, mappings-with-source-tag, links)` overload wraps the old one). No new endpoint, no schema change, no migration.
- `tests/cplm-api.Tests/RegistryLoopFactsTests.cs` (lab DB, its own `ZZ_FACTS_*` ids, cleaned up): one loop and the list carry the
  dates and the source tags; an inactive mapping's tag and a blank tag are left out; the JSON adds `createdAt`, `updatedAt`,
  `sourceTags` and keeps `tags` as before.

**Frontend: the list (`/cpm/registry`)**
- `LoopRegistry.tsx`: the side panel and the drawer logic went. The list card holds the filter row, one full-width
  `ui/DataTable` (`registry/RegistryList.tsx`) and the shared pager. A row (click or Enter) opens `/cpm/registry/:loopId` with the
  list's address kept (search, status choice, page, plant scope: `registry/registryUrl.ts`); the tag stays a real link (new tab,
  Back) without a second tab stop. An old `?loop=X` link redirects to `/cpm/registry/X` (rest of the address kept), so
  `/cpm/setup?tab=loops&loop=X` still lands right. The search also finds a loop by its unit name as shown.
- Columns: Loop (tag, the description without the tag, the Not monitored / Retired pill), Type, Plant unit (asset-model name),
  Valve position (with a ? in the head), Ready for analysis, ›.
- Plant names from the existing cached whole-tree read `usePlantLocations()` (one read); readiness per row is computed from the
  loop record by the shared rule: no per-row request (tested).
- How to read: two parts, State and Ready for analysis, plain words; the valve words moved to the column's ?.
- The dropdown's two limit options now read "Valve position not connected n" / "No linked loops n" (addresses unchanged).

**Frontend: the loop's page (`/cpm/registry/:loopId`, `registry/detail/`)**
- `LoopDetailPage.tsx` (route added in `app/AppRoutes.tsx`, same `analytics.view` guard; the sidebar keeps Loop Registry selected
  by its existing prefix match). Reads its loop (`useCpmLoop`), its readiness once, the plant names (cached), and a retired loop's
  open episode once. Keyed by loop id, so a linked loop's page starts afresh (tested).
- `DetailHeader.tsx`: "‹ All loops", "Set up · Loop Registry", the tag, the description, "Monitoring on" / "○ Monitoring off" /
  "⊘ Retired" and the readiness pill; Resend to analysis (+ ?), Retire loop / Restore loop, Edit loop (the one primary). Same
  permissions as the old `LoopActions` (cpm.manage; Edit waits for a restore on a retired loop), the receipt under them.
- Cards (`Section.tsx`), two columns from 1280 px, one below, in the approved order: `AboutSections.tsx` (Where it is, How it is
  controlled, Analysis settings, Changes), `SignalsSection.tsx`, `ReadyAndLinks.tsx` (Ready for analysis, Linked loops).
- A loop that does not exist: "No loop X" / "It was renamed, removed or never added." with "‹ All loops".
- Removed (with the panel): `LoopPanel`, `LoopReadiness`, `SignalMapping`, `LoopActions`, `loopPanelFacts` (+ tests). Its
  `shortPath` (the editor's) moved to `registry/signalPath.ts` with its test and the state-word test.

**Shared pieces**
- `registry/loopWords.ts`: every code to words (the table below). `registry/loopFacts.ts`: description without the tag, control
  station, plant names (`placeOf`), valve-position word, source tag (recorded tag, else the path's last part upper-cased, never
  the path). `registry/readinessRules.ts`: the one readiness rule. `registry/detail/signalRows.ts`: the Signals rows.
  `registry/WordPill.tsx`: a plain / amber / muted pill.
- `ui/DataTable.tsx`: each cell carries its column name in `data-label` (additive), so the list and the Signals table read as
  cards at the 768 and 390 widths (CSS in `styles/cpm-registry.css`, tokens only).
- `cpaHref.registryHref(loop)` now returns `/cpm/registry/<loop>`: every deep link (Loop Explorer model card, Signals tab,
  Relationships, Historical / Replay / Investigation / Overview "signal mapping" links, Administration's plant node, Governance
  links) lands on the new page.
- The editor says the same words (brief: "the page and the editor use the same words"): `ClassificationStep` field labels and
  options from `loopWords` ("From the loop type (Flow)" first), the badge "Set from the loop type" / "Set by a person" (no longer
  green); the edit dialog is titled "Edit loop" (the button that opens it); the valve-position choice NOT_INSTALLED reads "Not
  fitted" (`optionalInputs.APPLICABILITY_OPTIONS`, `factStateLabel`, its ?). Values sent are unchanged.

## The readiness rule (`registry/readinessRules.ts`, used by the list column and the page's checklist)

| Item | Shown | Missing title | Why and how (one sentence) |
|---|---|---|---|
| Signals | always | "<names> not connected" | "Every check reads the process value, setpoint, output and mode. Connect it / them in Edit loop." |
| Units and ranges | always (PV unit, PV low and high, output low and high) | "Units and ranges not set" | "The checks judge the control error and the output against the ranges, and values are shown in the unit. Set the <missing> in Edit loop." |
| Valve position | only when expected (`inputContextOf`) | "Valve position not connected" | "The valve checks (sticking, wear) need it. Connect it in Edit loop, or mark the valve position as not fitted." |
| Linked loops | only when expected (`peerApplicabilityOf`) | "No linked loops" | "The interaction checks need the loops this one affects: link them in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop." |
| Monitoring (added) | only when off on a loop that is not retired | "Monitoring off" | "The analysis skips this loop while monitoring is off. Turn it on in Edit loop." |
| Loop type (added) | only when UNKNOWN / empty | "Loop type not set" | "The cycle-shape checks stay off without it. Choose the type in Edit loop if one fits." |
| Plant model (added, server only) | only on the page, when `binding_provenance` is unmet and not "unreachable" | "Signals not in the plant model" | "Their data may not reach the analysis. Use Resend to analysis to add them to the plant model." |

Server checks the rule adds (listed as the brief asked): `monitoring_enabled`, `loop_type`, `binding_provenance`. Not items, by
design: `registry_row` (always met), `evidence_short` and `tag_vp` TEMPORARILY_UNAVAILABLE (data arriving: the Signals table's
Data column), `evidence_verdict` (analysis output), `cplm_jobs` and a `binding_provenance` failure that says "unreachable"
(system-wide: Pipeline Health). A retired loop shows "—" in the list's column and no readiness pill in its head (its checklist
stays, without the monitoring item).

## Words chosen for each code (`registry/loopWords.ts`; the editor uses the same)

- Loop type: FIC Flow · PIC Pressure · PIC_GAS Gas pressure · PIC_VAPOUR Vapour pressure · LIC Level · TIC Temperature ·
  UNKNOWN / none "Unknown type" (CHG-200's word) · any other "Other".
- Final element (command path): OP_TO_VALVE Control valve · OP_TO_VFD Variable-speed drive · OP_TO_SLAVE_SP Setpoint of another
  loop · OP_TO_PV Acts on the process directly · UNKNOWN Not known.
- Control structure (topology): SINGLE Single loop · CASCADE_MASTER Cascade master (outer loop) · CASCADE_SLAVE Cascade slave
  (inner loop) · SPLIT_RANGE Split range · OVERRIDE Override · RATIO Ratio · FEEDFORWARD Feedforward · UNKNOWN Not known.
- Control goal (objective): TIGHT Tight control · AVERAGING Averaging (smooth changes) · RATIO Keep a ratio · CONSTRAINT Stay within
  a limit · RAMP Follow a ramp · BATCH Batch · QUALITY Product quality · SUPERVISORY Sets other loops · UNSET Not set.
- Process behaviour (dynamic class): FAST_SELF_REG Fast, settles on its own · SLOW_SELF_REG Slow, settles on its own · INTEGRATING
  Keeps rising or falling until corrected · INTEGRATING_LAG Keeps rising or falling, after a delay · UNDERDAMPED Overshoots before
  it settles · UNKNOWN Not known.
- Service (service family; a row only when a person declared one that differs from the loop type's word): FLOW Flow ·
  PRESSURE_LIQUID Liquid pressure · PRESSURE_GAS Gas pressure · PRESSURE_VAPOUR Vapour pressure · LEVEL Level · TEMPERATURE
  Temperature · COMPOSITION_ANALYZER Composition (analyser) · PH_CONDUCTIVITY pH or conductivity · SPEED_POSITION_POWER Speed,
  position or power · CASCADE Cascade · SPLIT_RANGE_OVERRIDE_RATIO Split range, override or ratio · UNKNOWN_UNSTABLE_INVERSE_MIMO Other.
- Data arrives (acquisition): PERIODIC At regular intervals · RBE When the value changes · SAMPLE_HOLD Sampled, held between samples.
- Classification source: PRESET_FROM_LOOP_TYPE "Set from the loop type. Change it in Edit loop." · EXPLICIT "Set by a person."
- Assessment settings: no profile / "default" → "Standard"; else the name a person typed (profiles have no other name).
- Criticality: low / medium / high / critical → Low / Medium / High / Critical. Step tests: Allowed / Not allowed.
- Links: CASCADE_PRIMARY Cascade master of · CASCADE_SECONDARY Cascade slave of · UPSTREAM_OF Upstream of · DOWNSTREAM_OF
  Downstream of · PEER Interacts with · other Linked to.
- Valve position: Connected · Not connected (amber !) · Not fitted (NOT_INSTALLED) · Not applicable.
- Signals: PV Process value · SP Setpoint · OP Controller output · Mode "Auto, manual or cascade" · VP Valve position; Data
  "Receiving data" / "No data" (amber) / "Expected" (amber) / "—" before the readiness is read.
- Plant names: the asset name with a leading number's dash as " · " ("6002 · Pellet Homogenization II Silo 4 & 5"); a level the
  model does not hold reads "Not in the plant model"; never the slug.
- Dates: `dayStamp` (Administration's "31 Aug 2026", site zone).

## Tests (each new behaviour watched failing first)

| File | Tests | What they pin |
|---|---|---|
| `registry/loopWords.test.ts` | 10 | type, model, data-arrives, classification, criticality, profile and link words; every contract value has a word with no `_` and no shouting code |
| `registry/loopFacts.test.ts` | 10 | description without the tag, control station, plant names (" · ", never the slug, "Not in the plant model"), valve-position word, source-tag fallback (recorded tag, else the path's last part upper-cased, never the path) |
| `registry/readinessRules.test.ts` | 9 | the shared rule: each item, expected-only VP and links, monitoring / loop type, the server plant-model check and what is left out (data, output, system-wide), no gate code; the pill (neutral Ready, amber count) |
| `registry/detail/signalRows.test.ts` | 9 | roles, names, pens, source tags, units / ranges, data states, extra roles |
| `registry/registryUrl.test.ts` | 2 | the list address kept into a loop's page and back; `?loop=` never carried |
| `registry/signalPath.test.ts` | 2 | the moved `shortPath` and the state words |
| `registry/RegistryList.test.tsx` | 7 | six columns and the ? tip, each cell's words, neutral Ready / amber items / no green, Not monitored / Retired pills, unit dash before names load, row click + Enter, tag link without a second tab stop |
| `LoopRegistry.test.tsx` | 20 | header, How to read (no gate code), no side panel, plant names read once and nothing per row, filters, unit-name search, dropdown words / counts, choices, pager, export, empty states, row click / Enter keep the list address, `?loop=` redirect, no-technical-text check over the rendered list (+ its ? tip) |
| `registry/detail/LoopDetailPage.test.tsx` | 23 | back link keeps the list query, head and pills, actions and the Resend ?, one loop + one readiness read and no list read, card order, every card's facts, control station left out, explicit vs preset note, signals table, readiness error + retry, checklist, analysis settings with / without config permission, links (words, links keep the list address, empty, stand-alone), Changes (and left out without dates), retired, not monitored, not found, no-technical-text and tag-once check, Edit / Retire / Resend (plain receipt), a linked loop's page starts afresh, permissions |

Updated: `cpaHref.test.ts`, `PlantModelConfig.test.tsx`, `LoopModelCard.test.tsx`, `LoopFocus.test.tsx` (links now
`/cpm/registry/<loop>`), `registryView.test.ts`, `ClassificationStep.test.tsx`, `AddLoopWizard.test.tsx`, `wizardForm.test.ts`,
`optionalInputs.test.ts`, `ui/DataTable.rows.test.tsx`. Removed with the panel: `LoopPanel.test.tsx`, `loopPanelFacts.test.ts`
(its two still-relevant tests moved to `signalPath.test.ts`). The two Governance tests pinning `/cpm/registry?loop=` were updated
by CHG-202 (`e853c25a`), as agreed with the coordinator; I did not touch them.

Verification:
- `npx vitest run`: 366 files, 3038 tests; 3037 passed, 1 failed = the known `Designer/TrendCore.trust.test.tsx` timing flake
  (passes alone, 4/4).
- `npx tsc --noEmit`: clean (after CHG-202 landed; while its work was in progress the only errors were in its governance files).
- `npm run lint`: clean. `npm run lint:theme`: 681 live files, 0 matches. `npm run build` (tsc + vite, with `VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm`): passes; the preview serves this dist.
- cplm-api: `dotnet build` 0 warnings / 0 errors; `dotnet test tests/cplm-api.Tests` filtered to RegistryLoopFacts (new, 3),
  RegistryReads, ResponseChartRetention, ResponseEventsList, EvaluationApi, LoopRetire, LoopSignalPaths, BulkRepublish,
  EngineeringUnit: 77 passed, 0 failed (lab DB on 5436, connection string from the environment only).

## Browser check (preview :4173, lab API through :8081, read-only)

Built with `VITE_LOOP_ROOT_PREFIX=root.hdpev2.cpm`; the guard blocked every non-GET outside auth and READ_POSTS: 0 blocked, 0 HTTP
429, 63 API calls. Each screenshot looked at. No horizontal page scroll at 1440 / 1000 / 768 / 390 (all 30 shots).

| Check | Result | Screens |
|---|---|---|
| List, Day / Night, four widths | as the mockup; at 768 / 390 each loop is a card with its column names | `list-{1440,1000,768,390}-{day,night}.png`, `list-1440-{day,night}-full.png` |
| FIC10401, Day / Night, four widths | as the mockup; two columns at 1440, one below; at 390 the signals read as cards, the actions wrap to two rows | `detail-FIC10401-{1440,1000,768,390}-{day,night}.png` |
| Row click, Enter, back | `/cpm/registry?search=FIC103&page=1` → row → `/cpm/registry/FIC10302?search=FIC103&page=1` → "‹ All loops" → `/cpm/registry?search=FIC103&page=1`; Enter on a focused row opens it | `report.json` |
| Old link | `/cpm/registry?loop=FIC10302` → `/cpm/registry/FIC10302` | `report.json` |
| FIC10302 (VP connected) | VP "FIC10302.VP", Data "! No data" (latest window carried no VP: readiness TEMPORARILY_UNAVAILABLE); "✓ Valve position connected" | `detail-FIC10302-vp-connected-1440-day.png` |
| Not monitored (EVAPI_12F4CB) | "○ Monitoring off", "! 5 items to set", the Monitoring off item, Monitoring Off | `detail-not-monitored-1440-day.png` |
| Retired (lab has none: FIC10403 mocked) | "⊘ Retired" only, Restore loop, Edit loop disabled "Restore the loop first", Monitoring Off, Open episode (FIC10403's real open episode) | `detail-retired-mocked-1440-day.png` |
| New server fields (mocked loop read) | Changes "31 Aug 2026" / "4 Nov 2026", source tags "10-FIC-401.PV/SP" (others fall back), "Cascade master of FIC10402" | `detail-mocked-new-fields-1440-{day,night}.png` |
| Fallbacks live (old lab cplm-api) | no Changes card; source tags from the signal name | `detail-FIC10401-1440-day.png` |
| Not found | "No loop NO_SUCH_LOOP" / "It was renamed, removed or never added." + "‹ All loops" | `detail-not-found-1440-day.png` |
| Dialogs, opened never submitted | Edit loop (Day, Night), Retire loop, How to read; Resend and Valve position ? tips (Resend has no dialog: not clicked) | `dialog-*.png`, `tip-*.png` |

## Deviations from the brief, and why

1. **Linked loops are not added "in Edit loop".** The editor cannot add links: they come from the asset model's relationships
   (projected by "Resend to analysis"); Edit loop only sets "Interacting loops" (Expected / Not applicable). The brief's words would
   send people to a field that does not exist, so: empty card "No linked loops yet. Link the loops this one affects, or is affected
   by, in the plant model, then use Resend to analysis." (stand-alone: "A stand-alone loop: no linked loops are expected.");
   checklist "…link them in the plant model and use Resend to analysis, or set Interacting loops to Not applicable in Edit loop."
   Administration's plant model has no UI to add a relationship either (asset-model import / API today). Owner to confirm.
2. **The editor's words.** The editor showed raw codes, so page and editor now share one word source (`loopWords`), the editor's
   field labels match the page, the edit dialog is "Edit loop", and NOT_INSTALLED reads "Not fitted" in the editor too.
3. **Panel links not on the page:** Workbench ↗, Plant tree ↗ and "Loop Explorer →" (the approved mockup has only Gate
   Configuration ↗). Easy to add back.
4. **Kept as today, not as the mockup:** the dropdown reads "Not retired 243" (no brackets); the shared pager.
5. A retired loop: "—" in the Ready column and no readiness pill in its head; its checklist stays.

## Anything left / concerns

- **Lab data:** 237 of 243 lab loops store the UNKNOWN preset's model (command path UNKNOWN, topology UNKNOWN, objective UNSET, no
  service family / dynamic class) though their loop type is FIC / PIC / LIC / TIC, so their page reads "Final element: Not known",
  "Control goal: Not set". The page shows what is stored (what the engine is sent). A save in Edit loop or a bulk re-activate
  refreshes a stored preset (`LoopModelDimensions.Resolve`). Check the plant's registry before the release.
- **Units and ranges:** 232 of 243 lab loops have no PV unit, 66 no ranges: most rows show the units item. Rule as the brief.
- **List vs page count:** "Signals not in the plant model" is server-only (the list reads nothing per row), so such a loop shows one
  item more on its page than in the list. Lab loops checked: none had it.
- **Server text names the old button:** cplm-api's `peer_links` readiness message says `use "Re-project links & republish
  evidence"`; the registry pages no longer show it, the editor's saved-readiness ? and Loop Explorer's readiness causes still can.
  One-line text change in `CpmReadinessController` (outside this brief's additive-only server scope).
- **Narrow widths:** below 820 px the list's head row is visual-hidden (cards carry the column names), so the Valve position ? is
  not reachable there, and How to read no longer carries the valve words (each fact once). Owner to say if it should show there.
- The retire / edit dialogs keep their CHG-192 subtitle "FIC10401 · Flow controller (FCS0101)"; the page says "· FCS0101".

## For the release records (prod_decision.md / changes_tracker.md, not edited here)

- Services: **frontend** (Loop Registry list + `/cpm/registry/:loopId`) and **cplm-api** (additive `createdAt`, `updatedAt`,
  `sourceTags` on `GET /api/v1/cpm/loops` and `GET /api/v1/cpm/loops/{id}`). No migration, no schema change, no config. An older
  cplm-api with the new frontend shows no Changes card and source tags from the signal names (tested live).
- Old links `/cpm/registry?loop=X` keep working (redirect in the page).
