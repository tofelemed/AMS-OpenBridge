# Plan 07 — Frontend Performance & Subscription Hygiene

**Phase:** 2–3 · **Effort:** M · **Depends on:** Plan 04 (MQTT-WS moves behind the gateway) · Plan 05 item 6 (alarm identity, for the deep-link fix)
**Gaps closed:** FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, FE-07
**Objective:** stop the plant-wide render storm, make subscriptions safe across navigation, and give the two most-used operator screens honest loading states.

## Why

Every logged-in client currently subscribes to the **plant-wide DDATA firehose** — the side panel that opens it is permanently mounted in the shell, and the "hide" toggle only flips a CSS class. Each message triggers one store write, which re-renders every bound slot hook (24 per symbol) with **zero `React.memo` anywhere in the codebase**. At target scale that is thousands of messages per second reaching every browser. Separately, the Dashboard renders zeros during a cold load, which looks exactly like a quiet plant.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Scope the MQTT firehose to monitoring routes | FE-01 | `App.tsx`, `LiveEventStream.tsx` | S |
| 2 | Coalesce DDATA messages before `setState` | FE-01 | `mqttStore.ts` | M |
| 3 | Ref-count per-screen subscribe/unsubscribe | FE-06 | `mqttStore.ts` | S |
| 4 | Memoise the symbol render path | FE-04 | `SymbolRenderer.tsx`, `DesignerCanvas.tsx` | M |
| 5 | Add loading/error/empty states to Dashboard + AlarmConsole | FE-05 | `Dashboard.tsx`, `AlarmConsole.tsx` | S |
| 6 | Debounce filter/search inputs; throttle trend axis-pointer | FE-02 | AlarmConsole, MqttLiveStream, LiveEvents, `TrendCore.tsx` | S |
| 7 | Add request cancellation (AbortController / RQ `signal`) | FE-03 | hooks, `TrendCore`, `IoTDBTrendViewer` | S |
| 8 | Fix the live→trend deep link; drop dead deps; chunk vendors | FE-07 | `iotdbPaths.ts`, `vite.config.ts`, `package.json` | S |

## Implementation steps

### 1. Scope the firehose (FE-01)

`LiveEventStream` is mounted unconditionally in the app shell, so the firehose ref-count never drops to zero on any shell route.

- Mount the live-event panel **only** when its route/panel is actually open (conditional render, not a CSS class).
- Keep the existing ref-counted `subscribeFirehose`/`unsubscribeFirehose` — the mechanism is correct; the mount lifetime is the bug.
- Verify with a broker-side check that a client on `/alarms` holds **no** plant-wide subscription.

### 2. Coalesce live messages (FE-01)

`handleMessage` runs one immer `set()` per DDATA message, so React notification rate equals broker message rate.

- Buffer incoming metrics and flush on `requestAnimationFrame` (or a ~100 ms tick), applying one batched store update.
- Follow the pattern the authors already used for the trend ring buffer, which is deliberately kept outside zustand to avoid clone churn.
- Cap per-flush work and drop superseded values for the same key (last-write-wins per metric).

### 3. Ref-count screen subscriptions (FE-06)

`unsubscribeScreen` unconditionally unsubscribes a topic even when another mounted component still needs it — the first unmount starves the survivors, which then show stale values silently.

- Mirror the firehose ref-count: increment per subscriber, only send `unsubscribe` when the count hits zero.
- Also call `mqttStore.disconnect()` on logout — the socket currently outlives the session for the tab's lifetime.

### 4. Memoise the render path (FE-04)

- Wrap `SymbolRenderer` (and the per-slot hook consumers) in `React.memo` with a stable comparator; there is currently **no** component memoisation in the app.
- Have `useBindingResolver` subscribe to the specific metric key rather than the whole metrics Map, so an unrelated device update does not re-render every bound slot.
- Throttle the designer drag handler to `requestAnimationFrame` (it currently recomputes snapping and updates items on every mousemove).
- Throttle `TrendCore`'s axis-pointer handler — it rebuilds the option object and calls `setOption(notMerge)` on every mousemove.

### 5. Honest loading states (FE-05)

- `Dashboard.tsx` has no loading/error handling at all: add a skeleton/hydrating state so "not loaded yet" cannot be mistaken for "no active alarms".
- `AlarmConsole`: add a hydration indicator distinct from the empty-grid state.
- Keep the existing connection badges — they help but are not sufficient on their own.

### 6. Debounce and throttle (FE-02)

- Debounce (200–300 ms) the AlarmConsole quick filter, MqttLiveStream search, and LiveEvents source filter — all three currently refilter/resort on every keystroke.
- The one existing debounce (user management) is the pattern to copy.

### 7. Request cancellation (FE-03)

- Thread React Query's `signal` into every `queryFn`, and pass an `AbortController` signal into the historian/binding fetches.
- Abort superseded requests on tag/time-range change so a slow stale response cannot overwrite a newer one (`IoTDBTrendViewer` has no guard at all today).

### 8. Cleanup and bundle (FE-07)

- `buildTrendViewerUrl` emits `series`/`hours`/`auto` at `/trend`, but that page reads only `tags`/`range` — the "View IoTDB Trend" button dead-ends. Point it at the correct route/params (coordinate with Plan 05 item 6).
- Remove dead dependencies (`@tanstack/react-virtual` is declared and never imported; check `axios`).
- Add `manualChunks` for the heavy vendors (echarts, ag-grid, mqtt, d3) — today they chunk only along route-lazy boundaries.
- Add an overlap guard to `refreshActiveAlarms` so a long hydration cannot interleave with the next 30 s poll tick.

## Exit criteria

- [ ] A client on a non-monitoring route holds no plant-wide MQTT subscription (verified at the broker).
- [ ] Store updates are batched: message rate ≫ render rate under a live-data soak test.
- [ ] Unmounting one of two components sharing a device topic leaves the survivor updating.
- [ ] Profiled render count per DDATA message drops materially on a dense display (record before/after).
- [ ] Cold-loading the Dashboard shows a loading state, never zeros-as-data.
- [ ] Typing in filters issues one filter pass per pause, not per keystroke.
- [ ] Changing a trend's tag/range aborts the in-flight request.
- [ ] "View IoTDB Trend" from a live alarm opens the correct populated trend.
- [ ] MQTT socket closes on logout.

## Rollback

All items are self-contained frontend changes revertible per-commit. Item 1 and 2 are the behavioural ones — keep them behind a feature flag for one release if operators need a fallback to the old always-on stream.

## Risks & notes

- **Items 1–2 change what data arrives at the client.** Confirm with operations that no workflow depends on the side panel silently receiving plant-wide data while a different screen is open.
- Memoisation (item 4) can mask genuine updates if comparators are wrong — pair each `React.memo` with a test that a value change still re-renders.
- The alarm grid (AG Grid, client-side row model with `applyTransactionAsync` and 50 ms batching) is already production-grade — **do not** refactor it as part of this work.
