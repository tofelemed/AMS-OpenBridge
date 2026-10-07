# CHG-049 evidence baseline (2026-10-06)

## Plant (Marun, before the TRUNCATE of 2026-10-06)

| Measure | Value |
|---|---|
| Physical | evidence_chunk 2424 MB, evidence_manifest 1273 MB (traverse_cplm 8143 MB) |
| By class | EPISODE COMPLETE 325,016 (565 MB payload); EPISODE EXPIRED 240,823; TRANSIENT COMPLETE 265,632 (714 MB, all < 6 h old); STANDARD 6; pinned 0 |
| Manifests/day | 10-03 195,408 · 10-04 144,443 · 10-05 211,904 · 10-06 (to 06:00) 266,894 |
| Per run | avg 43.0, max 4,321 (13,146 EPISODE runs) |
| Captures 24 h | OPEN 2,108 runs / 124 episodes · ESCALATE 1,411 / 74 · CLOSE 2,074 / 122 |
| Response | response_event 50,821 rows since 2026-09-25 (~4,838/day); response_metric 2,642,692 rows; 798 MB together |

Evidence emit at the plant: `CPLM_EVIDENCE_EMIT=episodes`, `CPLM_SHORT_EVIDENCE_EMIT` unset (= none).
After the TRUNCATE (pinned = 0) the disk went from 5.2 to 11 GB free.

## Lab (ams-postgres, pre-CHG-049 jar, 2026-10-06)

Manifests in the last 6 h, by gate and kind (top 15):

| Gate | Kind | n | Payload |
|---|---|---|---|
| G0 | role_qualification | 5,053 | 21 MB |
| G2r, G2, G1 ×2, G3, G4 | short tier | ~1,235 each | 2.9-8 MB each |
| G5 | preprocessed_signal | 422 | 25 MB |
| G5 | acf_series | 422 | 7.7 MB |
| G10 | actuator_limits | 419 | 13 MB |
| G9 | corners | 401 | 12 MB |
| G11 | measurement | 396 | 13 MB |

- By class: STANDARD 1,045,562 (replay and reconstruction history), TRANSIENT 16,793, EPISODE 3,806, PINNED 8.
- Physical: evidence_chunk 3273 MB, evidence_manifest 1829 MB, response_metric 133 MB, response_event 54 MB.
- Largest run: G9, 126 `cycle_polygon` + 126 `normalized_pairs` + 1 `corners` = 253.

**The lab differs from the plant in three ways:**
- Short-tier evidence is on.
- Long windows hold far fewer cycles.
- Its STANDARD class holds a million replay manifests.

For a plant-comparable measurement (Task 8), set `CPLM_SHORT_EVIDENCE_EMIT=none` and compare only TRANSIENT/EPISODE manifests from the long and fusion tiers (G5-G15), per hour.
