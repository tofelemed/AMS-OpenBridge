# SME review round 2: check of every point against the code

Review text: [SME_review_2.md](SME_review_2.md). Checked 2026-10-14 on `feat/v25-next-release` (HEAD 7a0f67e1), read-only, by
reading the code (file:line evidence below). Verdicts:
- **VALID**: the SME is right and it is not fixed.
- **PARTLY**: part is right, part is already fixed.
- **FIXED**: already done.

Size: S = hours, M = about a day, L = several days.
Services: FE = ams-frontend, API = cplm-api, ENG = Flink engine (owned by the gates session).

## Summary

| # | Point (short) | Verdict | Size | Services |
|---|---|---|---|---|
| 1–5 | Keep: menu grouping, loop context, Explorer trend tools, evidence score wording, interactivity | confirmed — keep | — | — |
| 6 | Same diagnosis word / band everywhere | **VALID** | M (FE) / L (+ENG) | FE, ENG |
| 7 | "Ruled out" mixes evidence-against with not-assessed | **VALID** | S (FE) / M (+ENG) | FE, ENG |
| 8 | Blank value with green OK on Calculations | **VALID** | S–M | FE |
| 9 | Calculation windows (60 m vs 12 h) + proof links | **VALID** | M | FE (+API) |
| 10 | Fleet headline uses top-50 loops | **VALID** | M | API, FE |
| 11 | Fleet MAE mixes engineering units | **VALID** | M (with 10) | API, FE |
| 12 | "Acceptable" needs own performance criteria | **VALID** | M | API, FE |
| 13 | Change label: percentage points vs % | **VALID** (wording) — conflicts with your "no pts" request | S | FE |
| 14 | Recommendations per diagnosis | **VALID** | S | ENG (+FE interim) |
| 15 | System Response dates, units, uncertainty | **VALID** | M | FE (+ENG optional) |
| 16 | Loading layout, races, retry | **PARTLY**: no race exists; layout jumps and missing retries are real | M | FE |
| 17 | Export labels and contents | **VALID** | M (L with server ZIP) | FE (+API) |
| 18 | Reconstruction identity (retained vs reconstructed) | **VALID**, reverses the CHG-076 design | L | API, ENG, FE |
| 19 | VP applicability complete | **PARTLY**: mostly fixed (CHG-077/088); 4 wording gaps left, 1 real mislabel | S | FE |
| 20 | Shorter loop summary | **PARTLY** | M | FE |
| 21 | Repetition Explorer / Investigation / Workbench | **VALID** | M | FE |
| 22 | KPI card emphasis and green | **PARTLY** | M | FE |
| 23 | Readability (type scale, width, decimals) | **VALID** | M | FE |
| 24 | Gate matrix as advanced view, symbols | **PARTLY**: symptom vs failed already fixed | M | FE |
| 25 | Compact Events / Calculations tables | **VALID** (nested scroll already avoided) | M | FE |
| 26 | Charts central (KPI → highlight, finding → period) | **PARTLY**: band, units, compare-with-now done | M–L | FE |
| 27 | Interaction feedback | **PARTLY**: hover done | S–M | FE |
| 28 | Registry wizard: path space, validation, change preview | **VALID** | M | FE (+API) |
| 29 | Empty / loading states, disabled-button reasons | **PARTLY**; includes a regression from CHG-089 | M | FE |

**Result:** 24 points checked. None of them is wrong. 15 are fully valid; 9 are partly valid, with part already fixed.

**Extra finding (not in the review):**
- `G3.objective_compliance_min` is catalogued as a fraction 0–1. The factory value is `0.005`, which `BundleProfileMapper.java:54` reads ×100 (= 0.5, consistent), but `FactoryLayer.java:34` writes /100.
- Today it is consistent, but it is a trap: an engineer who enters 0.5 (meaning 50 %) makes the engine compare against 50, so G3 is always WARN.
- This is engine work, for the gates session.

## Evidence per point (condensed)

**6.** The engine disagrees with itself by construction:
- `DiagnosisBands.java:43-72` writes `diagnosis = DETECTED_x` / `CLASSIFIED_x` with `gate15Status = "SUSPECTED"`.
- `applyPersistence` (`CplmGateFusionEngine.java:419-424`) turns a non-persistent CONFIRMED into `DETECTED_` + G15 SUSPECTED.

The UI then has five vocabularies for the same value:
- `diagnosisLabel` ("…detected")
- `diagnosisBand` ("Developing", Historical only)
- `toneFor` (SUSPECTED red)
- `gateMark` (G15 SUSPECTED amber △)
- KPI pages ("No fault found" vs "Not evaluated yet" for `NO_CALL`)

Two further gaps:
- Events title by the **peak** diagnosis without saying so, and `EventDetail.severityOf` uses its own thresholds.
- The CSV has raw codes, no band and no "latest" marker.

