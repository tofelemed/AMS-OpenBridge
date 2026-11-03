# Evidence retention by interval — space required

Date: 2026-11-03 · Companion to `evidence-retention-current-and-target.md` · Proposal, nothing built.

Idea: the **24 h** evidence is the most important and is kept longest; shorter intervals are kept for less time,
because their findings are confirmed in the longer windows anyway.

## Space per interval (143 loops, one set per non-overlapping window, packed lossless)

| Interval | Gates | Sets per loop per day | Size per set | Fleet per day | 7 days | 30 days | 90 days | 365 days |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **24 h** | G5–G15 | 1 | ~950 KB | **119 MB** | 0.8 GB | 3.6 GB | **10.7 GB** | 43 GB |
| 12 h | G5–G15 | 2 | ~570 KB | 143 MB | 1.0 GB | 4.3 GB | 12.9 GB | 52 GB |
| 8 h | not computed today¹ | 3 | ~400 KB² | ~150 MB² | 1.1 GB | 4.5 GB | 13.5 GB | — |
| 4 h | G5–G11 | 6 | ~250 KB² | ~188 MB² | 1.3 GB | 5.6 GB | 16.9 GB | — |
| 60 min | G0–G4 | 24 | ~108 KB | 324 MB | 2.3 GB | 9.7 GB | 29 GB | — |
| 30 min | G0–G4 | 48 | ~55 KB | 333 MB | 2.3 GB | 10.0 GB | 30 GB | — |
| 15 min | G0–G4 | 96 | ~29 KB | 343 MB | 2.4 GB | 10.3 GB | 31 GB | — |
| 10 min | G0–G4 | 144 | ~19 KB | 349 MB | 2.4 GB | 10.5 GB | 31 GB | — |
| 5 min | G0–G4 | 288 | ~10 KB | 375 MB | 2.6 GB | 11.3 GB | 34 GB | — |
| 1 min | G0–G4 | 1,440 | ~2.6 KB | 468 MB | 3.3 GB | 14.0 GB | 42 GB | — |

Size per set = payload; fleet per day = payload × 0.7 (lossless pack) × 1.25 (planning headroom) × 143 loops.
24 h / 12 h measured at the plant (2026-11-03); 4 h from the plant's live emissions (avg 136, max 311 KB);
1 min – 60 min from the lab (the plant emits no short-tier evidence), same 5 s grid.
¹ 8 h is not a window the engine computes; adding it is a Flink change (one more long window per loop).
² estimate.

## What the table shows

- **Short intervals cost more than the 24 h, not less.** Covering a day with 1-min … 60-min windows means storing
  the whole raw signal (~3 MB per loop per day for each interval), and there are six of them: ~2.2 GB/day together.
  The 24 h set covers the same day in ~0.95 MB.
- **Short-interval evidence is the raw PV / SP / OP / mode the historian already keeps for 90 days.** It can be
  rebuilt on demand at any time inside those 90 days (*Reconstructed*), so storing it duplicates the historian.

## Suggested tiers

| Interval | Keep | Space |
|---|---|---:|
| **24 h** | **180 days** (90 d beyond the historian, so the only copy of older evidence) | 21.4 GB |
| 12 h | 30 days | 4.3 GB |
| 4 h | 14 days | 2.6 GB |
| 60 min | 3 days | 1.0 GB |
| 1 / 5 / 10 / 15 / 30 min | not stored — rebuilt from the historian on demand (90 d) | 0 |
| **Total** | | **~29 GB** (plant: 90 GB free) |

Leaner variant: 24 h 90 d (10.7) + 12 h 30 d (4.3) + 4 h 7 d (1.3) + 60 min 3 d (1.0) ≈ **17 GB**.
Full 24 h year: 24 h 365 d alone = 43 GB — only with a disk extension or object storage.

Evidence attached to an engineering note (pinned) is kept regardless; an episode keeps the sets that overlap it until
N days after it closes.

---

## SME decision (2026-11-03) and what it costs

**SME:** keep the **24 h** evidence for **3 years** (or one turnaround period); every other interval **on demand**
from the IoTDB time series.

### 24 h for 3 years (143 loops, 1 set per loop per day)

| Option | What is kept | Per year | **3 years** | Fits 90 GB free? |
|---|---|---:|---:|---|
| A | full resolution, lossless (bit-exact proof) | 43 GB | **~130 GB** | no — extra disk or object storage |
| B | full resolution, f32 values | 20 GB | ~59 GB | tight (two thirds of free space) |
| **C** | **first 90 days as A; after that a compact form: signals at 1-min min/mean/max, 3 representative cycles, PSD / ACF / lag and the verdict exact, f32** | ~5 GB after day 90 | **~25 GB** | **yes** |

C is an *estimate* (the compact form is not built yet). Each extra year on C adds ~5 GB, so a 4–5-year turnaround
is ~30–35 GB. In C the verdict, metrics and thresholds stay exact; only the charts older than 90 days drop from 5 s to
1-min resolution (with the min / max band, so spikes stay visible), and they verify against the archive's own
checksum instead of the original one.

### Every other interval on demand from IoTDB — checked in the code

| Case | Possible today? | Notes |
|---|---|---|
| 12 h / 24 h verdict still stored (verdict rows 14 d) | **yes** — `EVIDENCE_RECONSTRUCTION`, source `iotdb`, every gate G0–G11, G13–G15 | the fused row carries every gate's run id; rebuilt under the run's original bundle; one gate per request today |
| 1 / 5 / 10 / 15 / 30 / 60 min, 4 h, or 12 h older than 14 d | **no entry point yet** — the engine can compute it, but a reconstruction needs a stored result row (short rows 6 h, long rows 24 h at the plant) and `REPLAY` recomputes verdicts without evidence | build item: **"evaluate on demand"** — loop + interval + end time → the whole evidence set computed from IoTDB under the configuration in force at that time, labelled *Reconstructed*, kept 3 d |
| G12 response evidence | **no** (event-keyed, owned by the response job) | response tables keep 14 d |

Limits of on-demand:
- reach = the IoTDB retention: **90 days today** (`root.site1` TTL). A 1-min window from 6 months ago can only be
  rebuilt if the historian keeps the raw series that long — the cost of a longer TTL needs the plant's IoTDB size
  (*estimate* 25–50 MB/day for 143 loops → 3 years ≈ 27–55 GB);
- ~10–20 s per gate per window on one free TaskManager slot; requests queue;
- G13 (interaction) also needs the peer loops' series in IoTDB for the same period;
- the IoTDB root moves to `root.hdpe.cpm` (CHG-101): the 90-day TTL must be set on the new database too.
