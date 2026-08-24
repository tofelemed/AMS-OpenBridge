# CPM/CPA UX remediation — plant scoping, loop search, and page structure

Two workstreams from the twelve-page audit (2026-08-24). Findings that drive them:

- **No CPM page filters by plant location.** The fleet API already accepts `?site=`
  but every page passes `undefined`; `area`/`unit` are not supported server-side at all.
- **`LoopSelect` is a flat `<select>` of every loop** — no search, no grouping — and
  four pages depend on it (Calculations, Historical, Windows, Replay).
- **`/cpm/loops` already returns `site`/`area`/`unit` per row**, so loop-list pages can
  filter client-side for free; only the aggregate fleet endpoints need backend work.
- Four pages stack 5–8 sections on one scroll where tabs fit the task better.

Legend: `[ ]` todo · `[x]` done · `[~]` in progress · `[-]` deferred

---

## Workstream A — Plant scope + loop search

### A1 — Shared scope filter (foundation)
- [x] A1.1 `<PlantScopeFilter>` in `Cpm/plantScope.tsx`: site → area → unit cascade
      reusing the existing `useSiteFilters`/`useAreaFilters`/`useUnitFilters` hooks
- [x] A1.2 Scope persisted in the URL (`?site=&area=&unit=`) so it survives navigation
      between CPM pages and is shareable
- [x] A1.3 `useCpmScope()` hook — reads the URL scope, returns `{site, area, unit}` +
      a `matches(loop)` predicate for client-side list filtering

### A2 — Searchable loop picker (fixes 4 pages at once)
- [x] A2.1 `<LoopPicker>` replacing `LoopSelect`: type-ahead over loop id, service,
      area, unit and loop type; options grouped `site / area / unit`
- [x] A2.2 Honour the page scope — when a scope is set the picker lists only in-scope
      loops, with an explicit "N hidden by scope" affordance
- [x] A2.3 Swap into Calculations, Historical, Windows, Replay (keep `LoopSelect`
      exported as a thin alias so nothing else breaks)

### A3 — Explorer tree
- [x] A3.1 Deepen `site → loops` to **site → area → unit → loop**
- [x] A3.2 Widen search to match area, unit and loop type (today: id + display name only)
- [x] A3.3 Auto-expand the branch containing the selected loop

### A4 — Loop Registry
- [x] A4.1 Add the scope cascade beside the existing search box
- [x] A4.2 Search also matches unit and loop type
- [x] A4.3 Count line reflects scope ("N of M loops")

### A5 — Backend: area/unit on the fleet endpoints
- [x] A5.1 `GET /fleet/summary` — add `area`, `unit` (`site` already present)
- [x] A5.2 `GET /fleet/rankings` — same
- [x] A5.3 `GET /fleet/heatmap` — same
- [x] A5.4 Echo the applied scope in each response so the UI can show what it filtered by

### A6 — Wire the fleet pages
- [x] A6.1 Performance — scope filter → `useFleetSummary/Rankings/Heatmap`
- [x] A6.2 Overview — scope filter → fleet summary + priority queue
- [x] A6.3 Investigation — scope filter over the ranked case list
- [x] A6.4 Events — scope filter + free-text search (loop id / tag / message)

### A7 — Lower tier
- [x] A7.1 Governance — search by actor / loop / action (more useful than location here)
- [-] A7.2 Pipeline — location filter deliberately skipped: runtime internals are
      fleet-wide by nature

---

## Workstream B — Page structure (stacked sections → sub-pages)

Also serves the 400–500-line file ceiling (CLAUDE.md).

### B1 — Investigation (505 lines, 8 sections) — worst offender
- [x] B1.1 Case list → selected case → tabs: **Conclusion · Evidence · Reasoning · Hypotheses**
- [x] B1.2 Tab state in the URL (`?tab=`) so a case view is shareable
- [x] B1.3 Split file if it stays over the ceiling

### B2 — Overview (568 lines, 7 sections)
- [x] B2.1 Keep as the operator dashboard: KPIs + priority queue + highest-impact finding
- [x] B2.2 "Focused loop analysis" + "Evidence path" become a drill-through, not a stack
- [x] B2.3 Remove the "Live Flink runtime" panel — it duplicates Pipeline; link instead

