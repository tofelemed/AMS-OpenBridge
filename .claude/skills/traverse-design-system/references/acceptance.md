# Acceptance checks and R01 corrections

Source: guide pages 7, 16, 27–29. These are requirements for the built interface; the
static concepts do not demonstrate that they pass.

## Shared acceptance criteria

| ID | Check | Pass condition |
|---|---|---|
| G01 | Theme parity | Every page renders in Day and Night with unchanged domain meaning and user context |
| G02 | Token consistency | Colours resolve from the semantic tokens; no module brand overrides or sampled raster colours |
| G03 | Shared shell | One logo, icon set, module order, search label, time selector and selection treatment across the suite |
| G04 | Keyboard access | Primary tasks operable by keyboard with a visible unclipped focus indicator and labelled controls |
| G05 | Colour independence | Status, selection and chart meaning remain understandable using labels, shapes or line styles |
| G06 | Data states | Loading, empty, partial, stale, bad-quality, unavailable and restricted states are distinguishable |
| G07 | Context continuity | Plant, identity, interval and time zone survive navigation and return to the previous view |
| G08 | Numerical consistency | Cards, tables, chart geometry and exports use the same dataset, units, scope and calculation version |
| G09 | Source traceability | Evidence actions resolve to real permitted records; missing or broken bindings remain explicit |
| G10 | Review integrity | Saving validates fields, records actor and time, handles concurrency and preserves audit history |
| G11 | AI transparency | AI output shows authorship, review state, evidence and missing coverage without fabricated confidence |
| G12 | Responsive clarity | Reference desktop widths, zoom and narrow layouts retain key identity, units, actions and legible content |

Visual review conditions: 1440 × 1024, 1366 × 768 and 1920 × 1080, both themes, with long
tags, large numbers, missing sources and many records. Do not claim complete WCAG
conformance from the colour-pair audit; keyboard, semantics, zoom, reflow, motion and
actual component rendering require their own review.

## Accessibility baseline

- ≥ 4.5:1 for ordinary text, ≥ 3:1 for necessary graphical or control cues, against the adjacent surface.
- Always a visible alternative to colour: label, code, shape or line style.
- 2 px focus outline with 3 px gap exposing the neutral surface, never clipped.
- Keyboard access to rows, graphs and timeline events; meaningful control names; readable zoom/reflow; reduced motion honoured.

## Data-state presentation

| State | Required presentation |
|---|---|
| Loading | Labelled skeleton or progress state; retain the selected context |
| Empty | Explain that no matching records exist; offer the relevant filter reset |
| Partial | Identify missing sources or intervals; label coverage and affected metrics |
| Stale | Keep the last value with its timestamp and a Stale label |
| Bad quality | Show the source quality state beside the affected value or interval |
| Unavailable or error | Keep successful panels visible; offer source-specific retry |
| Permission restricted | Explain that the requested action or record is restricted |

## Instrumental module checks (guide p.14–16, 28)

- Open device history from a diagnostic category; retain installation identity (`device_id` + installation period) and keep PV quality separate from device condition.
- Fleet counters: define and expose whether they count devices or active diagnostic records; a device may contribute to more than one category.
- F, C, S, M are categories, not a severity scale. Unknown sits under status availability.
- Diagnostic interval widths match their durations. Latest "Good"/"Current" labels stay separate from historical gaps.
- Review (workflow) does not clear the diagnostic (source state). Separate columns/fields.
- Work request: no success shown until the external system returns an identifier; retries preserve one intended request.
- If diagnostics, workflow actions and sample-quality events share a table, name it "Event log" with an event-type column.
- Device photographs are illustrative until matched to the installed model.

## Corrections that override the illustrations (all modules)

- Shared shell: standardise logo geometry, module icons, search wording, user display and selected-navigation treatment; the examples vary.
- Rebuild charts from data; use a coherent fixture; preserve exact units and dates. Raster gradients, accidental alignments and example numeric shapes are not specifications.
- RCA "Supported" uses the informational treatment until a cause is verified.
- Downtime: the time-window control either selects or actually zooms; never label a selection as a zoom.

## Decisions required before live workflows (guide p.29) — relevant to Instrumental

| Decision | Responsible role | Needed before |
|---|---|---|
| Device diagnostic aggregation and source label mapping | Instrumentation and Instrumental owner | Fleet counters and normalised status display |
| Alarm priority and symbol mapping | Alarm management and operations | Any source alarm colour or acknowledgement workflow |
| Plant time zone and reporting-day boundary | Operations and data owner | Daily aggregation and cross-source comparisons |

## Release discipline

Version the token source and the shared component library together. Record changes to
colour semantics, workflow states or metric definitions in release notes. Review theme
parity whenever a shared component changes. Re-run `scripts/contrast.py` after any token edit.
