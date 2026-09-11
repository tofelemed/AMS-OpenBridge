# OT signal coverage — what the gateway publishes vs what CPA needs

**Measured 2026-09-11** against the live broker on `192.168.190.91`, from the **retained**
values on `OT/HDPE/<FCS>/<class>/<loop>/PIDParams/<param>`. Retained means this is the
complete published set, not a sample of a time window.

Companion to [09-ot-mqtt-loop-mapping.md](09-ot-mqtt-loop-mapping.md) (the field contract)
and [10-ot-loop-ingestion-runbook.md](10-ot-loop-ingestion-runbook.md) (operations).

---

## Summary

| | Loops |
|---|---|
| Registered in CPA | 175 |
| Published by the gateway | 151 |
| **Registered but never published** | **24** |
| Published **with PV + SP + OP** (analysable) | **37** |
| **Published but incomplete** | **114** |
| Reaching the CPA pipeline today | 32 |

**Control-performance analysis requires PV, SP and OP.** `error = SP − PV` underpins the
error integrals, `goodErrorPct`, OCE and gates G2/G3; OP drives G4/G9/G10 and the valve
diagnostics. A loop missing any of the three is not partially assessable — it is
unassessable, and the pipeline correctly emits nothing for it rather than substituting a
default that would produce confident wrong verdicts.