**7.**
- `Hypothesis.java:35-40` only ever emits QUALIFIED or DISQUALIFIED; NOT_ASSESSED is never sent.
- EXTERNAL_DISTURBANCE without peer links and SENSOR without a health source are DISQUALIFIED (`VerdictAssembly.java:72-91`).
- `causeAnalysis.ts:84-87` puts every DISQUALIFIED under "Ruled out" and only appends "could not be checked fully".
- Missing input is therefore shown as evidence against.

**8.**
- `CpmCalculations.tsx:123-133` judges each metric by the **fused gate status** (`gateMark`, PASS = green ✓ OK), never by the metric.
- `:110-113` gives a reason only when a value exists, so a null value renders "—" next to green OK.
- `metricAvailability.ts:70` already has "not calculated" but the page ignores it.
- The "Gates acceptable" tile is hard-coded green (`:235`).

**9.**
- Short-tier metrics (CPLM-001…020) come from the **60 m** row (`:72`, `calcCatalogue.ts:25-33`) but are judged by the **12 h** fused gate.
- The fused row's own 12 h-slice MAE (`FusionInputs.java:40`) is never shown.
- The window column shows the end only.
- `calculationsHref(loop)` carries no metric and no window. KPI proof links (`kpiProof.ts:92`, `LoopKpiCards.tsx:24-27`) land on the generic page.
- `LoopKpiCards.tsx:23` uses `end − 24 h` even for 12 h.

**10.**
- `CpmPerformance.tsx:143` fetches the 50 most confident loops.
- Good-error mean, median MAE and periodic count are computed over those 50 only (`:165-175`), a sample biased to loops with findings.
- `/fleet/summary` has no metric aggregates.

**11.**
- The median of raw `mae` across loops (`CpmPerformance.tsx:165`) is labelled "PV units", toned green.
- `orderBy=mae` (`CpmFleetController.cs:176`) ranks m3/h against °C.
- Span normalisation exists per loop only (`loopKpiView.ts:50`).

**12.**
- `FleetKpiClassifier.cs:49-50`: acceptable = `NO_CALL`/`INSUFFICIENT_EVIDENCE` + AUTO ≥ 95 % + not saturated. There is no error or effort criterion.
- G3 (good-error share vs profile floor) and G4 (effort) are already on the same fused row (`FusionInputs.java:40-67`) but not read by `FleetKpiSql`.

**13.**
- `kpiMeta.ts:86` and `loopKpiView.ts:72` show "23 %" for a 50 → 73 % change. The arithmetic is points; only the hover says "percentage points".
- This was your request on 2026-10-10 (remove "pts").

**14.** `CplmGateFusionEngine.java:248-252` gives every qualified family (stiction, oscillation, **effort**) the same "positioner / bump test before retuning" text. The frontend shows it verbatim (`summaryText.ts:78`, `CpmInvestigation.tsx:167,267`).

**15.**
- `CpmChart.tsx:81` + `timezone.ts:33` give the time axis as `HH:mm:ss` only, so model history across days repeats "12:00:00".
- Parameter titles are raw ids (`process_gain`).
- Units are kernel placeholders (`PV_EU/input_EU`), never the loop's unit.
- "± uncertainty" is drawn as two extra series with no meaning: it is 1 s.e. for most parameters but grid resolution for dead time.

**16.**
- No race: react-query keys are complete and requests abort.
- The live trend blanks every 60 s (`OperatingState.tsx:48`, no `keepPreviousData`).
- Historical refetches everything on any URL change when no range is pinned (`CpmHistorical.tsx:98-106`).
- Performance tiles show "0 / good" while loading or failed.
- 6 error sites have no retry.

**17.**
- Historical "Export CSV" is evaluated windows + diagnoses only, with no loop id in the body, no period, no timezone and no units.
- Signal samples cannot be exported.
- Chart CSVs are named `Output.csv` with epoch-ms x.
- There is no evidence-package download.

**18.**
- CHG-076 made reconstruction **replace** retained artifacts under the same identity.
- It runs the current jar and reads IoTDB by default.
- The UI shows the original identity only. Provenance and retention class are hidden (`gateFacts.ts:28-31`).
- G12's disabled "Reconstruct" gives no reason.

**19.** Done: the declaration, persistence, warning removal, engine NO_VP, and no false confirmation (0.89 cap kept by decision). Still open:
1. `confirmationCopy.ts:49-50` says "symptom family" for a no-VP valve claim (`VP_NOT_APPLICABLE`). This is the real mislabel.
2. `causeAnalysis.ts:25` "VP tracking would confirm it" on no-VP loops.
3. `ReasoningChain.tsx:47` raw NO_VP.
4. `verdictCopy.ts:12` without loop context.