### B3 — Explorer detail pane (609 lines)
- [x] B3.1 **Audit correction — already done.** The detail pane already had five
      URL-persisted tabs (Summary/Signals/Calculations/Relationships/History);
      the section eyebrows I read as "stacked" were *inside* those tab
      components. Only change made: switched its `ObcButton` pills to the shared
      `WorkspaceTabs` so all three tabbed screens share one idiom
- [x] B3.2 Tab state in the URL alongside `?loop=` — was already correct

### B4 — Historical (520 lines)
- [x] B4.1 **Scoped down deliberately:** the trend, mode track and diagnosis bands are
      aligned on ONE time axis — splitting them would break the comparison they exist
      for. Two tabs instead: **Trend & diagnosis** / **Window detail**
- [x] B4.2 Time range controls stay above the tabs

### Unchanged by design
- [-] Replay — already tabbed
- [-] Windows, Pipeline, Performance, Calculations, Registry — 2–3 sections, fine

---

## Validation

### V1 — Build
- [x] V1.1 `dotnet build` cplm-api clean
- [x] V1.2 `tsc --noEmit` + `eslint --max-warnings 0` + `vite build` clean
- [x] V1.3 Images rebuilt and redeployed healthy

### V2 — API tests: plant/area/unit filters
- [x] V2.1 `/fleet/summary` unscoped vs `?site=` vs `?site=&area=` vs full `site+area+unit`
      — counts must narrow monotonically and match a direct SQL count
- [x] V2.2 `/fleet/rankings` same ladder; every returned loop's site/area/unit must match the scope
- [x] V2.3 `/fleet/heatmap` same ladder
- [x] V2.4 Unknown scope (`?site=atlantis`) → empty result, not an error
- [x] V2.5 Scope echoed back in each response
- [x] V2.6 `/assets/filters/*` cascade still correct (the source of the dropdown options)

### V3 — Search filters
- [x] V3.1 Loop-list search (client-side) verified against the same predicate server-side:
      pick a term, compare UI-visible set to a SQL query over loop_id/display_name/area/unit/loop_type
- [x] V3.2 Scope + search combined narrows correctly (intersection, not union)

### V4 — UI walk
- [x] V4.1 Playwright: scope cascade on a fleet page narrows the visible loop set
- [x] V4.2 Playwright: loop picker type-ahead finds a loop by area/unit, not just id
- [x] V4.3 Playwright: tabbed pages switch and deep-link (`?tab=`)
- [x] V4.4 Full smoke suite still green — **22/22**


---

## Evidence (2026-08-24)

**API scope + search — 24/24** (`test_scope_filters.py`, every assertion compared to
ground-truth SQL): summary/rankings/heatmap ladders match SQL counts and narrow
monotonically; every returned loop matches the requested scope; unknown scope → 200
with zero rows (not an error); scope echoed back; `/assets/filters` cascade intact;
loop-search predicate matches an equivalent SQL `LIKE` over
id/name/area/unit/site/type for four terms; scope ∩ search is a true intersection.

**Area/unit ladder on real hierarchy data — 14/14.** The dominant demo scope
(`houston/crude1`) has an *empty* area, so area filtering was only covered by the
negative case. Three probe loops were activated across two real HDPE areas
(`section_100` ×2, `section_300` ×1) to prove it properly: area genuinely narrows
(3 → 2), the two areas **partition** the site (2+1 = 3), unit narrows within area,
every returned row matches, both echo back, and an area name from a *different*
site returns nothing (no cross-site leak). Probes retired afterwards — 15 projected
assets released, registry back to its 54-loop baseline.

**UI walk — 22/22** (Playwright, production `:3000`): scope cascade present on
Performance and writes `?site=hdpe` to the URL; area cascade loads for the chosen
site; Registry renders a scoped count; loop picker exposes the wide filter and
groups options by location (8 groups); Investigation renders 4 workspace tabs and
honours `?tab=evidence`; no console errors.

**Builds:** cplm-api ✓ · `tsc --noEmit` ✓ · `eslint --max-warnings 0` ✓ ·
`vite build` ✓ · images rebuilt and healthy.
