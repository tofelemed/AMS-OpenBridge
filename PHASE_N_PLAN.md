# PHASE_N_PLAN — closing the Designer gaps (N1–N6)

Every phase is benchmarked against **AVEVA PI Vision 2025** (User Guide + a real `.pdix` export from
`301-Kiln.zip`, which is the actual PI Vision wire schema), **Ignition / FactoryTalk / WinCC** where they
differ, and **ISA-101 / ISA-18.2 / EEMUA-191**. Where PI Vision is *worse* than what we already have, we
say so and keep ours.

**The reframing finding:** `NavigationLink`, `hidden`, `locked`, `zIndex`, `groupId`, `rules`,
`multiStateConfig` and 17 named binding slots **already exist in the model and are already honored by the
runtime**. The gap is almost entirely **authoring UI**. That changes the order of work: unblock the
layout, then fix the data-loss bug, then add the missing UI.

---

## N1 — Layout: the asset browser must not replace the property inspector

**Today:** the right sidebar is `AssetBrowser` **XOR** `PropertyInspector` (`DisplayDesigner.tsx`,
`showAssetBrowser`). You cannot see the tag tree and the symbol's properties at the same time — which
makes binding a *named slot* (status / level / setpoint …) physically impossible, because the slots live
in the inspector and the tags live in the browser. And `AssetBrowser` only ever writes `bindings.value`,
so **16 of our 17 slots are unreachable from the asset tree.**

**PI Vision:** Assets pane + Attributes pane are a **permanent left rail**; the Configuration pane is on
the right. Ignition and WinCC do the same (sources left, properties right). This layout exists precisely
to solve the problem above.