**20.** Diagnosis, severity, cause and next action are already on top. But Basis, Not checked, Limitations and Data are always expanded in the card, and the readiness bar sits above the tabs, so the trend falls below the fold. The diagnosis is shown 3 times.

**21.** These blocks render in full on 2–3 pages:
- `basisOf`
- cause breakdown
- limitations
- recommendation (twice on Investigation)
- evidence-score note

**22.**
- Per-loop cards: 9 equal cards, no grouping, no link to the finding.
- Green for coverage ≥ 95 % (data present ≠ good control), saturation ≤ 10 %, and G3/G4 PASS even next to a finding.
- Overview: the group model exists (`fleetKpiView.ts:14-19`) but the titles are not rendered.

**23.** No type scale:
- 10 font sizes below 0.85 rem (down to 0.66 rem).
- Chart labels 10–11 px.
- Some text blocks have no max-width.
- 3-decimal output in Replay, evidence format, G13, Response.
- Fixed `toFixed(2)` tiles.

**24.**
- The full G0–G15 matrix is the default, with code-only headers.
- Eligibility FAIL and EXCLUDED share ⊘.
- "Ruled out" reuses ✓ and is not in the legend.
- "—" covers not-evaluated, N/A, disabled and pending.
- Already fixed: symptom vs failed check (CHG-052/064).

**25.**
- Events and Calculations headers are not sticky.
- The Events selected row looks like hover; Calculations has no selected state.
- No column sorting.
- Paging already avoids nested scroll on these two pages.

**26.**
- Done: evaluated-window band, units, compare-with-now (CHG-067).
- Missing:
  - a KPI click only navigates away, with no in-place highlight;
  - Events / EventDetail open the loop without the episode period;
  - no previous-vs-current window comparison on an aligned axis.

**27.**
- Hover is done.
- Selected states are weak.
- 4 transitions in the whole CPA.
- **No toast or confirmation** after acknowledge, shelve, unshelve, note link or republish (react-toastify is mounted but unused in CPA).

**28.**
- Path inputs are about 260 px wide in a 860 px modal, with no copy and no full-path tooltip.
- A malformed path or a half-declared range does not block Continue.
- The review step lists roles, not paths, and shows no change diff for an edit and no expected effect.

**29.**
- 112 empty states, about 20 with a next action.
- Several disabled buttons have no reason (Continue, Export, Reconstruct, Review, pagers).
- Technical wording in places, e.g. "Flink JobManager did not answer".
- **Regression from CHG-089:** `SelectedWindowPanel.tsx:55,64` and `CpmReplay.tsx:197,206,264` still say "24h window" while the default is now 12 h.

## Proposed fix plan (for approval — nothing changed yet)

| Phase | Points | Services | Size |
|---|---|---|---|
| **A. Wrong or misleading information** (first) | 8, 9, 13, 19 (4 gaps), 29 "24h" regression, 22 green tones, 7 (UI regrouping), 6 (UI shim: one band/word table) | FE | M |
| **B. Fleet numbers on a proper basis** | 10, 11, 12 | API, FE | M |
| **C. Engine items** (hand to the gates session) | 6 (G15 status = band), 7 (NOT_ASSESSED / NO_EVIDENCE states), 14 (per-family recommendation), G3 compliance trap | ENG | M |
| **D. Charts and data out** | 15, 16, 17, 26 | FE (+API for the evidence package) | M–L |
| **E. Layout and interaction** | 20, 21, 23, 24, 25, 27, 28, 29 | FE | L |
| **F. Reconstruction provenance** (needs a decision: reverses CHG-076) | 18 | API, ENG, FE | L |

Decisions needed before starting:
1. **Point 13:** which change label? Options: "+23 pp" / "50 % → 73 %" / keep "23 %" (current).
2. **Point 12:** add "G3 pass (good-error share ≥ profile floor) and G4 not strong" to "Performing acceptably"?
3. **`NO_CALL` app-wide:** "No fault found" everywhere (as on the KPI pages)?
4. **Point 18:** keep the original evidence and store a reconstruction beside it? This reverses CHG-076's in-place replacement.
5. **Engine points (phase C):** hand to the gates session? Meanwhile, phase A adds frontend shims so the screens agree.

## Status

**User decisions (2026-10-14):**
1. Percentage points.
2. Own performance criteria: G3 pass and G4 not strong.
3. "No fault identified" app-wide.
4. Keep the original evidence and store a reconstruction beside it, mindful of performance, space and retention.
5. Phase C handed to ams-open-e0.

| Phase | State | Commit / CHG |
|---|---|---|
| A | Done. Lab browser check pending | CHG-092: `d3d6cfcf`, `67db1e88` |
| B | Done. DB endpoint tests and lab check pending (Docker stopped) | CHG-093 |
| C | With ams-open-e0 | CHG-094..096 |
| D | Done. Lab browser check pending | CHG-097 |
| E, F | Not started | — |
