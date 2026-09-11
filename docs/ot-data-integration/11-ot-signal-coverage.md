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

These publish something (usually PV) but lack at least one required signal, so they
produce no data at all downstream. **This is the main list.**

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

These have PV/SP/OP and **do** reach the system, but never publish MODE. Without it the
engine cannot tell closed-loop from manual operation, counts the loop as not-auto, and
**Gate 1 excludes it from analysis**. One extra signal brings each of these fully online.

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

1. **Publish SP for the 114 loops in §1** (and OP for the 65 that also lack it). This is
   the difference between 37 and 151 analysable loops. Nothing changes on the CPA side —
   the 37 complete loops already flow end to end.
2. **Publish MODE for the 8 loops in §2** — the cheapest win on the list: they are already
   complete and merely excluded for want of one signal.
3. **Confirm the 24 tags in §3** — real under another name, or retire them.

Retention is set correctly on all 406 published topics; a reconnecting subscriber gets the
current value immediately. No change is needed there.

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