**Do:** left panel gets tabs **Symbols | Assets** (asset tree + the selected asset's measurements).
Properties stay pinned right. Panels collapse (persisted) and resize (240–480px). `fitToScreen` must
recompute from the live canvas rect after a collapse.

---

## N2 — Multi-select bulk property editing  *(fixes an active data-loss bug)*

**Today:** `selectedId = selectedIds[0]` — with 5 symbols selected the inspector **silently edits only
the first**. That is worse than not supporting multi-select; it's a trap.

**PI Vision** (right-click → **"Format Symbols"**, plural) gives two rules verbatim:
1. *"Some properties can only be edited when a single symbol is selected"* → an explicit **bulk vs
   single-only partition**.
2. *"If the value of a property is blank, this means the value … is currently set to different values"* →
   **mixed values render as an EMPTY field**, and typing applies to all.
And PI Vision **refuses bulk binding** — the legacy app in this repo spells out why: *"Configure data
bindings for each element individually to ensure precise industrial traceability."* We follow that.

**Do:** `PropertyInspector` takes `selectedItems: CanvasItem[]` + `onUpdateMany`. A `common()` helper
returns MIXED when the selection disagrees; MIXED renders as an empty field with a `Mixed` placeholder and
**is never seeded from item[0]** (the exact bug the legacy app has). Partition:

| Bulk-editable | Single-only |
|---|---|
| `style.*`, `formatting.*`, `textProps.*` | **`bindings.*` — never bulk (traceability)** |
| `size.*` (set-equal), `rotation`, `flipH/V`, `locked`, `hidden`, `zIndex` | `label`, `navigationLink`, `alarmLimits`, `multiStateConfig`, `rules`, `type` |
| align/distribute/z-order/group (already work) | raw `position.x/y` — **disabled on a multi-selection** (writing an absolute X to 5 items stacks them; use Align instead) |

One bulk edit = **one** undo entry. Guard empty numeric inputs (an accidental `0` opacity across 20
symbols is a bad afternoon).

---

## N3 — Navigation-link authoring  *(runtime already works; UI is missing)*

**PI Vision:** right-click → *Add Navigation Link*. Real wire schema from the `.pdix`:
`LinkURL`, `NewTab`, `IncludeAsset:"asset"`, `IncludeTimeRange`, `SetTextFromLink`. Asset context has
**two modes**: *use current asset* (pump tile → that pump's detail) and *use current asset as root*
(turbine → turbine + its children). Static shapes get an **explicit asset dropped onto them** — that's how
"invisible rectangle over the P&ID" works. Open modes: **replace / new tab** (+ a non-navigating *change
context of current display*). ISA-101 wants ≤3 clicks from L1 to any display, and L4 faceplates as popups.

**Do:**
- Extend `NavigationLink`: `assetContextMode: 'none'|'current-asset'|'current-asset-as-root'|'explicit'`,
  `includeTimeRange`, `changeContextOnly`. **Keep `openMode:'popup'`** — PI Vision lacks it but ISA-101
  explicitly wants L4 faceplates as popups, and our viewer already renders one.
- **Action tab** in the inspector: None / Open display / Open URL / Change context. Display picker uses the
  existing `GET /displays?search=`. URL field **validates the scheme (https or same-origin only)** — PI
  Vision enforces this and it is a real security control.
- Store `targetDisplayId` (**a real FK**), never a URL. PI Vision stores `./#/Displays/189/101---Crusher-Detail`,
  so **renaming a display breaks every inbound link** — we will not copy that.
- **`shape.hotspot`**: transparent rect, dashed outline in design mode only, invisible at runtime. Without
  it you cannot link over imported PI Vision artwork.
- Link badge on any item with a `navigationLink` in design mode; click selects (never navigates) in design
  mode — PI Vision enforces the same by requiring you to leave Design Mode.

---

## N4 — Display lifecycle: rename · duplicate (Save As) · delete → recycle bin

**PI Vision:** rename = **click the title and type** (no dialog). **Save As** = the dropdown next to Save →
name + folder + "inherit permissions"; it is also how a non-owner edits someone else's display. Delete →
**Recycle Bin**, retained indefinitely, Restore or purge; bulk select + delete/move on the home page.
Concurrency: if someone else saved first you are **blocked** and offered *Reload* or *Save As* — silent
last-write-wins is a management-of-change violation under ISA-101.

**We're already ahead:** soft-delete (`IsDeleted`) and full versioning exist. Missing: the endpoints and
the UI.

**Do:** `POST /displays/{id}/duplicate` (deep-copies the snapshot, **regenerates item ids**, owner = caller),
`GET /displays/deleted`, `POST /displays/{id}/restore`, `DELETE /displays/{id}/purge` (admin).
UI: card overflow menu (Open · Rename · Duplicate · Delete), in-place rename, confirm dialog naming the
display, Save▾ split button with **Save As**, and a Recycle Bin view.

---

## N5 — Canvas: pan, cursor-anchored zoom, snap control, object tree

**Snap:** PI Vision has a **Snap-to-Grid toggle with a pitch slider**, and **hold Alt to bypass snap while
dragging**. We snap *always*, with no toggle — you cannot place anything off-grid. That's a bug.

**Pan:** PI Vision has **no pan at all** (fixed document, browser scroll). But our toolbar *advertises*
"Space+drag pan" and it does nothing — `spaceDown` only changes the cursor. Implement space+drag,
**middle-mouse drag** (the gesture that never conflicts) and wheel/shift-wheel scroll. Make zoom
**cursor-anchored** (`panX' = mx - (mx - panX) * (newZoom/oldZoom)`) — today it drifts away from the pointer.

**Object tree / layers:** table stakes for industrial. An imported `.pdix` has **721 symbols**; with
overlapping objects you **cannot select an occluded item at all** without a tree. Our model already has
`zIndex`, `hidden`, `locked`, `groupId` — and **`hidden` has no UI whatsoever**. Panel lists items by
z-order with eye/lock toggles; click selects, drag reorders z.

**Skip rulers** — genuinely low value on a fixed-size canvas, and PI Vision doesn't have them either.

---

## N6 — Design-mode truth: placeholders, quality, thumbnails, launcher

**Placeholders.** PI Vision shows **real live data in design mode** (thin client on a live server), so it
has no placeholder concept. We can't do that by default (thumbnails would capture process values and leak
plant data), so: three explicit states — **unbound → dimmed `—` + dashed outline** (makes "you forgot to
bind this" visible across a 300-symbol display), **bound → `{leaf}`** (+ role prefix for non-primary
slots, full path on hover), **live → value + unit + NE107 quality chip**. Then add an opt-in **Live
preview** toggle (default OFF) that polls the Redis snapshot endpoint — PI Vision parity when you want it.
**Kill the hardcoded fakes** (tank 65%, valve 50%, bar 60%, and the literal
`'High Temperature - Tank T-101'` alarm banner): a designer currently cannot tell a bound symbol from an
unbound one, which is the one question design mode exists to answer.

**Thumbnails.** PI Vision shows real previews (and `HideThumbnail` in the `.pdix` proves it also previews
nav-link targets on hover). Ours is a **fake grey box reading `1920 × 1080`**. Since we render DOM/SVG,
serialize the canvas to SVG **on publish** (never on autosave) and store it — no rasterizer, no headless
browser. Snapshot the **design-mode** render so no process values are captured.

**Launcher.** Control rooms navigate three ways: hierarchy (the ISA-101 display hierarchy — Clause 6.3;
the L1–L4 naming is Hollifield's *High Performance HMI Handbook*, which ISA-101 accommodates),
**alarm-driven**, and favourites/recents. Add `level: 1|2|3|4` to the display model (today `category` is
doing double duty), asset-tree filtering, favourites, recents.

> **Correction to an earlier draft of this plan:** I wrote "≤3 clicks from L1" as if it were a standard.
> **It is not** — that rule appears in no ISA-101 clause, no Hollifield paper and no ASM guideline; it is
> folklore repeated by vendor blogs. The citable requirements are **ASM 5.1/5.2/5.3** (navigation shall be
> *fairly simple and flat*, primary displays *directly accessible*, and reachable *without a menu
> directory*) and **ASM 5.5** (display call-up ≤3 s, avg 1 s). The alarm→display jump is **ISA-18.2
> §11.6.2.6(a)** — a *should*, not a *shall*. Design to the real clauses, not to the folklore.

### Where we are deliberately ahead of the field
Cross-checking Ignition, WinCC, FactoryTalk, InTouch and ArchestrA turned up three things **no vendor
documents at all**, so our choices contradict no prior art and are worth keeping:
1. **Mixed-value rendering** in multi-select editing — nobody specifies it. (We use PI Vision's blank +
   a `Mixed` placeholder, which is strictly clearer than blank alone.)
2. **A design-mode placeholder for bound values** — Ignition just shows live data; InTouch/ArchestrA show
   a hand-typed format string. Our three-state `{tag}` / dashed-unbound / live model is genuinely novel.
3. **Display thumbnails** — no editor in the survey has them.

Two cautions the survey did surface: **ASM 9.3 (Priority 1) says modal dialogs are NOT to be used**, and
Hollifield puts faceplates in a *reserved zone* rather than floating over the graphic — so our popup
faceplate should be non-modal and consistently placed. And **every editor surveyed breaks navigation
links on rename** (Ignition offers only find/replace); since we store `targetDisplayId` as a real FK,
rename-safe links are a genuine differentiator.

---

## Order (driven by unblocking, not by size)
**N1** (unblocks N3/N6) → **N2** (kills an active data-loss bug) → **N3** → **N4** → **N5** → **N6**.

Two schema decisions made now because they are expensive later: `Display.level` (ISA-101 hierarchy) and
`NavigationLink.assetContextMode` (a single free-string `assetContext` cannot express "use as root").
