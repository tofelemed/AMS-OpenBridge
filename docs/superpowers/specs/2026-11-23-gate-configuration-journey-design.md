# Gate Configuration as a guided journey (CHG-221) and the shadow run fixes (CHG-222)

Owner-approved 23 Nov 2026 from the mockups (`docs/theme/redesign/samples/gate-configuration-journey.html`, screens
start / loop / start-change / change-check / change-approve / region / regions). Owner: "flow is good", "go ahead with
building", plus the text rules below.

## Intent

The owner could not follow the Gate Configuration page: two loop searches, a loop that replaced the list on the same page,
three view toggles (Effective | Bundles | Per-loop settings) whose loop context did not carry, and the change lifecycle
hidden in a bundle's five tabs. Every other CPA page leads the user step by step; this one must too, in the same look.

## Goals

- One loop search. A loop opens its **own page**, like Loop Registry's `/cpm/registry/:loopId`.
- A **start page** that says what can be changed and what is waiting for a step, instead of a 243-row list.
- A **change page** that walks one change through Edit → Check → Try on past data (optional) → Approve → Deploy.
- **Dialogs** for starting a change, editing one loop's region and editing many regions.
- Clean text: each fact once, no explanations on screen, no backend terms; important rules behind a `?`.
- "Try on past data" actually produces a before / after (CHG-222).

## Non-goals

- No server change for the redesign itself: every screen uses the existing cplm-api endpoints.
- No change to the approval, deployment or rollback rules (CHG-108 follow-ups stay as built).
- "Use plant-wide settings" (drop a loop's own settings) is CHG-223 (cpa updates builds engine + API); the UI adds its
  button when that API exists, hidden until then.
- Cascade, Manual mode: later phase (unchanged).

## Anti-goals

- No new UI library, no raw colours or sizes (OpenBridge / Traverse tokens, `ObcButton` for every action).
- No density change (keep current app sizes). No removal of a capability: everything today's three views and five tabs can
  do stays reachable.

## Screens and routes

| Route | Screen | Replaces |
|---|---|---|
| `/cpm/config` | **Start page**: header (eyebrow "Set up", title, one loop search, How to read); four cards *One loop · A loop type · Whole plant · Operating regions* (title with `?`, one status line, one button); the re-stack notice when loops miss the latest plant settings ("Update them"); **Changes in progress** (change + reason, step bar + next step, who · when, Continue); **Running now** (applies to, settings version, since). | Effective with no loop, Bundles with no loop |
| `/cpm/config/loops/:loopId` | **Loop page**: "‹ Gate Configuration", title = loop id, one line = service name · unit (only a real name), pills = settings version + a change in progress (opens it). Buttons: Open loop ↗, Edit region, **Change settings**. Tabs: *Values in use* (gate dropdown + find a setting; Setting · Value · From) · *Operating region* · *Versions* (the loop's LOOP / PROFILE / SITE versions; open one; roll back from the running one). | Effective / Bundles with a loop |
| `/cpm/config/types/:profileId`, `/cpm/config/plant/:site` | Same page for a loop type (PROFILE) and the whole plant (SITE): Values in use (factory + that level), Versions, Change settings. | Bundles levels PROFILE / SITE |
| `/cpm/config/changes/:bundleId?step=` | **Change page**: back link to where it applies ("‹ FIC10302", "‹ Flow, fast self-regulating", "‹ Whole plant"); title = version ("Own settings v13"); one line = reason · author · when; one state pill. Step bar Edit · Check · Try on past data (optional) · Approve · Deploy with ✓ / current; each step's body is today's tab content (PropertiesTab, DiffImpactPanel, ShadowComparison, ApprovalTab, DeploymentsTab), cleaned of explanations; footer ‹ Back / Next. | Bundle editor (`view=editor&bundle=&tab=`) |
| `/cpm/config/regions` | **Operating regions**: table (select, Loop, Type, PV range, Region, From); "Edit regions (n)" opens one dialog for the selected loops; the open batch's Approve / Deploy as today's batch panel, restyled. | Per-loop settings view |

Dialogs: **Start a change** (apply to: this loop / every loop of its type (n) / whole plant (n), Reason, Cancel · Start →
creates the draft from the version running at that level and opens the change page at Edit); **Edit region** (one loop: bar
of the region inside the PV range, Minimum, Maximum, "Now … · PV range …", Reason, Cancel · Save → a region batch of one,
opens its change); **Edit regions** (many loops: Loop, PV range, Now, Minimum, Maximum with an "Above / Below the PV range"
error, Reason, Cancel · Save). Rollback keeps its confirm dialog, now naming the version that will run.

Legacy links: `configHref()` builds the new routes; an old `/cpm/config?loop=…&view=…&bundle=…&tab=…` address is replaced
by the matching new route on arrival (bookmarks and audit links keep working). The sidebar keeps Gate Configuration selected
on every sub-route (it already matches `/cpm/config/*`).

## Text rules (owner, 23 Nov)

- Each fact once. A sub-page's back link names the parent, so the title does not repeat it and there is no eyebrow.
- No generic descriptions ("Flow controller · FCS0101") under rows; a description only when it is a real name.
- No backend terms on screen: property codes, "verified", workers, PREPARE / APPLY, hashes, ISO. Plain names
  ("Region maximum"); a property code may appear on hover. Levels are "Own settings / Type settings / Plant settings /
  Factory".
- No explanatory sentences. A rule a user really needs sits behind a `?` placed beside the heading or step it explains,
  never between action buttons. Every cut is logged in `docs/theme/redesign/text-changes.md`.
- Buttons as on the Loop Registry page: secondary actions light (`ObcButton` normal), one raised primary, top right;
  dialog footers Cancel · primary on the right.
- Peer findings folded in: deployment state shown once with "takes effect at"; a date-time picker naming the plant zone
  for "effective from"; deployment rows in words, not ACK counts; shadow says "starting (about 30 s)" and "waiting for free
  capacity"; the misleading "no live results" sentence goes.

## CHG-222 (cplm-api, `CpmConfigurationController.Shadow`)

1. **Orphan run.** The Flink submit takes ~29 s; a client giving up at 30 s cancelled the request token, so the run started
   but the bundle was never linked. Once the run is requested, the submit and the link use a token the client cannot
   cancel; the frontend gives this call a longer timeout.
2. **Comparable windows.** The replay evaluates 24 h tumbling windows at `windowOffsetMs`; it used the data's own start, so
   a shadow never ended on a LIVE window end and nothing was compared. The run now ends at the loop's newest LIVE 24 h
   window end (bounded read, fallback: now floored to the quarter hour), covers whole days (hours rounded up to 24 h
   multiples, at most 7 days), and passes `offset = end mod 24 h`, so each shadow window ends exactly where a LIVE one does.

## Approaches considered

1. **Restyle the current single page** (keep the toggles, fix texts): cheapest, but keeps the confusion the owner named
   (context not carried, no start, steps hidden). Rejected.
2. **Sub-pages + change page reusing today's components** (chosen): new routes and shells; the step bodies, hooks, API and
   rules are today's, regrouped and cleaned. Moderate size, low risk, no server change.
3. **A wizard-only flow** (everything in dialogs): hides the record of a change and does not match the rest of CPA, which
   uses pages for records and dialogs for edits. Rejected.

## Left to the builder

File split (≤ 400–500 lines each), test rewrites, CSS reuse of the existing `cpm-*` classes and tokens, how the start page
derives "Changes in progress" from the bundle summaries (states DRAFT … PREPARED) and "Running now" from the active rows,
and the "?" texts (from today's copy, shortened).