> **The cause is almost certainly publishing behaviour, not a missing tag list.**
> See [§0](#0-why-a-signal-is-absent-read-this-first) — the fix is one gateway setting,
> not 114 tag additions.

---

## 0. Why a signal is absent — read this first

The gateway publishes **strictly on change**, with the retain flag set, and **never
publishes a baseline**. A tag that has not changed since the gateway last started has
therefore never been published at all: the broker holds nothing, and **no subscriber —
ours or anyone's — can obtain that value, ever.**

The evidence is the retained inventory itself. Retained counts track change *frequency*
with almost perfect fidelity, which a configured tag list would not:

| Param | Loops with a retained value | How often it changes |
|---|---|---|
| PV | 147 | continuously |
| OP | 86 | continuously (fixed-output valves aside) |
| MODE | 55 | occasionally |
| **SP** | **37** | **rarely** |
| P / GW | 22 | almost never |
| I | 20 | almost never |
| D | 17 | almost never |

A configuration that published PV for 147 loops but SP for only 37 would be arbitrary;
change frequency explains the ordering exactly. Retained timestamps confirm it: they span
**2026-09-06 → 2026-09-11**, so values sit untouched for days — there is no periodic
republish, and the newest SP/P/I/D values share a single instant (`06:00:50`), the
signature of a change event rather than a refresh cycle.

**Consequence:** the 114 loops below most likely *do* have a setpoint in the DCS. It simply
has not moved, so it has never been published, so we cannot see it. From the broker alone
"configured but unchanged" and "not configured" are indistinguishable — but only the first
is consistent with the pattern above.

**This also explains the missing MODEs in §2**, and it is a standing fragility: every
gateway restart resets the baseline to whatever happens to change afterwards.

### Every incomplete loop is missing SP

| Missing | Loops |
|---|---|
| SP **and** OP | 61 |
| SP only | 49 |
| PV, SP **and** OP | 4 |
| **Total** | **114** |

### By controller

| Controller | Published | Complete | Incomplete |
|---|---|---|---|
| FCS0101 | 68 | 23 | **45** |
| FCS0102 | 65 | 14 | **51** |
| FCS0103 | 10 | 0 | **10** |
| FCS0104 | 8 | 0 | **8** |

---

## 1. Incomplete loops — 114

These publish something (usually PV), but at least one required signal has **no value on
the broker**, so they produce no data at all downstream. Per §0 the signal most likely
exists in the DCS and simply has not changed since the gateway started. **This is the main
list.**

### FCS0101 — 45 of 68 incomplete

  `FIC10302`      `FIC10303A`     `FIC10401`      `FIC10403`      `FIC10404`      `FIC10405`
  `FIC10503`      `FIC10505`      `FIC10506`      `FIC10513`      `FIC10710`      `FIC30701`
  `FIC80103`      `FIC80104`      `PIC00521`      `PIC00551`      `PIC00605`      `PIC00609`
  `PIC00610`      `PIC00620`      `PIC10101`      `PIC10104`      `PIC10116`      `PIC10201A`
  `PIC10201B`     `PIC10201C`     `PIC10320`      `PIC10323`      `PIC10411`      `PIC10412`
  `PIC10413`      `PIC10511`      `PIC10512`      `PIC80103`      `PIC80140`      `PIC80141`
  `TIC10101`      `TIC10102`      `TIC10403`      `TIC10503`      `TIC10603`      `TIC10608`
  `TIC10704`      `TIC80104`      `TIC80150`

### FCS0102 — 51 of 65 incomplete

  `FIC30201`      `FIC30202`      `FIC30203`      `FIC30303`      `FIC30501`      `FIC30502`
  `FIC30603`      `LIC20202`      `LIC20401`      `LIC20541`      `LIC20601`      `LIC20602`
  `LIC30101`      `LIC30103`      `LIC30104`      `LIC30302`      `LIC30307`      `LIC30310`
  `LIC30501`      `LIC30601`      `LIC30608`      `PIC20120`      `PIC20203`      `PIC20204`
  `PIC20317`      `PIC20406`      `PIC20501`      `PIC20603`      `PIC30102`      `PIC30104`
  `PIC30108`      `PIC30204`      `PIC30305`      `PIC30325`      `PIC30601`      `PIC30611`
  `PIC40101`      `PIC40102`      `PIC40108`      `PIC40201`      `TIC20607`      `TIC30104`
  `TIC30107`      `TIC30109`      `TIC30110`      `TIC30206`      `TIC30304`      `TIC30309`
  `TIC30501`      `TIC30502`      `TIC30603`

### FCS0103 — 10 of 10 incomplete

> **Every loop on FCS0103 is incomplete** — this controller currently contributes nothing.

  `FIC50201`      `FIC60210`      `LIC50303`      `PIC50206`      `PIC50216`      `PIC51208`
  `TIC30401`      `TIC50302`      `TIC51402`      `TIC51406`

### FCS0104 — 8 of 8 incomplete

> **Every loop on FCS0104 is incomplete** — this controller currently contributes nothing.

  `LIC30320`      `PIC30322`      `PIC30323`      `TIC30320`      `TIC30325`      `TIC31001`
  `TIC31002`      `TIC31003`

> **Per-loop detail.** Which specific signal each loop lacks is in the generated
> `ot-loop-inventory.csv` (columns `PV,SP,OP,MODE`). This document carries the
> aggregate; regenerate the CSV with the command in §5 for the per-loop breakdown.

---

## 2. Published, complete, but no MODE — 8

  `FIC10303B`     `FIC10402`      `LIC20402`      `PIC10703`      `PIC80142`      `PIC80143`
  `PIC80150`      `TIC20305`

These have PV/SP/OP and **do** reach the system, but no MODE value has ever been published
for them — the same baseline problem as §0 (a loop left in AUTO for weeks never generates a
MODE change). Without it the engine cannot tell closed-loop from manual operation, counts
the loop as not-auto, and **Gate 1 excludes it from analysis**. The §5 baseline fix covers
these too.

---

## 3. Registered in CPA but never published — 24

  `AIC30601`      `FC10711`       `FC10712`       `FIC00701`      `FIC10501`      `FIC30303_WR`
  `FQIC10103`     `FQIC10104`     `FQIC10304`     `FQIC40302`     `FQIC50102C`    `IIC20101A`
  `IIC20101B`     `IIC20101C`     `LIC30206`      `NIC51101`      `PDIC10407`     `PDIC10418`
  `PIC10407_2`    `PIC10513`      `PIC10704`      `PIC51309`      `PIC80142B`     `TIC30604`

No topic exists for these on the broker. Fourteen came from the CPA workbook during the
2026-09-10 onboarding; the rest are older registry entries. **Please confirm whether they
exist in the DCS under different tags, or should be retired from our registry.**

---

## 4. Healthy reference — 37 complete

Flowing end to end today (32):

  `FIC10301`      `FIC10303B`     `FIC10402`      `FIC10406`      `FIC10409`      `FIC10502`
  `FIC10504`      `FIC10509`      `FIC20209`      `FIC20301`      `FIC20404`      `LIC10401`
  `LIC10404`      `LIC10501`      `LIC10601`      `LIC10704`      `LIC10719`      `LIC20402`
  `LIC30102`      `LIC80101`      `LIC80102`      `PIC10603`      `PIC10703`      `PIC30306`
  `PIC30307`      `PIC80105`      `PIC80142`      `PIC80143`      `PIC80150`      `TIC20305`
  `TIC30306`      `TIC80105`

Complete on the broker but **not** flowing (5) — these are ours to fix, not OT's;
they appear to be inactive in the CPA registry rather than a data problem:

  `FIC30102`      `PIC40202`      `TIC00705`      `TIC20405`      `TIC20601`

---

## 5. What we are asking for, in priority order

1. **Publish a baseline for every configured tag — this is the whole fix.** On gateway
   startup, and periodically thereafter (every 5–15 minutes is ample), publish the current
   value of every configured tag rather than only on change. Retained + on-change is
   correct for a tag that moves; for a setpoint that has sat still for a month it means the
   value has never existed on the broker. **One setting takes us from 37 analysable loops
   to potentially 151.** It also fixes §2 and removes the restart fragility.
2. **Confirm SP is configured for all 151 loops.** If §0's reading is right, nothing needs
   adding and step 1 is sufficient. If some genuinely are not configured, the loops in §1
   are the list to add.
3. **Confirm the 24 tags in §3** — real under another name, or retire them from our registry.

Retention itself is set correctly on all 406 published topics; a reconnecting subscriber
gets every retained value immediately. **That part is right and should not change** — the
gap is that values which never change never become retained in the first place.

> **How to confirm §0 without guesswork:** the set of loops with a retained SP should
> *grow* over days as more setpoints happen to move. If it is still exactly 37 next week,
> SP really is configured for only those loops and reading 2 applies instead.

### Regenerating this

```bash
docker exec mosquitto timeout 12 mosquitto_sub -h localhost -p 8883 --cafile /mosquitto/config/certs/ca.crt -u leanautomation -P '<pass>' -F '%t' -t 'OT/#' | sed -n 's#^OT/[^/]*/\([^/]*\)/\([^/]*\)/\([^/]*\)/PIDParams/\([A-Za-z]*\)$#   #p' | sort -u > /tmp/ot-inventory.txt
```
```bash
awk '{k=$1","$2","$3; p[k]=p[k]" "$4" "} END{print "fcs,class,loop,PV,SP,OP,MODE,complete"; for(k in p){pv=(p[k]~/ PV /)?"y":"-"; sp=(p[k]~/ SP /)?"y":"-"; op=(p[k]~/ OP /)?"y":"-"; md=(p[k]~/ MODE /)?"y":"-"; ok=(pv=="y"&&sp=="y"&&op=="y")?"YES":"NO"; print k","pv","sp","op","md","ok}}' /tmp/ot-inventory.txt | sort > /tmp/ot-loop-inventory.csv
```

From the next release this is available without touching the broker:
`GET /api/ingestion/loop-health?state=held` returns the same 114 loops, each naming the
signal it is waiting for (CHG-015).
