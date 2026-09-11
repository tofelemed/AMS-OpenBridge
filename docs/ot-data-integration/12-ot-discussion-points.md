# OT team — discussion points

> ## ✅ RESOLVED 2026-09-11 — read this first
>
> The OT gateway was restarted, which published the current value of **every tag once**
> before resuming on-change. That is exactly the baseline publish requested below, and the
> result was immediate:
>
> | | Before | After |
> |---|---|---|
> | Loops analysable | 36 | **161** |
> | Loops blocked by a missing signal | 114 | **0** |
> | Loops with no MODE | 7 | **0** |
>
> **Every "missing" setpoint and output did exist.** They had simply not been published
> since the broker's retained store was lost, so no client could read them. Nothing was
> added or reconfigured on either side — one restart was enough.
>
> **What is still needed, and it is much smaller than what follows:**
>
> 1. **Publish a baseline at gateway startup.** Just proven to work. Our system now stores
>    every value it receives and restores it after its own restarts, so a startup dump is
>    sufficient — a periodic cycle is optional hardening rather than essential.
> 2. **14 tags never appear at all** — listed in "Also to confirm" below. These are now the
>    only loops unaccounted for.
>
> Everything below is kept as the record of how this was diagnosed.

---

**Date:** 2026-09-11 · **Subject:** loop signal availability on the OT gateway MQTT feed
**Detail / evidence:** [11-ot-signal-coverage.md](11-ot-signal-coverage.md)

---

## 1. The problem

**Only 32 of 175 configured loops can be analysed. The other 143 produce nothing.**

Loop performance analysis needs three signals together — **PV, SP and OP**:

- `error = SP − PV` is the basis of every performance measure
- OP is needed for valve and actuator diagnostics
- MODE tells us whether the loop is in automatic (a manual loop is excluded from scoring)

If any one of PV/SP/OP is unavailable, **nothing can be calculated for that loop at all**.
We deliberately publish no result rather than substitute a default value, because a guessed
setpoint produces a confident but wrong diagnosis.

| | Loops |
|---|---|
| Configured in our system | 175 |
| Visible on the gateway MQTT | 151 |
| **Have PV + SP + OP available** | **37** |
| Analysed today | 32 |

---

## 2. Why — what we found

The gateway publishes **only when a value changes**, and there is **no periodic or startup
republish**. So a value that has not changed recently was last sent long ago, and there is
no copy left on the broker for a new client to read.

Measured evidence:

- **Nothing on the broker is retained from before 2026-09-06 ~20:15.** No signal of any
  kind, on any loop, is older than that.
- Example: loop **PIC80150** — its MODE was published exactly **twice**, on 2026-08-30 and
  2026-09-05. Both are before that cut-off, so no copy exists today and we cannot read it.
- The pattern matches how often each signal changes, not how tags are configured:

| Signal | Loops with a value available | Changes |
|---|---|---|
| PV | 147 | constantly |
| OP | 86 | constantly |
| MODE | 55 | occasionally |
| **SP** | **37** | **rarely** |

A setpoint that has sat unchanged for weeks is exactly the case that disappears — and it is
the one signal we cannot work without.

**This is not a fault on our side.** Our system receives every message the gateway sends
(all 151 loops), and correctly stores the last known value of each signal.

---

## 3. What we need

### Main request

> **Publish the current value of every configured tag periodically — for example every 5 to
> 15 minutes — and once at gateway startup, with the MQTT `retain` flag set.**

On-change publishing is fine and should continue; this is in addition to it.

**Why this is the whole fix:** every value becomes readable by any client at any time, and
the missing setpoints most likely already exist in the DCS — they simply have not changed.
**This one change could take us from 32 analysable loops to around 151, with no new tags.**

### Also to confirm

1. ~~Is SP configured for all 151 loops?~~ **Answered 2026-09-11: yes.** The restart
   published a setpoint for every one of them. Nothing needs adding.
2. **Why is nothing retained from before 2026-09-06 20:15?** Was `retain` enabled around
   then, or was the broker's stored data cleared? Still worth knowing — it tells us whether
   this can recur, though we would now survive it.
3. **14 tags never appear on MQTT at all.** After the restart, 10 of the original 24 turned
   out to exist. The remaining 14 are exactly the loops onboarded from the CPA workbook on
   2026-09-10, and the DCS publishes nothing for any of them:

   `AIC30601` `FC10711` `FC10712` `FQIC10103` `FQIC10104` `FQIC10304` `FQIC40302`
   `FQIC50102C` `IIC20101A` `IIC20101B` `IIC20101C` `NIC51101` `PDIC10407` `PDIC10418`

   Do they exist in the DCS under different tag names, or should we retire them from our
   registry? **These are the only loops still unaccounted for.**
4. **Six instruments had stopped reporting PV entirely** (oldest since 2026-09-08). Worth
   re-checking after the restart — are those loops out of service, or a gateway problem?

---

## 4. What is already working well

- Topic structure and payload format are correct and consistent.
- `retain` is set correctly on the values that are published.
- Values are delivered reliably — we receive ~120 messages/second with no loss.
- MODE values map correctly where they are sent (1=AUT, 2=MAN, 3=CAS, 4=IMAN, confirmed).
- The 37 complete loops work end to end today, with no issues.

The gap is narrow and specific: **values that rarely change are not being republished.**

---

## 5. How to check it together

A signal is only usable by us if it survives a fresh connection. To test any loop:

1. Open MQTT Explorer with a **new client ID and "clean session" enabled**.
2. Look at that loop under `OT/HDPE/<FCS>/<class>/<loop>/PIDParams/`.
3. Whatever appears is what we can read. Whatever is missing, we cannot obtain.

> **Important:** an MQTT browser left connected for a long time keeps showing values the
> broker no longer holds, because it remembers everything it saw while connected. Always
> disconnect and reconnect before judging what is actually available. Also note the `ts`
> field is the time the value last *changed* in the DCS — not the time it was sent.

---

## 6. Summary

| | |
|---|---|
| **Problem** | 143 of 175 loops cannot be analysed — PV, SP or OP is unavailable |
| **Cause** | Publish-on-change only; unchanged values have no copy on the broker |
| **Fix** | Periodic + startup republish of all configured tags, with `retain` |
| **Effect** | Potentially 32 → 151 analysable loops, no new tags required |
| **Our side** | No changes needed — verified receiving and storing everything sent |
