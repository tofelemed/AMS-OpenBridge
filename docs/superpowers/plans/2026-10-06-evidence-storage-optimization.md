# Evidence Storage Optimization Implementation Plan (CHG-049)

**Decisions (user, 2026-10-06):** ships inside the accumulating SME-batch release (one version with the other services' changes; version assigned when the batch closes) - no separate v2.6.7. Built and tested heavily on the lab first. Subagent-driven execution. Defaults accepted: 12 cycles, 60 min, RESPONSE 14 d, grace 1 d. Plant evidence was TRUNCATEd on 2026-10-06 (pinned = 0; disk 1.4 -> 11 GB free), so the plant baseline is gone: Task 0 measures on the lab.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep evidence ON at Marun while cutting what the evidence tables write and hold, so that `evidence_manifest` + `evidence_chunk` stay well under 1 GB on disk instead of 3.7 GB. Also give `response_event` / `response_metric` a retention.

**Architecture:** Fix it at the source (Flink emits far fewer artifacts) and leave the storage design as it is: the tables stay unpartitioned. Once the write rate is small, autovacuum keeps the tables at a small steady size. The 3.7 GB high-water mark is reclaimed once at deploy. Partitioning stays a recorded fallback, triggered by a daily-check threshold (see "Deferred").

**Tech Stack:** Flink 1.18 Java jobs (`src/flink`, Docker Maven), cplm-api .NET 8 + Dapper + Npgsql, PostgreSQL (`instrumental-postgres`, no Timescale at the plant), bash plant tooling (`migration/`).

**Spec:** this file, plus the findings recorded in its "Evidence" section (2026-10-06 plant numbers).

## Evidence (plant, 2026-10-06)

| Measure | Value |
|---|---|
| `traverse_cplm` | 8.1 GB, of which evidence_chunk 2.4 GB + evidence_manifest 1.3 GB |
| Manifests by class | EPISODE COMPLETE 325k (565 MB payload), **EPISODE EXPIRED 240k** (tombstones, 42 %), TRANSIENT 265k **written in the last 6 h** (~1 M/day write-then-delete) |
| Per run | avg 43 manifests per method_run_id, **max 4,321** |
| Captures/24 h | OPEN 2,108 / ESCALATE 1,411 / CLOSE 2,074 runs over ~124 episodes (≈17 runs per transition = one per gate, normal) |
| Response | response_event 50.8k rows since 2026-09-25 (~4.8k/day), response_metric 2.64 M rows, 0.8 GB, **no retention** |

Root causes, from the code:

1. **G7/G9 emit one artifact per oscillation cycle.** G7 emits N `cycle_fit` artifacts; G9 emits 2N+1 (`cycle_polygon` + `normalized_pairs` per cycle, plus `corners`). N = samples / samples-per-period, with no cap (`LongArtifacts.java:40-49`, `ShapeMath.java:50`). On a 24 h window at 1 s with a 40 s period, G9 = 4,321.
2. **The Long job re-emits every 15 min** over overlapping 4h/12h/24h windows (`CplmLongDiagnosticsStreamJob.java:220-267`). Each firing has new run ids, so the same cycles are written again 96 times a day.
3. **`episodes` mode behaves like `all`.** G5 is WARN whenever any period exists and G6 is WARN when peakRatio > 0.5 (`LongDiagnosticsCalculator.java:137,158`). Fusion also emits whenever health lanes are merely configured (`EvidencePolicy.java:63`).
4. **Expired tombstones are kept 7 days** (`Cplm:EvidenceExpiredGraceDays`, default 7, not forwarded by compose).
5. **A chunk whose manifest was swept is logged as `fail:`** and stalls the consumer for 2 s (`CplmEvidenceConsumerService.cs:119-124, 79-83`). Assembly re-reads every chunk payload on every chunk arrival (`:135-154`).
6. **Postgres `DELETE` never returns file space.** Files stay at their high-water mark, so 1 to 5 set that mark.

**Correction to the first triage:** `ix_cplm_short_feature_results_method_run_ids` is used by `MethodRunResolver` (GIN probe) and asserted by two tests. It stays.

## Global Constraints

- Production is live (v2.6.6). Every change ships with a plant script, `changes_tracker.md` CHG-049 (with "updated services" and "scripts to run"), and `prod_decision.md` rows. CLAUDE.md requires this.
- Every changed code file stays ≤ 500 lines (CLAUDE.md). `CplmLongDiagnosticsStreamJob.java` is 287 lines, `LongArtifacts.java` 241, `CplmEvidenceConsumerService.cs` 167, `EvidenceRetentionSweeper.cs` 95.
- The CPLM consumer groups keep exactly one member (CLAUDE.md consumer rule). Nothing here adds a consumer.
- Schema changes go to all four copies: `scripts/cpm-12-*.sql` (plant), `database/scripts/55_cplm_response.sql` (lab), `migration/schema/03-traverse_cplm.sql` (fresh install), and `scripts/cpm-07-v25-schema.sql` (the v2.5 upgrade copy of the response DDL).
- Retention rows are written `INSERT … ON CONFLICT (record_class) DO UPDATE` (a plain UPDATE is a silent no-op when the row is missing; v2.6 step 4 precedent).
- Flink builds use Docker Maven only, never host mvn (`flink-lab-deploy-traps`). cplm-api tests are `[Trait("Category","Integration")]` against the lab `traverse_cplm` and run alone.
- No image prune, no `rmi -f` on the plant (air-gapped).

## Review Focus

1. **Window with 0 or 1 cycle.** `pickCycles(0,k)` returns empty and `pickCycles(1,k)` returns `[0]`: no exception and no empty summary artifact. Pinned in Task 1.
2. **Cap ≥ N.** All cycles are emitted exactly as today, so reconstruction parity holds when N is small. Pinned in Task 1.
3. **Same loop, different window kinds.** The throttle keys on window kind, so a 4h emission must not suppress the 24h one. Pinned in Task 3.
4. **Throttle after a job restart.** State is empty, so the first finding emits at once. Never "wait an hour after a deploy". Pinned in Task 3.
5. **An orphan chunk followed by a valid record.** Offset handling stays correct; the orphan is skipped with a Warning and the next record still persists. Pinned in Task 4.

---

### Task 0: Lab baseline with the current jar (ops, no code)

**Files:**
- Create: `docs/next-release/chg049-evidence-baseline.md`

- [ ] **Step 1: On the lab (`docker exec ams-postgres …` or the lab's Postgres container, `CPLM_EVIDENCE_EMIT=episodes`, current jar, >= 6 h of live feed), run and paste the output into the file**

```bash
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm <<'SQL'
\echo == manifests per gate/kind, last 6 h (TRANSIENT + EPISODE)
select gate_id, artifact_kind, count(*) n, count(distinct method_run_id) runs, round(count(*)::numeric/count(distinct method_run_id),1) per_run, pg_size_pretty(sum(total_bytes)) payload
from analytics.evidence_manifest where created_at > now()-interval '6 hours' group by 1,2 order by n desc limit 25;
\echo == the 4,321 run
select gate_id, artifact_kind, count(*) from analytics.evidence_manifest where method_run_id = (select method_run_id from analytics.evidence_manifest group by 1 order by count(*) desc limit 1) group by 1,2;
\echo == physical
select relname, pg_size_pretty(pg_total_relation_size(oid)) from pg_class where relname in ('evidence_manifest','evidence_chunk','response_event','response_metric');
SQL
```

Expected: G7 `cycle_fit` and G9 `cycle_polygon` / `normalized_pairs` dominate `n`. If they do not, stop and re-plan Tasks 1 to 3 around the gate that does.

- [ ] **Step 2: Commit** — `git commit -m "docs(cplm): CHG-049 - plant evidence baseline 2026-10-06"`

---

### Task 1: Cap per-cycle artifacts in G7/G9, with one summary table of all cycles

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/evidence/CycleSampling.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/evidence/LongArtifacts.java:26-53`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/evidence/EvidencePolicy.java` (add `maxCycles`)
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:149`, `src/flink/src/main/java/com/ams/flink/cplm/replay/EvidenceReconstruction.java:104`
- Test: `src/flink/src/test/java/com/ams/flink/cplm/evidence/CycleSamplingTest.java`, `GateArtifactsTest.java`

**Interfaces:**
- Produces: `CycleSampling.pick(int n, int k) -> int[]` (sorted, distinct, includes 0 and n-1 when n ≥ 2); `LongArtifacts.artifacts(CplmLongDiagnosticsResult r, int maxCycles)`; `EvidencePolicy.maxCycles` (int, arg `--evidence-max-cycles`, default 12, `≤ 0` = no cap); artifact kind `cycle_scores` on G7.

- [ ] **Step 1: Write the failing tests**

```java
package com.ams.flink.cplm.evidence;

import org.junit.Test;
import static org.junit.Assert.*;

public class CycleSamplingTest {
    @Test public void emptyAndSingle() {
        assertArrayEquals(new int[0], CycleSampling.pick(0, 12));
        assertArrayEquals(new int[] {0}, CycleSampling.pick(1, 12));
    }
    @Test public void capAtOrAboveNKeepsAll() {
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, CycleSampling.pick(5, 12));
        assertArrayEquals(new int[] {0, 1, 2, 3, 4}, CycleSampling.pick(5, 0));   // 0 = no cap
    }
    @Test public void evenSpacingKeepsEnds() {
        int[] p = CycleSampling.pick(2160, 12);
        assertEquals(12, p.length);
        assertEquals(0, p[0]);
        assertEquals(2159, p[11]);
        for (int i = 1; i < p.length; i++) assertTrue(p[i] > p[i - 1]);
    }
}
```

Add to `GateArtifactsTest`:

```java
@Test
public void cycleArtifactsAreCappedAndEveryCycleIsInTheSummary() {
    List<EvidenceArtifact> capped = LongArtifacts.artifacts(LONG_RESULT, 2);
    long fits = capped.stream().filter(a -> "cycle_fit".equals(a.kind)).count();
    long polys = capped.stream().filter(a -> "cycle_polygon".equals(a.kind)).count();
    assertTrue(fits <= 2 && polys <= 2);
    EvidenceArtifact summary = capped.stream().filter(a -> "cycle_scores".equals(a.kind)).findFirst().orElseThrow();
    assertEquals(LONG_RESULT.intermediates.triangularity.cycles.size(), summary.calculationSamples());
    assertEquals(LONG_RESULT.intermediates.triangularity.cycles.size(), ((Number) summary.provenance.get("cycles_total")).intValue());
}
```

(`LONG_RESULT`: promote the existing `longD` local in `@BeforeClass` to a static field, the same way `SHORT_RESULT` is held.)

- [ ] **Step 2: Run to verify they fail**

Run (Docker Maven, never host mvn): `docker run --rm -v "${PWD}/src/flink:/w" -w /w maven:3.9-eclipse-temurin-11 mvn -q test -Dtest=CycleSamplingTest,GateArtifactsTest`
Expected: compile FAIL, `CycleSampling` not defined.

- [ ] **Step 3: Implement**

```java
package com.ams.flink.cplm.evidence;

/** CHG-049: which cycles get a per-cycle artifact. Evenly spaced across the window, both ends kept; k <= 0 or k >= n keeps all. */
public final class CycleSampling {
    private CycleSampling() {}

    public static int[] pick(int n, int k) {
        if (n <= 0) return new int[0];
        if (k <= 0 || k >= n) { int[] all = new int[n]; for (int i = 0; i < n; i++) all[i] = i; return all; }
        if (k == 1) return new int[] {0};
        int[] out = new int[k];
        for (int i = 0; i < k; i++) out[i] = (int) Math.round(i * (n - 1) / (double) (k - 1));
        return out;
    }
}
```

In `LongArtifacts`, replace the G7 and G9 loops (lines 40, 44-48) and add the overload. Keep `artifacts(r)` = `artifacts(r, 0)`, which is uncapped, for existing callers and tests:

```java
public static List<EvidenceArtifact> artifacts(CplmLongDiagnosticsResult r) { return artifacts(r, 0); }

public static List<EvidenceArtifact> artifacts(CplmLongDiagnosticsResult r, int maxCycles) {
    // … existing body up to G7 …
    if (g7 != null && k.triangularity != null && !k.triangularity.cycles.isEmpty()) {
        List<ShapeMath.CycleFit> cs = k.triangularity.cycles;
        int[] pick = CycleSampling.pick(cs.size(), maxCycles);
        for (int i : pick) out.add(stamp(cycleFit(g7, cs.get(i)), r));
        out.add(stamp(cycleScores(g7, cs, pick.length), r));
    }
    // … G8 unchanged …
    if (g9 != null && k.geometry != null) {
        List<ShapeMath.CyclePolygon> ps = k.geometry.polygons;
        for (int i : CycleSampling.pick(ps.size(), maxCycles)) {
            out.add(stamp(cyclePolygon(g9, ps.get(i), k), r));
            out.add(stamp(normalizedPairs(g9, ps.get(i)), r));
        }
        if (k.geometry.turningAngleRad.length > 0) out.add(stamp(corners(g9, k), r));
    }
    // … rest unchanged …
}

/** CHG-049 G7: one row per cycle (all of them, accepted and rejected) so capping the per-cycle artifacts loses no score. */
static EvidenceArtifact cycleScores(String runId, List<ShapeMath.CycleFit> cs, int emitted) {
    int n = cs.size();
    double[] id = new double[n], score = new double[n], sine = new double[n], tri = new double[n], acc = new double[n];
    for (int i = 0; i < n; i++) {
        ShapeMath.CycleFit c = cs.get(i);
        id[i] = c.cycleId; score[i] = c.score; sine[i] = c.sseSine; tri[i] = c.sseTriangle; acc[i] = c.accepted ? 1 : 0;
    }
    EvidenceArtifact a = EvidenceArtifact.series(runId, "G7", "cycle_scores", "ALL_CYCLES", "cycle_id", "ordinal", "cycle_score", "1", id, score, null);
    a.column("sse_sine", "EU2", sine);
    a.column("sse_triangle", "EU2", tri);
    a.column("accepted", "boolean", acc);
    a.provenance.put("cycles_total", n);
    a.provenance.put("cycles_emitted", emitted);
    a.provenance.put("cycle_selection", "EVEN_SPACED_ENDS_KEPT");
    return a;
}
```

In `EvidencePolicy`, add `public final int maxCycles;` (constructor overload `EvidencePolicy(Mode, int maxCycles)`; the existing one-arg constructor passes 12), and parse `--evidence-max-cycles` in `fromArgs` using the same loop. In `CplmLongDiagnosticsStreamJob.java:149`, call `LongArtifacts.artifacts(r, policy.maxCycles)`. In `EvidenceReconstruction.java:104`, call `LongArtifacts.artifacts(r, 0)`: a reconstruction is on request, so it rebuilds every cycle.

- [ ] **Step 4: Run tests, expect PASS** (same command; the whole `GateArtifactsTest` must stay green, including "G7 keeps rejected cycles", which still holds on the uncapped overload).
- [ ] **Step 5: Commit** — `feat(cplm-flink): CHG-049 - cap per-cycle G7/G9 artifacts; cycle_scores keeps every cycle`

---

### Task 2: `episodes` policy means a real finding

**Files:**
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/evidence/EvidencePolicy.java:52-64`
- Test: `GateArtifactsTest.java` (the policy test near :301)

- [ ] **Step 1: Failing tests**

```java
@Test
public void g5g6AloneAreNotAFindingAndConfiguredHealthIsNot() {
    EvidencePolicy p = new EvidencePolicy(EvidencePolicy.Mode.EPISODES);
    CplmLongDiagnosticsResult l = new CplmLongDiagnosticsResult();
    l.gate5Status = "WARN"; l.gate6Status = "WARN";
    l.gate7Status = l.gate8Status = l.gate9Status = l.gate10Status = l.gate11Status = "PASS";
    assertFalse(p.emit(l));
    l.gate9Status = "WARN";
    assertTrue(p.emit(l));
    CplmGateResult g = new CplmGateResult();
    g.gate14Status = "PASS"; g.diagnosis = "PASS";
    g.healthLanes = HealthLanesTestData.configuredGood();   // bound, no limitation
    assertFalse(p.emit(g));
}
```

If no test helper builds a configured-but-good `HealthLanes`, add a static `HealthLanesTestData` in the test package that uses `HealthLanes.of(Map.of("PV", record))`, with the record built like the existing health-lane tests do (`grep -rn "HealthLanes.of" src/flink/src/test`).

- [ ] **Step 2: Run, expect FAIL** (G5/G6 currently trip it).
- [ ] **Step 3: Implement**

```java
public boolean emit(CplmLongDiagnosticsResult r) {
    if (mode == Mode.NONE || r == null) return false;
    if (mode == Mode.ALL) return true;
    // CHG-049: G5 is WARN whenever any period exists and G6 whenever peakRatio > 0.5, so alone they are context, not a finding
    return finding(r.gate7Status) || finding(r.gate8Status) || finding(r.gate9Status)
            || finding(r.gate10Status) || finding(r.gate11Status);
}

public boolean emit(CplmGateResult r) {
    if (mode == Mode.NONE || r == null) return false;
    if (mode == Mode.ALL) return true;
    return finding(r.gate14Status) || (r.diagnosis != null && !"PASS".equals(r.diagnosis) && !"NO_CALL".equals(r.diagnosis) && !"PENDING".equals(r.diagnosis))
            || (r.healthLanes != null && (r.healthLanes.pvIneligible() || r.healthLanes.anyLimited()));   // CHG-049: a bound lane alone is not a finding
}
```

Fix the existing assertion at :303-315 if it relied on G5/G6 alone. The fixture must then carry a G7 to G11 finding.

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `feat(cplm-flink): CHG-049 - evidence policy ignores G5/G6-only and configured-only health`

---

### Task 3: Throttle Long-job emission per loop and window kind

**Files:**
- Create: `src/flink/src/main/java/com/ams/flink/cplm/evidence/EvidenceThrottle.java`
- Modify: `src/flink/src/main/java/com/ams/flink/cplm/CplmLongDiagnosticsStreamJob.java:130-160` (state + `emitEvidence`)
- Modify: `EvidencePolicy.java` (`minIntervalMs`, arg `--evidence-min-interval-min`, default 60)
- Test: `src/flink/src/test/java/com/ams/flink/cplm/evidence/EvidenceThrottleTest.java`

**Interfaces:**
- Produces: `EvidenceThrottle.signature(CplmLongDiagnosticsResult r) -> String`; `EvidenceThrottle.due(String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) -> boolean`.

- [ ] **Step 1: Failing tests**

```java
public class EvidenceThrottleTest {
    private static final long H = 3_600_000L;
    @Test public void firstEverEmits() { assertTrue(EvidenceThrottle.due(null, null, "W|P|P|P|P", 0, H)); }
    @Test public void sameSignatureInsideIntervalIsSuppressed() { assertFalse(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|P|P|P|P", H - 1, H)); }
    @Test public void sameSignatureAfterIntervalEmits() { assertTrue(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|P|P|P|P", H, H)); }
    @Test public void changedSignatureEmitsAtOnce() { assertTrue(EvidenceThrottle.due("W|P|P|P|P", 0L, "W|W|P|P|P", 1, H)); }
    @Test public void zeroIntervalNeverThrottles() { assertTrue(EvidenceThrottle.due("a", 5L, "a", 5, 0)); }
}
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**

```java
package com.ams.flink.cplm.evidence;

import com.ams.flink.cplm.CplmLongDiagnosticsResult;

/** CHG-049: the long tier re-fires every 15 min over overlapping windows; emit when the finding changes, else at most once per interval. */
public final class EvidenceThrottle {
    private EvidenceThrottle() {}

    public static String signature(CplmLongDiagnosticsResult r) {
        return r.gate7Status + "|" + r.gate8Status + "|" + r.gate9Status + "|" + r.gate10Status + "|" + r.gate11Status;
    }

    public static boolean due(String prevSig, Long prevMs, String sig, long nowMs, long minIntervalMs) {
        if (minIntervalMs <= 0 || prevSig == null || prevMs == null) return true;
        if (!prevSig.equals(sig)) return true;
        return nowMs - prevMs >= minIntervalMs;
    }
}
```

In `LongDiagnosticsProcessFunction`, add `private transient MapState<String, String> lastEvidenceSig;` and `MapState<String, Long> lastEvidenceMs;` (descriptors `"cplm-evidence-last-sig"` / `"cplm-evidence-last-ms"`, registered in `open`). Then:

```java
private void emitEvidence(OnTimerContext ctx, CplmLongDiagnosticsResult r, long nowMs) throws Exception {
    if (!policy.emit(r)) return;
    String sig = EvidenceThrottle.signature(r);
    if (!EvidenceThrottle.due(lastEvidenceSig.get(r.windowKind), lastEvidenceMs.get(r.windowKind), sig, nowMs, policy.minIntervalMs)) return;
    lastEvidenceSig.put(r.windowKind, sig);
    lastEvidenceMs.put(r.windowKind, nowMs);
    for (EvidenceArtifact a : LongArtifacts.artifacts(r, policy.maxCycles)) {
        for (String record : EvidenceKafkaRecords.records(a, MAPPER, nowMs)) ctx.output(EVIDENCE, record);
    }
}
```

The state is keyed by loop (the function's key) and mapped by window kind. That is Review Focus 3. New state descriptors restore empty on the next submit, so the first finding emits (Review Focus 4). Pass `--evidence-min-interval-min` through `migration/04b-submit-flink-jobs.sh:81` as `--evidence-min-interval-min "${CPLM_EVIDENCE_MIN_INTERVAL_MIN:-60}"` and `--evidence-max-cycles "${CPLM_EVIDENCE_MAX_CYCLES:-12}"` in `COMMON`.

- [ ] **Step 4: Run, expect PASS; run the full Flink suite** (`mvn -q test` in Docker Maven). It must stay green.
- [ ] **Step 5: Commit** — `feat(cplm-flink): CHG-049 - long evidence throttled per loop and window kind`

---

### Task 4: Evidence consumer — orphan chunks are skipped, assembly reads payloads once

**Files:**
- Modify: `src/services/cplm-api/BackgroundServices/CplmEvidenceConsumerService.cs:117-154`
- Modify: `src/services/cplm-api/Services/EvidenceBlobStore.cs` (add `CountChunksAsync`)
- Test: `tests/cplm-api.Tests/EvidenceConsumerOrphanTests.cs`

**Interfaces:**
- Produces: `EvidenceBlobStore.CountChunksAsync(Guid evidenceId, CancellationToken ct) -> Task<int>`.

- [ ] **Step 1: Failing test** (lab DB, `[Collection("instrument-bindings-lab")]`). Build the service the way the existing consumer tests do (`grep -rn "CplmEvidenceConsumerService(" tests/cplm-api.Tests`), then:

```csharp
[Fact]
public async Task Chunk_without_manifest_is_skipped_not_thrown_and_next_manifest_persists()
{
    var orphan = Guid.NewGuid();
    var chunkJson = $$"""{"record_kind":"EVIDENCE_CHUNK","evidence_id":"{{orphan}}","chunk_no":0,"sha256":"{{Sha("abc")}}","payload_b64":"YWJj"}""";
    await _svc.Invoking(s => s.ApplyAsync(chunkJson, default)).Should().NotThrowAsync();
    var id = Guid.NewGuid();
    await _svc.ApplyAsync(ManifestJson(id, chunkCount: 1), default);
    (await Readiness(id)).Should().Be("PENDING");
}
```

- [ ] **Step 2: Run, expect FAIL** (`InvalidOperationException`). Command: `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~EvidenceConsumerOrphan"`
- [ ] **Step 3: Implement.** Replace the throw at :117-123:

```csharp
if (!known)
{
    // CHG-049: the sweeper removed the manifest (TRANSIENT age/budget) before its chunks were consumed; nothing can complete it
    _logger.LogWarning("Evidence chunk {No} of {Id} has no manifest (swept); skipped", chunkNo, evidenceId);
    return;
}
```

In `EvaluateAsync`, after the readiness check:

```csharp
if (await _store.CountChunksAsync(evidenceId, ct) < m.ChunkCount) return;   // CHG-049: PENDING without reading payloads
```

`CountChunksAsync`: `SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = @id`.

- [ ] **Step 4: Run the evidence tests** (`--filter "FullyQualifiedName~Evidence"`), expect PASS.
- [ ] **Step 5: Commit** — `fix(cplm-api): CHG-049 - orphan evidence chunks skipped with a warning; assembly counts before reading`

---

### Task 5: Response retention (`RESPONSE` row) and expired-tombstone grace

**Files:**
- Create: `src/services/cplm-api/Services/ResponseRetention.cs`
- Modify: `src/services/cplm-api/Services/EvidenceRetentionSweeper.cs:66,69-94`
- Modify: `migration/deploy/docker-compose.marun.yml:183-188`, `migration/deploy/test_build_release.py:265-268`
- Schema: `database/scripts/55_cplm_response.sql`, `migration/schema/03-traverse_cplm.sql` (response block ~:656-700), `scripts/cpm-07-v25-schema.sql` (~:291-336): add `CREATE INDEX IF NOT EXISTS ix_response_event_created ON analytics.response_event (created_at);`
- Test: `tests/cplm-api.Tests/ResponseRetentionTests.cs`

**Interfaces:**
- Produces: `ResponseRetention.PurgeAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct) -> Task<int>` (events deleted). `SweepResult` gains `int ResponsePurged`.

- [ ] **Step 1: Failing test.** Insert one `response_event` with `created_at = NOW() - 20 days` plus 2 metrics on its `method_run_id`, and one event from 1 day ago. `PurgeAsync(db, 14, 1000)` must return 1, leave the new event, and leave 0 metrics for the old run.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**

```csharp
using Dapper;
using Npgsql;

namespace Traverse.CplmApi.Services;

/// <summary>CHG-049: response_event / response_metric had no retention (≈50 MB/day at Marun). Row RESPONSE of retention_policy, batched.</summary>
public static class ResponseRetention
{
    public static async Task<int> PurgeAsync(NpgsqlDataSource db, int days, int batch, CancellationToken ct)
    {
        var total = 0;
        while (true)
        {
            await using var conn = await db.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);
            var runs = (await conn.QueryAsync<Guid?>(new CommandDefinition("""
                DELETE FROM analytics.response_event WHERE event_id IN (
                    SELECT event_id FROM analytics.response_event
                    WHERE created_at < NOW() - make_interval(days => @days)
                    ORDER BY created_at LIMIT @batch FOR UPDATE SKIP LOCKED)
                RETURNING method_run_id
                """, new { days, batch }, tx, 600, cancellationToken: ct))).Where(g => g.HasValue).Select(g => g!.Value).ToArray();
            if (runs.Length > 0)
                await conn.ExecuteAsync(new CommandDefinition("DELETE FROM analytics.response_metric WHERE method_run_id = ANY(@runs)",
                    new { runs }, tx, 600, cancellationToken: ct));
            await tx.CommitAsync(ct);
            total += runs.Length;
            if (runs.Length < batch) return total;
        }
    }
}
```

Check the column types against `55_cplm_response.sql` before running: if `method_run_id` is `text`, use `string`. In the sweeper, add `"RESPONSE"` to `NotEvidenceClasses`. **Without it the sweeper would treat RESPONSE as an evidence class.** After step 3, read the row (`SELECT days FROM analytics.retention_policy WHERE record_class='RESPONSE'`) and, when it is not null, call `ResponseRetention.PurgeAsync(db, days, 5_000, ct)`.

In compose, add `Cplm__EvidenceExpiredGraceDays: ${Cplm__EvidenceExpiredGraceDays:-1}` and update the `test_build_release.py` assertion to six keys.

- [ ] **Step 4: Run** `dotnet test tests/cplm-api.Tests --filter "FullyQualifiedName~ResponseRetention|FullyQualifiedName~EvidenceRetention|FullyQualifiedName~EvidenceClassSweep"` and `python -m pytest migration/deploy/test_build_release.py -q`. Expect PASS.
- [ ] **Step 5: Commit** — `feat(cplm-api): CHG-049 - RESPONSE retention row; expired evidence grace 1 day`

---

### Task 6: Plant script, reclaim step, release wiring

**Files:**
- Create: `scripts/cpm-12-evidence-response-retention.sql` (online)
- Create: `scripts/cpm-12b-evidence-reclaim.sql` (cplm-api stopped)
- Modify: `migration/deploy/build-release.py` (`OPS_FILES`, flag `chg049-evidence`, VM-STEPS block), `migration/deploy/test_build_release.py`
- Modify: the accumulating SME-batch release section in `changes_tracker.md` (line ~3134) and its manifest when the batch closes

- [ ] **Step 1: `cpm-12`**

```sql
-- CHG-049 (online): response retention + its index. Idempotent.
\c traverse_cplm
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_response_event_created ON analytics.response_event (created_at);
INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE', 14)
    ON CONFLICT (record_class) DO UPDATE SET days = EXCLUDED.days;
```

- [ ] **Step 2: `cpm-12b`.** Run once after the new jar has run ≥ 1 h. It needs free disk ≥ 2 × the live evidence size (the script prints both before it starts):

```sql
-- CHG-049 (cplm-api STOPPED): drop the expired tombstones, then give the 3.7 GB high-water mark back to the disk
\c traverse_cplm
\set ON_ERROR_STOP 1
SELECT pg_size_pretty(pg_total_relation_size('analytics.evidence_chunk') + pg_total_relation_size('analytics.evidence_manifest')) AS before;
DELETE FROM analytics.evidence_manifest WHERE readiness = 'EXPIRED' AND pinned = FALSE;
DELETE FROM analytics.evidence_manifest WHERE retention_class = 'TRANSIENT' AND pinned = FALSE;   -- rebuilt within the hour by the new jar
VACUUM (FULL, ANALYZE) analytics.evidence_chunk;
VACUUM (FULL, ANALYZE) analytics.evidence_manifest;
VACUUM (FULL, ANALYZE) analytics.response_metric;
SELECT pg_size_pretty(pg_total_relation_size('analytics.evidence_chunk') + pg_total_relation_size('analytics.evidence_manifest')) AS after;
```

- [ ] **Step 3:** Add both files to `OPS_FILES` with CHG comments. Add flag `chg049-evidence` to the whitelist, with a VM-STEPS block in this order:
  1. load the images;
  2. `flink cancel` every job;
  3. `docker rm -f` JM and TM;
  4. deploy;
  5. `04b` submit;
  6. `cpm-12`;
  7. `02-apply-schemas.sh` (ownership);
  8. after 1 h: stop cplm-api, `cpm-12b`, start cplm-api;
  9. run `daily-check.sh`.

  The batch manifest (created when the version is assigned) carries `!chg049-evidence`, `flink-jobmanager`, `cplm-api` next to the batch's other services. Write a test in `test_build_release.py` that asserts the block and the order.
- [ ] **Step 4:** `python -m pytest migration/deploy/test_build_release.py -q`, expect PASS; `python migration/deploy/build-release.py --release v0.0.0-test --dry-run` with a temporary manifest carrying the flag, expect the block printed.
- [ ] **Step 5: Commit** — `build(release): CHG-049 - cpm-12 / cpm-12b and the chg049-evidence VM steps`

---

### Task 7: Daily check, runbooks, records

**Files:**
- Modify: `migration/daily-check.sh` §7, `migration/MARUN-DAILY-CHECK.md` §7, `prod_decision.md` §3/§4/§6/§2, `changes_tracker.md` (CHG-049 + an addition to the SME-batch release section), `checklist.md`, `migration/MARUN-DISK.md` (ZooKeeper rule)

- [ ] **Step 1: daily-check physical line** (after the TRANSIENT/EPISODE checks):

```bash
# CHG-049: the files, not the payload sum - DELETE never shrinks them (2026-10-06: 1.9 GB payload "within budget", 3.7 GB on disk)
evmb=$(pg "select (pg_total_relation_size('analytics.evidence_chunk')+pg_total_relation_size('analytics.evidence_manifest'))/1048576")
if [ "${evmb:-0}" -gt 3072 ]; then act "evidence tables ${evmb} MB on disk - MARUN-DAILY-CHECK.md 7"; elif [ "${evmb:-0}" -gt 1536 ]; then warn "evidence tables ${evmb} MB on disk"; else ok "evidence tables ${evmb} MB on disk"; fi
```

- [ ] **Step 2: Records.**
  - `prod_decision.md` §3 rows:
    - `RESPONSE` **14 d** (new)
    - `EvidenceExpiredGraceDays` **1 d** (was 7, built-in)
    - `--evidence-max-cycles` 12
    - `--evidence-min-interval-min` 60
    - evidence policy semantics
  - §6 incident row 2026-10-06:
    - disk 1.4 GB
    - ZooKeeper zero-byte `log.91a0` (moved out of `version-2/`, since renaming in place is still read)
    - 2.6 GB uncapped container log
    - `piarchiver-broker` crash-loop (not ours)
    - evidence 3.7 GB
  - §2: the release row when it deploys.
  - §7: add "decide max-cycles / min-interval by loop count".
  - `MARUN-DISK.md`: the ZooKeeper rule — back up both volumes, then move the bad file out of `version-2/`.
  - `changes_tracker.md` CHG-049 in the CHG-039 template order:
    - Scope
    - What was wrong
    - What changed
    - Tests
    - Lab
    - release block (into the SME-batch section): updated services `flink-jobmanager` + `cplm-api`; scripts `cpm-12` (online), `cpm-12b` (stopped); `.env` optional keys `CPLM_EVIDENCE_MAX_CYCLES`, `CPLM_EVIDENCE_MIN_INTERVAL_MIN`; rollback = the pre-release images, and the retention row can stay.
  - `checklist.md`: a `## CHG-049` section with one line per task, giving the commit ids.
- [ ] **Step 3: Commit** — `docs(ops): CHG-049 - evidence physical-size check, records, ZooKeeper recovery rule`

---

### Task 8: Lab proof (acceptance)

- [ ] **Step 1:** In the lab, set `CPLM_EVIDENCE_EMIT=episodes`. Run the old jar for 2 h and record TRANSIENT manifests/hour and MB/hour (`select date_trunc('hour',created_at), count(*), sum(total_bytes)/1048576 from analytics.evidence_manifest group by 1 order by 1 desc limit 3`).
- [ ] **Step 2:** Deploy the new jar and cplm-api. Run 2 h and measure the same numbers.
  - **Acceptance:** manifests/hour ≥ 5× lower.
  - **Acceptance:** an episode OPEN in the lab still shows COMPLETE evidence for its G7/G9 runs, or a RECONSTRUCT action, never an error.
  - **Acceptance:** `cycle_scores` renders in the workbench.
  - **Acceptance:** no `fail:` lines from `CplmEvidenceConsumerService`.
- [ ] **Step 2b: 24 h soak** with the new jar at plant config (144+ loops or the lab's full simulator fleet): hourly manifests, physical evidence MB (the new daily-check line), consumer lag of `traverse-cpa-cplm-evidence`, Flink checkpoints (no failed), Long-job TaskManager heap. Acceptance: physical evidence flat after the first 6 h; 0 consumer `fail:` lines; checkpoints all ok.
- [ ] **Step 2c: restart drill** - cancel + resubmit the Long job mid-soak: the first finding after restart emits at once (Review Focus 4); restart cplm-api mid-soak: no orphan-chunk errors, only warnings.
- [ ] **Step 2d: reconstruction** - for one run whose evidence was throttled (no manifests), POST an EVIDENCE_RECONSTRUCTION analysis run (source iotdb) and confirm all cycles come back (uncapped overload).
- [ ] **Step 3:** Run `cpm-12b` on the lab and record before/after sizes in CHG-049.
- [ ] **Step 4: Commit** the measurements into `changes_tracker.md`.

## Deferred (recorded, not built)

- **Partitioning the evidence tables.** Build it only if the daily-check physical line stays > 1.5 GB a week after the release. Required design: list-partition by class (TRANSIENT vs kept), with TRANSIENT range-partitioned by created_at hour blocks and dropped whole. This needs `retention_class` + `created_at` on `evidence_chunk`, explicit chunk lifecycle in place of the FK cascade, and `ON CONFLICT (evidence_id)` replaced (single consumer member makes `WHERE NOT EXISTS` safe).
- **Downsampling full-window series** (G5 `preprocessed_signal`, G9 `corners`, G10, G11) to `display_points`. This is a spec change ("payload carries the full calculation samples"), so it needs an SME decision.
- **Emit long evidence for one window kind only.** Decide after Task 8, by which window kinds episodes actually capture.

---

### Task 9: Lab stress test, plant failure modes (user request 2026-10-06: "stress test as much as we can so on the plant we don't face issues")

Run AFTER Task 8 stage A, on the CHG-049 jar + cplm-api. One scenario at a time. Each one records its numbers, a verdict, and anything that broke. No code fixes inside this task: a failure becomes a finding for a follow-up fix round.

| # | Plant risk | Scenario | Pass criteria |
|---|---|---|---|
| S1 | The cap and throttle never ran on oscillating data (the lab loops make no cycles) | Plant-scale oscillating fleet: `ams-sims/sim_ot_gateway_mqtt.py --loops-csv scripts/fixtures/hdpe-all-loops.csv` (161 loops, 1 s, ~1,700 samples/min) for >= 4 h. Make at least 20 loops oscillate with a clear limit cycle (period 60-120 s, square or triangle OP shape, low noise) so G7/G9 accept cycles. If the sim needs a profile flag for that, add it to the sim, which is test tooling. | max manifests per run <= 25; `cycle_scores` present with `cycles_total` > `cycles_emitted`; for each loop and window kind, at most one emission per 60 min unless the signature changed; TRANSIENT MB/h and rows/h recorded; checkpoints 0 failed; TM heap stable; consumer lag on `traverse-cpa-cplm-evidence` < 1,000 |
| S2 | Backlog drain (the 3 Oct and 5 Oct incidents) | Stop the feed for 60 min, then resume. Separately, inject a compressed backlog with `ams-sims/sim_loop_samples.py --span-minutes 720` for 20 loops. | The throttle bounds evidence in event time: at most ceil(span/60) emissions per loop × window kind per signature. Short and Long checkpoints do not enter the fail and restore loop. The Short lag drains. |
| S3 | Episode churn (580 episodes/day seen on 2 Oct) | Flip 20 loops between oscillating and clean every 20-40 min for 3 h, so verdicts open and close episodes. | EPISODE manifests per capture <= about 17 runs × 25; the EPISODE class grows linearly and stays bounded; captures stay capped by `EpisodeCaptureMax` |
| S4 | Infrastructure outages (ZooKeeper/Kafka on 6 Oct, cplm-api restarts, Postgres) | (a) restart the Kafka broker; (b) stop cplm-api for 30 min under load, then start it; (c) restart Postgres; (d) `docker kill` the TaskManager, so the restore includes the new throttle MapState | after each: all jobs RUNNING again, consumers back to 1 member, evidence `fail:` lines 0 (orphan WARNINGS allowed), lag drains, no duplicate jobs |
| S5 | TRANSIENT budget purge while data flows (orphan chunks) | Temporarily set `Cplm__EvidenceTransientBudgetBytes` to 50 MB for 1 h on the lab cplm-api | the budget is held; orphan chunks are only warnings; no consumer stall (lag stays flat); restore to 2 GiB afterwards |
| S6 | cpm-12b duration and lock impact at plant size | Run cpm-12b on the lab's 4.9 GB with the feed live (Flink keeps writing to Kafka, cplm-api stopped as the VM steps say) | record wall time per statement and peak disk; after the start, the consumer catches up and no evidence is lost beyond the documented TRANSIENT delete |
| S7 | An uncapped reconstruction of a 24 h G9 run with thousands of cycles | EVIDENCE_RECONSTRUCTION on a capped S1 run, source iotdb | COMPLETE; cycle_fit count = cycles_total; record time, Flink TM memory and STANDARD MB |
| S8 | Response purge at plant volume (2.6 M metric rows) | Insert 300k synthetic response events older than 14 d (about 50 metrics each, test-only `loop_id` prefix `STRESS-`), then let the sweeper purge them | the purge runs in batches; each batch transaction stays under 30 s; live response inserts are not blocked; synthetic rows are gone; no real rows are deleted |
| S9 | 24 h soak | Run S1 conditions for 24 h | physical evidence size flat after 6 h (within ±20 %); daily-check sections 4-9 all OK on the lab |

The lab must not run out of disk: check the free space on the drive that holds the Docker data before S1, S6 and S8, and stop if it is under 20 GB. Clean up all `STRESS-` data at the end. Results go in `docs/next-release/chg049-stress-results.md`, plus a summary in CHG-049 "End-to-end on the lab".

---

## Stress-test fixes (CHG-060..062), ship in the same batch (user decision 2026-10-06)

Source: Task 9 S1 (docs/next-release/chg049-stress-results.md). A 161-loop feed, with every sample doubled ×6 by leftover lab sources, ran the TaskManager out of heap in 25-30 min. The JVM did not exit, so all 13 jobs stayed in RESTARTING. Every restore and every replay ran out of heap again.

Plant numbers to design against:
- Grid 5 s, 142-144 loops, about 29 tuples/s.
- The Short buffer holds about 66 min of event time per loop: about 790 samples per loop, about 114k in total.
- About 250 MB live heap and a 116 MB checkpoint. Task heap is 1.1-1.23 GB of the 3584m TaskManager.
- About 2.2 KB live per buffered sample. Each buffered `CplmNormalizedSample` carries a full `resolvedProfile` (~117 members), deserialized for every record after `keyBy`.

Re-run load (user decision): plant rate × 3, i.e. about 87 tuples/s over 161 loops, no duplicates, 20+ loops oscillating.

### Task 11 (CHG-060): Flink JVMs exit on OOM
**Files:**
- `infra/docker/docker-compose.yml`: JM (~528-583) and TM (~629-683) FLINK_PROPERTIES
- `infra/docker/docker-compose.ha.yml`: JM, JM-2, TM, TM-2
- `migration/deploy/docker-compose.marun.yml`: JM (~271) and TM (~327)
- `migration/deploy/test_build_release.py`
- `prod_decision.md` §4/§6
- `migration/MARUN-DAILY-CHECK.md` §2/§4

**Changes:**
- Add `env.java.opts.jobmanager: -XX:+ExitOnOutOfMemoryError` and `env.java.opts.taskmanager: -XX:+ExitOnOutOfMemoryError` to every FLINK_PROPERTIES block.
- Do NOT add HeapDumpOnOutOfMemoryError. A dump over 1 GB on the 96 GB shared plant disk is a disk incident.
- The restart policy stays the inherited `unless-stopped`, so Docker restarts an exited JVM.

**Test:** pytest asserts both flags are present in the marun overlay for JM and TM, following the pattern of `test_the_plant_overlay_gives_the_taskmanager_3584m`.

**Docs (plant behaviour):**
- TM OOM: the TM restarts and the JM reschedules the jobs from their last checkpoint.
- JM OOM: the JM restarts. With NO HA at the plant the jobs are gone; daily check §4 shows fewer than 7, and the remedy is `04b`.
- Record this in prod_decision §4, and add the 2026-10-06 stress row to §6.

**Lab proof (in the re-run):** the flag is visible in the TM process, and a forced OOM restarts the TM.

### Task 12 (CHG-061a): Short buffer stores less per sample; exact duplicates dropped
**Files:** `src/flink/src/main/java/com/ams/flink/cplm/ShortFeatureBufferFn.java`, `ShortWindowParityTest.java`, plus a new or extended unit test.

1. **Profile:**
   - Buffer samples with `resolvedProfile = null`.
   - Keep the distinct profiles seen in the buffer in a small per-loop map, keyed by a profile identity (e.g. bundle hash plus revision, or the object's stable key). Evict them with the minutes, so the map is usually 1 entry.
   - Each buffered sample keeps only that key.
   - Before a window is computed, re-attach to each sample the profile it carried on arrival.
   - Calculator results must be IDENTICAL to today: the parity test stays green, apart from the duplicate change in (2).
2. **Duplicates:**
   - An exact duplicate `(loopId, eventTsMs)` already in the buffer is dropped at ingest: look up `minuteIndex.get(minuteOf(ts))` and compare ts.
   - Update `ShortWindowParityTest.java:162`, which injects duplicates on purpose. Its expectation becomes "duplicates are ignored", and a comment says why (CHG-062: duplicate feeds).
3. **Measure:**
   - Run `ShortWindowBacklogBench -Dshort.bench=true -Dshort.bench.real=true -Dshort.bench.heap=true` before and after (Docker Maven), and report `heap_used_after_gc_MB` and `checkpoint_MB`.
   - Target: at least 40 % less heap per buffered sample. If it is not reached, report the actual figure, with no gold-plating.

### Task 13 (CHG-061b): Hard per-loop cap on the Short buffer
**Files:** `ShortFeatureBufferFn.java`, `CplmShortFeatureStreamJob.java` (arg), `migration/04b-submit-flink-jobs.sh` (Short args), tests.

- **Argument:** `--short-max-samples-per-loop N`. The default is derived as `max(ceil(1.4 × 66 min / grid), 1100)`, with the grid taken from the sample's declared `grid_seconds` (fallback 5 s). That gives 1,109 at Marun (final review: was 2 × with a 1,584 floor; 1.4 × fits the 1,100 MB task heap at the cap, even during a heap snapshot). `04b` passes `${CPLM_SHORT_MAX_SAMPLES_PER_LOOP:-0}` (0 = derived).
- **When an append would exceed the cap:** evict whole oldest minutes until it fits, even if their windows have not fired yet.
- **Reporting:** a warning at most once per loop per hour, `SHORT_BUFFER_CAPPED loop=… samples=… watermarkLagMs=… cap=… declaredGridS=…`, plus a Flink counter `shortBufferCapped`.
- **Capped windows:** they report their true (lower) completeness. No crash, no unbounded growth.
- **Tests:**
  - Feed 3 × cap samples for one loop with a watermark that never advances: the buffer stays at or below the cap and the counter is above 0.
  - Normal feed: the cap is never hit and the output equals the parity baseline.
- **Bench:** with a stalled watermark (add a bench flag if needed), heap stays flat.

### Task 14 (CHG-062a): Duplicate timestamps no longer zero the sample period
**Files:** `src/flink/.../engine/SignalMath.java` (`filterHalfOpen` ~116-128, `inferSamplePeriodSec` ~130-138), `CplmLongDiagnosticsStreamJob.java` `onTimer` (~219-239), tests.

- `filterHalfOpen`: after sorting, drop a sample whose `eventTsMs` equals the previous one, keeping the first.
- `inferSamplePeriodSec`: ignore zero diffs (defence in depth).
- Long `onTimer` retain loop: drop exact `(loopId, eventTsMs)` repeats in both `rollingBuffer` and `peerBuffer`, so the state shrinks too.
- **Tests:**
  - A long window with every sample ×6 gives the same `tsSec`, the same validated period and the same cycle count as the clean series. Use the existing SYN-TIC / long fixtures.
  - Pin any test whose `sampleCount` changes, and explain why.

### Task 15 (CHG-062b): Ingestion refuses an overlapping loop-sample source
**Files:**
- `src/services/ingestion-service/Services/` (new pure `LoopSourceConflicts.cs`)
- `Program.cs` (POST ~162-180, PUT ~183-213, activate ~257-264)
- `Pipeline/OtIngestionHostService.cs` (`ReconcileAsync` ~73-108)
- `tests/ingestion-service.Tests/LoopSourceConflictTests.cs` (new)

**Rule.** A candidate `MQTT_LOOP_SAMPLES` source conflicts with an ACTIVE one (excluding itself) when:
- the broker endpoint is the same: normalized scheme, lower-case host, and port (missing port = 1883, or 8883 for mqtts/ssl);
- AND either some pair of their topic filters overlaps (compared level by level: `+` matches one level, `#` the rest), or their effective client ids are equal (`DataSourceDto.DeriveClientId`).

**API.** POST, PUT (only when the row is or becomes active) and activate return `409 {error:"overlaps active source '<name>' (<id>)", field:"topics"}`.

**Subscriber manager (`ReconcileAsync`):**
- Evaluate candidates in `(created_at, config_id)` order; the oldest wins.
- Record a loser as `Running(null, fingerprint, status)` with `ConnectionError = "duplicate feed: overlaps '<name>'"`, and log one LogError.
- Re-check losers every cycle, so a loser starts once the winner is deactivated.

**Warning, not a refusal.** When two active loop-sample sources share an endpoint but their filters do NOT overlap (the Marun diagnostics-vs-PIDParams trap, MARUN-CONTEXT §12b), log one LogWarning per change: "two loop-sample sources on one broker; if they carry the same values every sample is doubled".

**Tests (pure, no DB):**
- overlap matrix: exact, `+` vs a literal, `#`, disjoint, plant filter vs lab filter
- port normalization
- client-id clash
- self-exclusion
- inactive rows ignored
- oldest-wins ordering

### Task 16 (CHG-062c + records for 060-062): Lab scripts stop leaking sources; records
**Files:** `scripts/test-ot-loop-ingestion-e2e.ps1` (~154-166, ~524-533), `changes_tracker.md`, `prod_decision.md`, `migration/MARUN-DAILY-CHECK.md`, `migration/MARUN-CONTEXT.md` §12b, `checklist.md`.

**E2E script:**
- Reuse its named source: GET by name, PUT the profile, activate. Follow the pattern in `scripts/start-ot-loop-soak.ps1:53-75`.
- Deactivate the lab soak source `'OT Gateway (lab soak)'` while it runs, and restore it in `finally`.
- Move cleanup into try/finally.

**Records:**
- CHG-060, CHG-061 and CHG-062 entries in the CHG-049 template order.
- SME-batch release block: add "marun overlay FLINK_PROPERTIES changed (CHG-060)" and the Short args (CHG-061).
- prod_decision §3/§4/§6 rows: the cap default, the OOM flag, and the 2026-10-06 stress-test incident.
- Daily check: a line for `SHORT_BUFFER_CAPPED` warnings in the TaskManager log over 24 h (WARN if > 0).

### Task 17: Stress re-run at plant rate × 3 (replaces the blocked S1-S9)
- Same scenarios as Task 9, with:
  - a feed of 161 loops at about 1.85 s per loop, i.e. about 87 tuples/s, with no duplicate sources;
  - 20+ loops oscillating (sim `--limit-cycle` profile, commit 3751f95b);
  - the CHG-060..062 jar and cplm-api.
- **S10:** a forced TaskManager OOM (e.g. via a test-only job, or `jcmd`). Acceptance: the TM exits and restarts, and the jobs return on their own.
- **S11:** re-enable ONE duplicate data source through the API, which must return 409, then through SQL, where the subscriber manager must refuse it. Then remove it.
- Coordinate every disruption with the UI session (ams-open-8c). The cherry-picked cplm-api commits b448bf89..ab3c21c8 stay in the build.
