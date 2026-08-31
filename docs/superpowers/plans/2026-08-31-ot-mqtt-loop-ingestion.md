# OT MQTT Loop Ingestion (ingestion-service phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MQTT subscriber pipeline in `src/services/ingestion-service` that consumes the OT gateway's control-loop feed (`OT/HDPE/<FCS>/<class>/<loop>/PIDParams/<param>`), validates + resolves each message against the CPM Loop Registry, enriches with registry metadata, joins per-loop parameters onto a 5 s grid, and publishes merged tuples keyed by `loop_id` to Kafka `traverse.cpa.loop.samples.v1` — with unknown loops quarantined, never dropped.

**Architecture:** One `BackgroundService` per active `MQTT_LOOP_SAMPLES` data-source config: MQTTnet managed client (stable client id, QoS 1, persistent session) → bounded channel → stateless stages (topic parser → payload parser → consistency check → registry resolve → param mapping) → per-loop joiner (last-known-value + grid tick + forward-fill) → idempotent Kafka producer. Invalid/unknown messages go to `traverse.ingestion.ot-dlq` + an aggregated `ingestion.unknown_sources` inventory. Full rationale and evidence: [docs/ot-data-integration/08-ot-mqtt-loop-ingestion-assessment.md](../../ot-data-integration/08-ot-mqtt-loop-ingestion-assessment.md).

**Tech Stack:** .NET 8 minimal API + BackgroundService, MQTTnet 4.3.7, Confluent.Kafka 2.3.0, Dapper/Npgsql, prometheus-net, xUnit; Python (paho-mqtt) for the lab simulator; PowerShell for E2E.

**Spec:** [docs/ot-data-integration/08-ot-mqtt-loop-ingestion-assessment.md](../../ot-data-integration/08-ot-mqtt-loop-ingestion-assessment.md) (decisions) + [09-ot-mqtt-loop-mapping.md](../../ot-data-integration/09-ot-mqtt-loop-mapping.md) (field contract) + [01-ot-data-requirements.md](../../ot-data-integration/01-ot-data-requirements.md) §4 (Kafka tuple contract) + [03-mqtt-ingestion-enrichment-service.md](../../ot-data-integration/03-mqtt-ingestion-enrichment-service.md) (service design).

## Global Constraints

- **Max 400–500 lines per source file** (CLAUDE.md rule) — split rather than grow.
- **No loop names, FCS names, or topic strings hardcoded in service code** — everything identity-related comes from the data-source config (`profile_config`) or the Loop Registry. (The simulator and test fixtures MAY name loops — they are the lab OT side.)
- **Kafka topics are pre-created** (`KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"`): every new topic goes into `scripts/kafka-reset-lab-topics.ps1` AND `migration/kafka/topics.txt`.
- **Tuple contract fields are frozen** (read by `CplmNormalizedSample.java` and `RawLoopIotDbConsumer.cs`): `loop_id`, `event_ts_ms`, `pv`, `sp`, `op`, `vp`, `mode`, `quality`, `loop_type` — extension fields are additive only and must not collide with these names.
- **Kafka key = `loop_id` with the registry's exact casing**; producer `acks=all`, idempotent, lz4. At-least-once end to end; never claim exactly-once.
- **Wire/stored JSON is snake_case** (matches `profile_config` and the tuple contract).
- **Never auto-create loops/assets from MQTT traffic** — unknowns park.
- Existing phase-1 behavior (config CRUD, tester, invariants) must not regress — `dotnet test tests/ingestion-service.Tests` stays green throughout.
- Service builds with `dotnet build src/services/ingestion-service/ingestion-service.csproj` from repo root; tests with `dotnet test tests/ingestion-service.Tests`.
- Every commit message ends with the repo's `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

## File Structure (new/modified)

```
src/services/ingestion-service/
├── Models/DataSourceConfig.cs           MODIFY: ProfileConfig gains loop_ingest
├── Models/LoopIngestConfig.cs           NEW: loop_ingest contract + resolved settings
├── Services/DataSourceValidation.cs     MODIFY: validate loop_ingest
├── Services/MqttClientOptionsFactory.cs NEW: shared connect/TLS builder (tester + subscriber)
├── Services/MqttConnectionTester.cs     MODIFY: delegate option building to the factory
├── Services/UnknownSourceRepository.cs  NEW: ingestion.unknown_sources access
├── Pipeline/OtTopicParser.cs            NEW: template-driven topic parsing
├── Pipeline/OtPayloadParser.cs          NEW: payload DTO + parse + DLQ reasons
├── Pipeline/OtConsistencyValidator.cs   NEW: topic-vs-payload identity check
├── Pipeline/LoopParameterMapper.cs      NEW: param→role + numeric MODE map
├── Pipeline/LoopRegistryCache.cs        NEW: cplm-api client + cached resolver
├── Pipeline/LoopJoiner.cs               NEW: per-loop LKV state + grid tick + tuple
├── Pipeline/LoopSamplePipelineProducer.cs NEW: Kafka tuple + DLQ producer
├── Pipeline/UnknownSourceInventory.cs   NEW: in-memory aggregation + flush
├── Pipeline/IngestionMetrics.cs         NEW: Prometheus counters
├── Pipeline/OtLoopSubscriber.cs         NEW: one MQTT client + pipeline per config
├── Pipeline/OtIngestionHostService.cs   NEW: lifecycle host + config watch
├── Pipeline/PipelineEndpoints.cs        NEW: /stats, /unknown-sources, reload
├── Program.cs                           MODIFY: DI wiring, health, self-heal DDL, endpoints
└── ingestion-service.csproj             MODIFY: + prometheus-net.AspNetCore
tests/ingestion-service.Tests/           NEW test files per component
database/scripts/49_ingestion_unknown_sources.sql   NEW
scripts/kafka-reset-lab-topics.ps1       MODIFY: + traverse.ingestion.ot-dlq
migration/kafka/topics.txt               MODIFY: + traverse.ingestion.ot-dlq
infra/docker/docker-compose.yml          MODIFY: ingestion-service env
infra/docker/prometheus.yml              MODIFY: scrape job (if scrape configs live here — verify)
ams-sims/sim_ot_gateway_mqtt.py          NEW: lab OT gateway stand-in
scripts/fixtures/hdpe-pilot-loops.csv    NEW: pilot loop worksheet
scripts/test-ot-loop-ingestion-e2e.ps1   NEW: full-pipeline E2E
docs/ot-data-integration/10-ot-loop-ingestion-runbook.md  NEW
```

---

### Task 1: Loop-ingest configuration contract

**Files:**
- Create: `src/services/ingestion-service/Models/LoopIngestConfig.cs`
- Modify: `src/services/ingestion-service/Models/DataSourceConfig.cs` (ProfileConfig class, ~line 34)
- Modify: `src/services/ingestion-service/Services/DataSourceValidation.cs`
- Test: `tests/ingestion-service.Tests/LoopIngestConfigTests.cs`

**Interfaces:**
- Produces: `LoopIngestConfig` (JSONB `profile_config.loop_ingest`), `LoopIngestConfig.Resolve()` → `LoopIngestSettings(string TopicTemplate, int GridSeconds, int StaleAfterSeconds, int FutureSkewMaxSeconds, IReadOnlyDictionary<string,string> ParamRoles, IReadOnlyDictionary<string,string> ModeValueMap, int RegistryRefreshSeconds)`. Every later task consumes `LoopIngestSettings`.

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/ingestion-service.Tests/LoopIngestConfigTests.cs
using Traverse.IngestionService.Models;
using Xunit;

public class LoopIngestConfigTests
{
    [Fact]
    public void Resolve_applies_defaults_when_empty()
    {
        var s = new LoopIngestConfig().Resolve();
        Assert.Equal("{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}", s.TopicTemplate);
        Assert.Equal(5, s.GridSeconds);
        Assert.Equal(30, s.StaleAfterSeconds);
        Assert.Equal(300, s.FutureSkewMaxSeconds);
        Assert.Equal(60, s.RegistryRefreshSeconds);
        Assert.Equal("pv", s.ParamRoles["PV"]);
        Assert.Equal("gw", s.ParamRoles["gw"]); // case-insensitive keys
        Assert.Empty(s.ModeValueMap);
    }

    [Fact]
    public void Resolve_keeps_explicit_values()
    {
        var s = new LoopIngestConfig
        {
            TopicTemplate = "{ns}/{site}/{fcs}/{class}/{loop}/PIDParams/{param}",
            GridSeconds = 10,
            ParamRoles = new() { ["PV"] = "pv", ["SP"] = "sp", ["OP"] = "op", ["MODE"] = "mode" },
            ModeValueMap = new() { ["4"] = "AUT" },
        }.Resolve();
        Assert.Equal(10, s.GridSeconds);
        Assert.Equal("AUT", s.ModeValueMap["4"]);
        Assert.False(s.ParamRoles.ContainsKey("GW")); // explicit map replaces defaults entirely
    }

    [Fact]
    public void ProfileConfig_roundtrips_loop_ingest_json()
    {
        var json = """{"mqtt":{"topics":["OT/HDPE/+/+/+/PIDParams/+"]},"loop_ingest":{"grid_seconds":7,"mode_value_map":{"4":"AUT"}}}""";
        var cfg = ProfileConfig.FromJson(json);
        Assert.NotNull(cfg.LoopIngest);
        Assert.Equal(7, cfg.LoopIngest!.Resolve().GridSeconds);
        Assert.Contains("loop_ingest", cfg.ToJson());
    }

    [Theory]
    [InlineData("{site}/{loop}", "loop_ingest.topic_template")]           // missing {fcs}/{param}
    [InlineData("", null)]                                                 // empty = default = valid
    public void Validation_requires_the_four_capture_levels(string template, string? expectedField)
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig { TopicTemplate = template } };
        var result = Traverse.IngestionService.Services.DataSourceValidation.ValidateLoopIngest(cfg);
        if (expectedField is null) Assert.Null(result);
        else Assert.Equal(expectedField, result!.Value.Field);
    }

    [Fact]
    public void Validation_rejects_roles_shadowing_contract_fields()
    {
        var cfg = new ProfileConfig { LoopIngest = new LoopIngestConfig
            { ParamRoles = new() { ["PV"] = "pv", ["X"] = "loop_type" } } };
        var result = Traverse.IngestionService.Services.DataSourceValidation.ValidateLoopIngest(cfg);
        Assert.Equal("loop_ingest.param_roles", result!.Value.Field);
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test tests/ingestion-service.Tests --filter "FullyQualifiedName~LoopIngestConfigTests"`
Expected: FAIL — `LoopIngestConfig` not defined.

- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Models/LoopIngestConfig.cs
using System.Text.Json.Serialization;

namespace Traverse.IngestionService.Models;

/// <summary>
/// profile_config.loop_ingest — per-data-source settings for the MQTT_LOOP_SAMPLES
/// pipeline. Snake_case on the wire like the rest of profile_config; the topic
/// template and maps exist so no loop/FCS/parameter name is ever hardcoded.
/// </summary>
public sealed class LoopIngestConfig
{
    [JsonPropertyName("topic_template")] public string? TopicTemplate { get; set; }
    [JsonPropertyName("grid_seconds")] public int? GridSeconds { get; set; }
    [JsonPropertyName("stale_after_seconds")] public int? StaleAfterSeconds { get; set; }
    [JsonPropertyName("future_skew_max_seconds")] public int? FutureSkewMaxSeconds { get; set; }
    [JsonPropertyName("param_roles")] public Dictionary<string, string>? ParamRoles { get; set; }
    [JsonPropertyName("mode_value_map")] public Dictionary<string, string>? ModeValueMap { get; set; }
    [JsonPropertyName("registry_refresh_seconds")] public int? RegistryRefreshSeconds { get; set; }

    public static readonly Dictionary<string, string> DefaultParamRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["PV"] = "pv", ["SP"] = "sp", ["OP"] = "op", ["MODE"] = "mode",
        ["P"] = "p", ["I"] = "i", ["D"] = "d", ["GW"] = "gw",
    };

    public LoopIngestSettings Resolve() => new(
        TopicTemplate: string.IsNullOrWhiteSpace(TopicTemplate)
            ? "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}" : TopicTemplate.Trim(),
        GridSeconds: GridSeconds is > 0 ? GridSeconds.Value : 5,
        StaleAfterSeconds: StaleAfterSeconds is > 0 ? StaleAfterSeconds.Value : 30,
        FutureSkewMaxSeconds: FutureSkewMaxSeconds is > 0 ? FutureSkewMaxSeconds.Value : 300,
        ParamRoles: ParamRoles is { Count: > 0 }
            ? new Dictionary<string, string>(ParamRoles, StringComparer.OrdinalIgnoreCase)
            : DefaultParamRoles,
        ModeValueMap: ModeValueMap ?? new Dictionary<string, string>(),
        RegistryRefreshSeconds: RegistryRefreshSeconds is > 0 ? RegistryRefreshSeconds.Value : 60);
}

public sealed record LoopIngestSettings(
    string TopicTemplate,
    int GridSeconds,
    int StaleAfterSeconds,
    int FutureSkewMaxSeconds,
    IReadOnlyDictionary<string, string> ParamRoles,
    IReadOnlyDictionary<string, string> ModeValueMap,
    int RegistryRefreshSeconds);
```

In `Models/DataSourceConfig.cs`, add to `ProfileConfig` (next to the `Mqtt` property):

```csharp
    [JsonPropertyName("loop_ingest")] public LoopIngestConfig? LoopIngest { get; set; }
```

In `Services/DataSourceValidation.cs`, add a public method and call it from `ValidateCreate`/`ValidateMerged` (follow the file's existing `(string Error, string Field)?` result pattern — read the file first and match its exact signature style):

```csharp
    /// <summary>Reserved names on the tuple wire — extension roles may not shadow them.</summary>
    private static readonly HashSet<string> ReservedTupleFields = new(StringComparer.Ordinal)
    { "loop_id", "event_ts_ms", "quality", "loop_type", "site", "area", "unit", "asset_uuid", "source_fcs" };

    public static (string Error, string Field)? ValidateLoopIngest(ProfileConfig? profileConfig)
    {
        var li = profileConfig?.LoopIngest;
        if (li is null) return null;

        if (!string.IsNullOrWhiteSpace(li.TopicTemplate))
        {
            var captures = li.TopicTemplate.Split('/')
                .Where(s => s.Length > 1 && s[0] == '{' && s[^1] == '}')
                .Select(s => s[1..^1]).ToHashSet(StringComparer.Ordinal);
            foreach (var required in new[] { "site", "fcs", "loop", "param" })
                if (!captures.Contains(required))
                    return ($"topic_template must capture {{{required}}}", "loop_ingest.topic_template");
        }
        if (li.GridSeconds is <= 0) return ("grid_seconds must be > 0", "loop_ingest.grid_seconds");
        if (li.StaleAfterSeconds is <= 0) return ("stale_after_seconds must be > 0", "loop_ingest.stale_after_seconds");

        if (li.ParamRoles is not null)
            foreach (var (param, role) in li.ParamRoles)
            {
                if (string.IsNullOrWhiteSpace(param) || string.IsNullOrWhiteSpace(role))
                    return ("param_roles entries must be non-blank", "loop_ingest.param_roles");
                var r = role.Trim().ToLowerInvariant();
                if (ReservedTupleFields.Contains(r))
                    return ($"role '{r}' shadows a tuple contract field", "loop_ingest.param_roles");
                if (!r.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '_'))
                    return ($"role '{r}' must be lowercase [a-z0-9_]", "loop_ingest.param_roles");
            }
        return null;
    }
```

- [ ] **Step 4: Run tests** — `dotnet test tests/ingestion-service.Tests --filter "FullyQualifiedName~LoopIngestConfigTests"` → PASS; then the full test project → still green.
- [ ] **Step 5: Commit** — `feat(ingestion): loop_ingest profile-config contract`

---

### Task 2: Unknown-source store (DDL + repository)

**Files:**
- Create: `database/scripts/49_ingestion_unknown_sources.sql`
- Modify: `src/services/ingestion-service/Program.cs` (`SelfHeal.SchemaDdl` array, ~line 241)
- Create: `src/services/ingestion-service/Services/UnknownSourceRepository.cs`
- Modify: `migration/schema/04-traverse_ingestion.sql` (append the same table — keep migration pack in sync)

**Interfaces:**
- Produces: `UnknownSourceRepository.UpsertBatchAsync(IEnumerable<UnknownSourceRow>, CancellationToken)`, `ListAsync(Guid? configId, int limit, CancellationToken)` → `IReadOnlyList<UnknownSourceRow>`; `record UnknownSourceRow(Guid ConfigId, string Reason, string SourceKey, DateTime FirstSeen, DateTime LastSeen, long MessageCount, string? LastTopic, string? LastPayload)`.

- [ ] **Step 1: Write the DDL script**

```sql
-- database/scripts/49_ingestion_unknown_sources.sql
-- Aggregated parking inventory for OT messages that could not be resolved
-- (LOOP_NOT_REGISTERED / UNKNOWN_PARAMETER). One row per (config, reason, source),
-- counted — never one row per message. Reviewed by engineers; registering the
-- loop makes the source flow on the next registry refresh.
\c traverse_ingestion
CREATE TABLE IF NOT EXISTS ingestion.unknown_sources (
    config_id     UUID         NOT NULL,
    reason        VARCHAR(40)  NOT NULL,
    source_key    VARCHAR(256) NOT NULL,
    first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    message_count BIGINT       NOT NULL DEFAULT 1,
    last_topic    TEXT,
    last_payload  JSONB,
    PRIMARY KEY (config_id, reason, source_key)
);
CREATE INDEX IF NOT EXISTS idx_unknown_sources_last_seen
    ON ingestion.unknown_sources(last_seen DESC);
```

- [ ] **Step 2: Mirror it in the self-heal DDL** — append both statements (without the `\c`) to `SelfHeal.SchemaDdl` in `Program.cs`, with the existing "keep the two in sync" comment updated to mention script 49. Append the same `CREATE TABLE`/`CREATE INDEX` block to `migration/schema/04-traverse_ingestion.sql`.

- [ ] **Step 3: Implement the repository**

```csharp
// src/services/ingestion-service/Services/UnknownSourceRepository.cs
using Dapper;
using Npgsql;

namespace Traverse.IngestionService.Services;

public sealed record UnknownSourceRow(
    Guid ConfigId, string Reason, string SourceKey,
    DateTime FirstSeen, DateTime LastSeen, long MessageCount,
    string? LastTopic, string? LastPayload);

public sealed class UnknownSourceRepository
{
    private readonly NpgsqlDataSource _db;
    public UnknownSourceRepository(NpgsqlDataSource db) => _db = db;

    public async Task UpsertBatchAsync(IEnumerable<UnknownSourceRow> rows, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO ingestion.unknown_sources
                (config_id, reason, source_key, first_seen, last_seen, message_count, last_topic, last_payload)
            VALUES (@ConfigId, @Reason, @SourceKey, @LastSeen, @LastSeen, @MessageCount, @LastTopic, @LastPayload::jsonb)
            ON CONFLICT (config_id, reason, source_key) DO UPDATE SET
                last_seen     = EXCLUDED.last_seen,
                message_count = ingestion.unknown_sources.message_count + EXCLUDED.message_count,
                last_topic    = EXCLUDED.last_topic,
                last_payload  = EXCLUDED.last_payload
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        foreach (var row in rows)
            await conn.ExecuteAsync(new CommandDefinition(sql, row, tx, cancellationToken: ct));
        await tx.CommitAsync(ct);
    }

    public async Task<IReadOnlyList<UnknownSourceRow>> ListAsync(Guid? configId, int limit, CancellationToken ct)
    {
        const string sql = """
            SELECT config_id, reason, source_key, first_seen, last_seen, message_count, last_topic, last_payload::text AS last_payload
            FROM ingestion.unknown_sources
            WHERE (@ConfigId::uuid IS NULL OR config_id = @ConfigId)
            ORDER BY last_seen DESC LIMIT @Limit
            """;
        await using var conn = await _db.OpenConnectionAsync(ct);
        var rows = await conn.QueryAsync<UnknownSourceRow>(
            new CommandDefinition(sql, new { ConfigId = configId, Limit = limit }, cancellationToken: ct));
        return rows.AsList();
    }
}
```

- [ ] **Step 4: Verify** — `dotnet build src/services/ingestion-service/ingestion-service.csproj` clean; if the lab Postgres is up, `dotnet run` once and confirm the log line `ingestion schema self-heal complete`, then `docker exec ams-postgres psql -U ams_user -d traverse_ingestion -c "\d ingestion.unknown_sources"` shows the table.
- [ ] **Step 5: Commit** — `feat(ingestion): unknown_sources parking table + repository`

---

### Task 3: Topic parser

**Files:**
- Create: `src/services/ingestion-service/Pipeline/OtTopicParser.cs`
- Test: `tests/ingestion-service.Tests/OtTopicParserTests.cs`

**Interfaces:**
- Produces: `record OtTopicIdentity(string Site, string Fcs, string ProcessClass, string LoopTag, string Parameter)`; `OtTopicParser.TryParse(string template, string topic, out OtTopicIdentity? identity, out string? error): bool`.

- [ ] **Step 1: Failing tests**

```csharp
// tests/ingestion-service.Tests/OtTopicParserTests.cs
using Traverse.IngestionService.Pipeline;
using Xunit;

public class OtTopicParserTests
{
    private const string T = "{ns}/{site}/{fcs}/{class}/{loop}/{group}/{param}";

    [Fact]
    public void Parses_the_observed_hierarchy()
    {
        Assert.True(OtTopicParser.TryParse(T, "OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV", out var id, out _));
        Assert.Equal(new OtTopicIdentity("HDPE", "FCS0101", "Flow", "FIC10302", "PV"), id);
    }

    [Fact]
    public void Literal_template_levels_must_match()
    {
        var t = "{ns}/{site}/{fcs}/{class}/{loop}/PIDParams/{param}";
        Assert.True(OtTopicParser.TryParse(t, "OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV", out _, out _));
        Assert.False(OtTopicParser.TryParse(t, "OT/HDPE/FCS0101/Flow/FIC10302/OtherGroup/PV", out _, out var err));
        Assert.Contains("PIDParams", err);
    }

    [Theory]
    [InlineData("OT/HDPE/FCS0101/Flow/FIC10302/PIDParams")]          // too few levels
    [InlineData("OT/HDPE/FCS0101/Flow/FIC10302/PIDParams/PV/extra")] // too many
    public void Wrong_depth_fails(string topic) =>
        Assert.False(OtTopicParser.TryParse(T, topic, out _, out _));

    [Fact]
    public void Template_missing_required_capture_fails()
    {
        Assert.False(OtTopicParser.TryParse("{ns}/{site}/{loop}/{param}", "OT/HDPE/FIC1/PV", out _, out var err));
        Assert.Contains("{fcs}", err);
    }
}
```

- [ ] **Step 2: Run** → FAIL (type missing).
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/OtTopicParser.cs
namespace Traverse.IngestionService.Pipeline;

public sealed record OtTopicIdentity(string Site, string Fcs, string ProcessClass, string LoopTag, string Parameter);

/// <summary>
/// Template-driven topic parser. The template is '/'-separated; '{name}' captures a
/// level, any other segment must match the topic level literally (case-sensitive —
/// MQTT topics are). Required captures: {site} {fcs} {loop} {param}; {class} is
/// optional; other captures ({ns}, {group}, …) are accepted and ignored.
/// </summary>
public static class OtTopicParser
{
    public static bool TryParse(string template, string topic, out OtTopicIdentity? identity, out string? error)
    {
        identity = null; error = null;
        var t = template.Split('/');
        var s = topic.Split('/');
        if (t.Length != s.Length)
        {
            error = $"topic has {s.Length} levels, template expects {t.Length}";
            return false;
        }
        string? site = null, fcs = null, cls = null, loop = null, param = null;
        for (var i = 0; i < t.Length; i++)
        {
            var seg = t[i];
            if (seg.Length > 1 && seg[0] == '{' && seg[^1] == '}')
            {
                switch (seg[1..^1])
                {
                    case "site": site = s[i]; break;
                    case "fcs": fcs = s[i]; break;
                    case "class": cls = s[i]; break;
                    case "loop": loop = s[i]; break;
                    case "param": param = s[i]; break;
                }
            }
            else if (!string.Equals(seg, s[i], StringComparison.Ordinal))
            {
                error = $"level {i + 1} is '{s[i]}', template requires '{seg}'";
                return false;
            }
        }
        foreach (var (value, name) in new[] { (site, "{site}"), (fcs, "{fcs}"), (loop, "{loop}"), (param, "{param}") })
            if (value is null) { error = $"template does not capture {name}"; return false; }
        if (string.IsNullOrWhiteSpace(loop) || string.IsNullOrWhiteSpace(param))
        { error = "empty loop or parameter level"; return false; }

        identity = new OtTopicIdentity(site!, fcs!, cls ?? "", loop!, param!);
        return true;
    }
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): template-driven OT topic parser`

---

### Task 4: Payload parser + DLQ reason catalog

**Files:**
- Create: `src/services/ingestion-service/Pipeline/OtPayloadParser.cs`
- Test: `tests/ingestion-service.Tests/OtPayloadParserTests.cs`

**Interfaces:**
- Produces: `record OtLoopPayload(double? NumericValue, string? RawValue, string? Unit, string Quality, long TsMs, string? Source, long Seq, string? Device, string? Area, string? Line, string? Site, string? ProcessUnit, string? Equipment, string? Item)`; `OtPayloadParser.Parse(byte[] body, long nowMs, int futureSkewMaxSeconds, out string? reason, out string? detail): OtLoopPayload?`; static class `DlqReasons` with constants `MalformedJson="MALFORMED_JSON"`, `MissingField="MISSING_FIELD"`, `BadTimestamp="BAD_TIMESTAMP"`, `FutureTimestamp="FUTURE_TIMESTAMP"`, `TopicShapeMismatch="TOPIC_SHAPE_MISMATCH"`, `LoopIdentityMismatch="LOOP_IDENTITY_MISMATCH"`, `ParameterMismatch="PARAMETER_MISMATCH"`, `LoopNotRegistered="LOOP_NOT_REGISTERED"`, `UnknownParameter="UNKNOWN_PARAMETER"`.

- [ ] **Step 1: Failing tests**

```csharp
// tests/ingestion-service.Tests/OtPayloadParserTests.cs
using System.Text;
using Traverse.IngestionService.Pipeline;
using Xunit;

public class OtPayloadParserTests
{
    private const long Now = 1_756_600_000_000; // fixed "now" for determinism

    private static OtLoopPayload? Parse(string json, out string? reason, out string? detail) =>
        OtPayloadParser.Parse(Encoding.UTF8.GetBytes(json), Now, 300, out reason, out detail);

    [Fact]
    public void Parses_the_observed_envelope()
    {
        var p = Parse("""
            {"value": -0.2363, "unit": "", "quality": "GOOD", "ts": "2026-08-31T06:07:14.187Z",
             "source": "opc_ua", "seq": 0, "device": "FIC10302", "area": "FCS0101", "line": "Flow",
             "enterprise": "", "site": "HDPE", "process_unit": "Flow", "equipment": "FIC10302", "item": "PV"}
            """, out var reason, out _);
        Assert.Null(reason);
        Assert.Equal(-0.2363, p!.NumericValue!.Value, 4);
        Assert.Equal("GOOD", p.Quality);
        Assert.Equal("FIC10302", p.Device);
        Assert.Equal("PV", p.Item);
        Assert.Equal(DateTimeOffset.Parse("2026-08-31T06:07:14.187Z").ToUnixTimeMilliseconds(), p.TsMs);
    }

    [Fact]
    public void Numeric_mode_value_keeps_raw_text()
    {
        var p = Parse("""{"value": 4.0, "ts": 1756599999000, "item": "MODE"}""", out var reason, out _);
        Assert.Null(reason);
        Assert.Equal(4.0, p!.NumericValue);
        Assert.Equal("4.0", p.RawValue);
    }

    [Theory]
    [InlineData("not json at all", "MALFORMED_JSON")]
    [InlineData("""{"ts": 1756599999000}""", "MISSING_FIELD")]                       // no value
    [InlineData("""{"value": 1}""", "MISSING_FIELD")]                                // no ts
    [InlineData("""{"value": 1, "ts": "yesterday-ish"}""", "BAD_TIMESTAMP")]
    public void Bad_payloads_return_the_right_reason(string json, string expected)
    {
        Assert.Null(Parse(json, out var reason, out _));
        Assert.Equal(expected, reason);
    }

    [Fact]
    public void Future_timestamp_beyond_skew_is_rejected()
    {
        Assert.Null(Parse($$"""{"value": 1, "ts": {{Now + 301_000}}}""", out var reason, out _));
        Assert.Equal(DlqReasons.FutureTimestamp, reason);
        Assert.NotNull(Parse($$"""{"value": 1, "ts": {{Now + 299_000}}}""", out reason, out _));
        Assert.Null(reason);
    }

    [Fact]
    public void Quality_defaults_to_GOOD_when_absent()
    {
        var p = Parse("""{"value": 1, "ts": 1756599999000}""", out _, out _);
        Assert.Equal("GOOD", p!.Quality);
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/OtPayloadParser.cs
using System.Globalization;
using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

/// <summary>The gateway's per-leaf JSON envelope (docs/ot-data-integration/09 §3).</summary>
public sealed record OtLoopPayload(
    double? NumericValue, string? RawValue, string? Unit, string Quality, long TsMs,
    string? Source, long Seq, string? Device, string? Area, string? Line, string? Site,
    string? ProcessUnit, string? Equipment, string? Item);

public static class DlqReasons
{
    public const string MalformedJson = "MALFORMED_JSON";
    public const string MissingField = "MISSING_FIELD";
    public const string BadTimestamp = "BAD_TIMESTAMP";
    public const string FutureTimestamp = "FUTURE_TIMESTAMP";
    public const string TopicShapeMismatch = "TOPIC_SHAPE_MISMATCH";
    public const string LoopIdentityMismatch = "LOOP_IDENTITY_MISMATCH";
    public const string ParameterMismatch = "PARAMETER_MISMATCH";
    public const string LoopNotRegistered = "LOOP_NOT_REGISTERED";
    public const string UnknownParameter = "UNKNOWN_PARAMETER";
}

public static class OtPayloadParser
{
    /// <summary>Returns null with a DlqReasons code when the message must be dead-lettered.</summary>
    public static OtLoopPayload? Parse(byte[] body, long nowMs, int futureSkewMaxSeconds,
        out string? reason, out string? detail)
    {
        reason = null; detail = null;
        JsonDocument doc;
        try { doc = JsonDocument.Parse(body); }
        catch (JsonException ex) { reason = DlqReasons.MalformedJson; detail = ex.Message; return null; }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            { reason = DlqReasons.MalformedJson; detail = "payload is not a JSON object"; return null; }

            if (!root.TryGetProperty("value", out var valueEl))
            { reason = DlqReasons.MissingField; detail = "value"; return null; }
            double? numeric = valueEl.ValueKind switch
            {
                JsonValueKind.Number => valueEl.GetDouble(),
                JsonValueKind.True => 1.0,
                JsonValueKind.False => 0.0,
                JsonValueKind.String when double.TryParse(valueEl.GetString(),
                    NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
                _ => null,
            };
            var raw = valueEl.ValueKind == JsonValueKind.String ? valueEl.GetString() : valueEl.GetRawText();

            if (!root.TryGetProperty("ts", out var tsEl))
            { reason = DlqReasons.MissingField; detail = "ts"; return null; }
            long tsMs;
            if (tsEl.ValueKind == JsonValueKind.Number && tsEl.TryGetInt64(out var epoch)) tsMs = epoch;
            else if (tsEl.ValueKind == JsonValueKind.String &&
                     DateTimeOffset.TryParse(tsEl.GetString(), CultureInfo.InvariantCulture,
                         DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dto))
                tsMs = dto.ToUnixTimeMilliseconds();
            else { reason = DlqReasons.BadTimestamp; detail = tsEl.GetRawText(); return null; }

            if (tsMs > nowMs + futureSkewMaxSeconds * 1000L)
            { reason = DlqReasons.FutureTimestamp; detail = $"ts {tsMs} beyond +{futureSkewMaxSeconds}s of {nowMs}"; return null; }

            static string? Str(JsonElement r, string name) =>
                r.TryGetProperty(name, out var e) && e.ValueKind == JsonValueKind.String ? e.GetString() : null;

            var seq = root.TryGetProperty("seq", out var seqEl) &&
                      seqEl.ValueKind == JsonValueKind.Number && seqEl.TryGetInt64(out var sq) ? sq : 0;

            return new OtLoopPayload(numeric, raw, Str(root, "unit"), Str(root, "quality") ?? "GOOD",
                tsMs, Str(root, "source"), seq, Str(root, "device"), Str(root, "area"), Str(root, "line"),
                Str(root, "site"), Str(root, "process_unit"), Str(root, "equipment"), Str(root, "item"));
        }
    }
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): OT payload parser + DLQ reason catalog`

---

### Task 5: Topic↔payload consistency validator

**Files:**
- Create: `src/services/ingestion-service/Pipeline/OtConsistencyValidator.cs`
- Test: `tests/ingestion-service.Tests/OtConsistencyValidatorTests.cs`

**Interfaces:**
- Produces: `OtConsistencyValidator.Validate(OtTopicIdentity topic, OtLoopPayload payload, out string? reason, out string? detail): bool`.

- [ ] **Step 1: Failing tests**

```csharp
// tests/ingestion-service.Tests/OtConsistencyValidatorTests.cs
using Traverse.IngestionService.Pipeline;
using Xunit;

public class OtConsistencyValidatorTests
{
    private static readonly OtTopicIdentity Topic = new("HDPE", "FCS0101", "Flow", "FIC10302", "PV");

    private static OtLoopPayload Payload(string? device = "FIC10302", string? equipment = "FIC10302",
        string? area = "FCS0101", string? site = "HDPE", string? item = "PV") =>
        new(1.0, "1.0", "", "GOOD", 1, "opc_ua", 0, device, area, "Flow", site, "Flow", equipment, item);

    [Fact]
    public void Matching_identity_passes() =>
        Assert.True(OtConsistencyValidator.Validate(Topic, Payload(), out _, out _));

    [Fact]
    public void Case_differences_pass() =>
        Assert.True(OtConsistencyValidator.Validate(Topic, Payload(device: "fic10302", site: "hdpe"), out _, out _));

    [Fact]
    public void Absent_payload_identity_passes_topic_is_authoritative() =>
        Assert.True(OtConsistencyValidator.Validate(Topic, Payload(device: null, equipment: null, area: null, site: null, item: null), out _, out _));

    [Theory]
    [InlineData("FIC10303", "FIC10302", "PV", "LOOP_IDENTITY_MISMATCH")] // device contradicts
    [InlineData("FIC10302", "FIC10303", "PV", "LOOP_IDENTITY_MISMATCH")] // equipment contradicts
    [InlineData("FIC10302", "FIC10302", "SP", "PARAMETER_MISMATCH")]     // item contradicts
    public void Contradictions_fail_with_reason(string device, string equipment, string item, string expected)
    {
        Assert.False(OtConsistencyValidator.Validate(Topic, Payload(device: device, equipment: equipment, item: item), out var reason, out var detail));
        Assert.Equal(expected, reason);
        Assert.NotNull(detail);
    }

    [Fact]
    public void Wrong_site_or_fcs_fails()
    {
        Assert.False(OtConsistencyValidator.Validate(Topic, Payload(site: "LDPE"), out var r1, out _));
        Assert.Equal(DlqReasons.LoopIdentityMismatch, r1);
        Assert.False(OtConsistencyValidator.Validate(Topic, Payload(area: "FCS0102"), out var r2, out _));
        Assert.Equal(DlqReasons.LoopIdentityMismatch, r2);
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/OtConsistencyValidator.cs
namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// Identity cross-check (assessment §5): topic is the routing identity; the payload's
/// duplicated identity fields must not CONTRADICT it. Absent payload fields pass.
/// Class/line/process_unit are deliberately NOT hard-checked (semantics unproven) —
/// the subscriber counts disagreements as a warning metric instead.
/// </summary>
public static class OtConsistencyValidator
{
    public static bool Validate(OtTopicIdentity topic, OtLoopPayload payload, out string? reason, out string? detail)
    {
        reason = null; detail = null;
        if (Contradicts(topic.Site, payload.Site))
            return Fail(DlqReasons.LoopIdentityMismatch, $"topic site '{topic.Site}' vs payload site '{payload.Site}'", out reason, out detail);
        if (Contradicts(topic.Fcs, payload.Area))
            return Fail(DlqReasons.LoopIdentityMismatch, $"topic fcs '{topic.Fcs}' vs payload area '{payload.Area}'", out reason, out detail);
        if (Contradicts(topic.LoopTag, payload.Device))
            return Fail(DlqReasons.LoopIdentityMismatch, $"topic loop '{topic.LoopTag}' vs payload device '{payload.Device}'", out reason, out detail);
        if (Contradicts(topic.LoopTag, payload.Equipment))
            return Fail(DlqReasons.LoopIdentityMismatch, $"topic loop '{topic.LoopTag}' vs payload equipment '{payload.Equipment}'", out reason, out detail);
        if (Contradicts(topic.Parameter, payload.Item))
            return Fail(DlqReasons.ParameterMismatch, $"topic param '{topic.Parameter}' vs payload item '{payload.Item}'", out reason, out detail);
        return true;
    }

    private static bool Contradicts(string topicValue, string? payloadValue) =>
        !string.IsNullOrEmpty(payloadValue) &&
        !string.Equals(topicValue, payloadValue, StringComparison.OrdinalIgnoreCase);

    private static bool Fail(string r, string d, out string? reason, out string? detail)
    { reason = r; detail = d; return false; }
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): topic/payload identity validator`

---

### Task 6: Parameter mapper (roles + numeric MODE)

**Files:**
- Create: `src/services/ingestion-service/Pipeline/LoopParameterMapper.cs`
- Test: `tests/ingestion-service.Tests/LoopParameterMapperTests.cs`

**Interfaces:**
- Produces: `record MappedParameter(string Role, bool IsTupleMember, double? NumericValue, string? ModeString)`; `LoopParameterMapper.TryMap(string parameter, OtLoopPayload payload, LoopIngestSettings cfg, out MappedParameter? mapped, out string? reason): bool`.

- [ ] **Step 1: Failing tests**

```csharp
// tests/ingestion-service.Tests/LoopParameterMapperTests.cs
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

public class LoopParameterMapperTests
{
    private static LoopIngestSettings Cfg(Dictionary<string, string>? modeMap = null) =>
        new LoopIngestConfig { ModeValueMap = modeMap }.Resolve();

    private static OtLoopPayload Num(double v, string? raw = null) =>
        new(v, raw ?? v.ToString(System.Globalization.CultureInfo.InvariantCulture),
            "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);

    [Theory]
    [InlineData("PV", "pv", true)]
    [InlineData("SP", "sp", true)]
    [InlineData("OP", "op", true)]
    [InlineData("P", "p", false)]
    [InlineData("GW", "gw", false)]
    public void Maps_default_roles(string param, string role, bool member)
    {
        Assert.True(LoopParameterMapper.TryMap(param, Num(1.5), Cfg(), out var m, out _));
        Assert.Equal(role, m!.Role);
        Assert.Equal(member, m.IsTupleMember);
        Assert.Equal(1.5, m.NumericValue);
    }

    [Fact]
    public void Mode_numeric_is_translated_via_map()
    {
        Assert.True(LoopParameterMapper.TryMap("MODE", Num(4.0, "4.0"), Cfg(new() { ["4"] = "AUT" }), out var m, out _));
        Assert.Equal("AUT", m!.ModeString);
        Assert.True(m.IsTupleMember);
    }

    [Fact]
    public void Mode_unmapped_passes_raw_key_through()
    {
        Assert.True(LoopParameterMapper.TryMap("MODE", Num(7.0, "7.0"), Cfg(), out var m, out _));
        Assert.Equal("7", m!.ModeString); // visible degradation, no silent guessing
    }

    [Fact]
    public void Mode_string_values_pass_through_map()
    {
        var payload = new OtLoopPayload(null, "CAS", "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);
        Assert.True(LoopParameterMapper.TryMap("MODE", payload, Cfg(), out var m, out _));
        Assert.Equal("CAS", m!.ModeString);
    }

    [Fact]
    public void Unknown_parameter_is_rejected()
    {
        Assert.False(LoopParameterMapper.TryMap("XYZ", Num(1), Cfg(), out _, out var reason));
        Assert.Equal(DlqReasons.UnknownParameter, reason);
    }

    [Fact]
    public void Non_numeric_value_on_numeric_role_is_rejected()
    {
        var payload = new OtLoopPayload(null, "banana", "", "GOOD", 1, null, 0, null, null, null, null, null, null, null);
        Assert.False(LoopParameterMapper.TryMap("PV", payload, Cfg(), out _, out var reason));
        Assert.Equal(DlqReasons.MissingField, reason);
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/LoopParameterMapper.cs
using System.Globalization;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Pipeline;

public sealed record MappedParameter(string Role, bool IsTupleMember, double? NumericValue, string? ModeString);

/// <summary>
/// Source parameter (PV/SP/OP/MODE/P/I/D/GW/…) → canonical role via the per-config
/// param_roles map. pv/sp/op/vp/mode are tuple members; any other mapped role rides
/// the tuple as a numeric extension field. MODE is numeric on this gateway (e.g. 4.0)
/// and translated via mode_value_map; unmapped values pass through raw — visible, not guessed.
/// </summary>
public static class LoopParameterMapper
{
    private static readonly HashSet<string> TupleMembers = new(StringComparer.Ordinal)
    { "pv", "sp", "op", "vp", "mode" };

    public static bool TryMap(string parameter, OtLoopPayload payload, LoopIngestSettings cfg,
        out MappedParameter? mapped, out string? reason)
    {
        mapped = null; reason = null;
        if (!cfg.ParamRoles.TryGetValue(parameter, out var configuredRole))
        { reason = DlqReasons.UnknownParameter; return false; }
        var role = configuredRole.Trim().ToLowerInvariant();

        if (role == "mode")
        {
            mapped = new MappedParameter(role, IsTupleMember: true, payload.NumericValue,
                ResolveMode(payload, cfg.ModeValueMap));
            return true;
        }
        if (payload.NumericValue is null)
        { reason = DlqReasons.MissingField; return false; }
        mapped = new MappedParameter(role, TupleMembers.Contains(role), payload.NumericValue, null);
        return true;
    }

    public static string ResolveMode(OtLoopPayload payload, IReadOnlyDictionary<string, string> map)
    {
        string key;
        if (payload.NumericValue is { } n && Math.Abs(n - Math.Round(n)) < 1e-9)
            key = ((long)Math.Round(n)).ToString(CultureInfo.InvariantCulture);
        else
            key = (payload.RawValue ?? "").Trim().Trim('"');
        return map.TryGetValue(key, out var mode) ? mode : key;
    }
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): parameter role mapper with numeric MODE translation`

---

### Task 7: Loop registry client + cache

**Files:**
- Create: `src/services/ingestion-service/Pipeline/LoopRegistryCache.cs`
- Test: `tests/ingestion-service.Tests/LoopRegistryCacheTests.cs`

**Interfaces:**
- Consumes: cplm-api `GET /api/v1/cpm/loops` with header `X-Service-Key` (cplm-api's internal principal already holds `analytics.view` — `infra/docker/docker-compose.yml:1350`).
- Produces: `record RegistryLoop(string LoopId, string? AssetUuid, string Site, string? Area, string? Unit, string LoopType, bool IsActive)`; `CplmRegistryClient.FetchLoopsAsync(CancellationToken)`; `LoopRegistryCache.TryResolve(string loopTag, out RegistryLoop loop): bool` (case-insensitive, active-only), `RefreshAsync(CancellationToken): Task<bool>`, `Count`, `LastRefreshed`.

**IMPORTANT precheck:** read `src/services/cplm-api/Controllers/CpmLoopsController.cs:44-59` and the DTO serialization before implementing — confirm whether `GET /cpm/loops` returns a bare JSON array of `CpmLoopDto` (camelCase: `loopId`, `assetId`, `site`, `area`, `unit`, `loopType`, `isActive`) or a wrapper object, and adjust `ParseLoops` accordingly. The test pins the shape you confirm.

- [ ] **Step 1: Failing tests** (parse + cache logic; HTTP faked)

```csharp
// tests/ingestion-service.Tests/LoopRegistryCacheTests.cs
using Traverse.IngestionService.Pipeline;
using Xunit;

public class LoopRegistryCacheTests
{
    private const string LoopsJson = """
        [
          {"loopId":"FIC10302","assetId":"11111111-2222-3333-4444-555555555555","site":"hdpe",
           "area":"section_100","unit":"u1001_polymerization_reactor_1","loopType":"FIC","isActive":true},
          {"loopId":"TIC10101","assetId":null,"site":"hdpe","area":null,"unit":null,"loopType":"TIC","isActive":true},
          {"loopId":"FIC90000","site":"hdpe","loopType":"FIC","isActive":false}
        ]
        """;

    [Fact]
    public void ParseLoops_reads_the_cplm_dto_shape()
    {
        var loops = CplmRegistryClient.ParseLoops(LoopsJson);
        Assert.Equal(3, loops.Count);
        var fic = loops[0];
        Assert.Equal("FIC10302", fic.LoopId);
        Assert.Equal("hdpe", fic.Site);
        Assert.Equal("section_100", fic.Area);
        Assert.Equal("FIC", fic.LoopType);
        Assert.True(fic.IsActive);
    }

    [Fact]
    public void Cache_resolves_case_insensitively_with_registry_casing()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.True(cache.TryResolve("fic10302", out var loop));
        Assert.Equal("FIC10302", loop.LoopId); // registry casing wins — the engine keys by exact string
    }

    [Fact]
    public void Inactive_loops_do_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC90000", out _));
    }

    [Fact]
    public void Unknown_loop_does_not_resolve()
    {
        var cache = new LoopRegistryCache(CplmRegistryClient.ParseLoops(LoopsJson));
        Assert.False(cache.TryResolve("FIC99999", out _));
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/LoopRegistryCache.cs
using System.Text.Json;

namespace Traverse.IngestionService.Pipeline;

public sealed record RegistryLoop(
    string LoopId, string? AssetUuid, string Site, string? Area, string? Unit,
    string LoopType, bool IsActive);

/// <summary>Pulls the CPM Loop Registry over REST. cplm-api's internal service principal
/// grants analytics.view, so the shared X-Service-Key authorizes the read.</summary>
public sealed class CplmRegistryClient
{
    private readonly HttpClient _http;

    public CplmRegistryClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _http.BaseAddress = new Uri(config["Services:CplmApi"] ?? "http://cplm-api:5000");
        _http.Timeout = TimeSpan.FromSeconds(15);
        var serviceKey = config["Auth:ServiceKey"];
        if (!string.IsNullOrEmpty(serviceKey))
            _http.DefaultRequestHeaders.Add("X-Service-Key", serviceKey);
    }

    public async Task<IReadOnlyList<RegistryLoop>> FetchLoopsAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("/api/v1/cpm/loops", ct);
        response.EnsureSuccessStatusCode();
        return ParseLoops(await response.Content.ReadAsStringAsync(ct));
    }

    /// <summary>Parses the CpmLoopDto list (camelCase). Kept static + public for tests.</summary>
    public static IReadOnlyList<RegistryLoop> ParseLoops(string json)
    {
        using var doc = JsonDocument.Parse(json);
        // NOTE: confirmed against CpmLoopsController — adjust here if the route wraps the array.
        var array = doc.RootElement.ValueKind == JsonValueKind.Array
            ? doc.RootElement
            : doc.RootElement.GetProperty("loops");
        var loops = new List<RegistryLoop>();
        foreach (var el in array.EnumerateArray())
        {
            var loopId = el.TryGetProperty("loopId", out var idEl) ? idEl.GetString() : null;
            if (string.IsNullOrWhiteSpace(loopId)) continue;
            static string? Str(JsonElement e, string name) =>
                e.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            loops.Add(new RegistryLoop(
                loopId!,
                Str(el, "assetId"),
                Str(el, "site") ?? "",
                Str(el, "area"),
                Str(el, "unit"),
                Str(el, "loopType") ?? "UNKNOWN",
                !el.TryGetProperty("isActive", out var ia) || ia.ValueKind != JsonValueKind.False));
        }
        return loops;
    }
}

/// <summary>
/// O(1) per-message resolver: case-insensitive loop_id → registry row, swapped
/// atomically on refresh. A refresh failure keeps the previous map (fail loud, not empty).
/// A newly activated loop starts flowing on the next refresh — no restart.
/// </summary>
public sealed class LoopRegistryCache
{
    private volatile Dictionary<string, RegistryLoop> _byId;
    public DateTimeOffset? LastRefreshed { get; private set; }
    public int Count => _byId.Count;

    public LoopRegistryCache() : this(Array.Empty<RegistryLoop>()) { }
    public LoopRegistryCache(IReadOnlyList<RegistryLoop> initial) =>
        _byId = Build(initial);

    public bool TryResolve(string loopTag, out RegistryLoop loop)
    {
        if (_byId.TryGetValue(loopTag, out var found) && found.IsActive) { loop = found; return true; }
        loop = default!;
        return false;
    }

    public async Task<bool> RefreshAsync(CplmRegistryClient client, ILogger logger, CancellationToken ct)
    {
        try
        {
            _byId = Build(await client.FetchLoopsAsync(ct));
            LastRefreshed = DateTimeOffset.UtcNow;
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("Loop registry refresh failed: {Message} — keeping previous map ({Count} loops)",
                ex.Message, Count);
            return false;
        }
    }

    private static Dictionary<string, RegistryLoop> Build(IReadOnlyList<RegistryLoop> loops) =>
        loops.GroupBy(l => l.LoopId, StringComparer.OrdinalIgnoreCase)
             .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): cplm-api registry client + case-insensitive loop cache`

---

### Task 8: Loop joiner + tuple serializer

**Files:**
- Create: `src/services/ingestion-service/Pipeline/LoopJoiner.cs`
- Test: `tests/ingestion-service.Tests/LoopJoinerTests.cs`

**Interfaces:**
- Consumes: `RegistryLoop` (Task 7), `MappedParameter` (Task 6), `OtLoopPayload` (Task 4), `LoopIngestSettings` (Task 1).
- Produces: `record LoopTuple(string LoopId, long EventTsMs, double Pv, double Sp, double Op, double? Vp, string Mode, string Quality, string LoopType, string Site, string? Area, string? Unit, string? AssetUuid, string? SourceFcs, IReadOnlyDictionary<string, double> Extras)` with `ToJson(): string`; `LoopJoiner.Accept(RegistryLoop, string sourceFcs, MappedParameter, OtLoopPayload, LoopIngestSettings, long nowMs)`, `Tick(long nowMs, LoopIngestSettings): List<LoopTuple>`, `ActiveLoops: int`.

- [ ] **Step 1: Failing tests** (fake clock — everything driven by `nowMs`)

```csharp
// tests/ingestion-service.Tests/LoopJoinerTests.cs
using System.Text.Json;
using Traverse.IngestionService.Models;
using Traverse.IngestionService.Pipeline;
using Xunit;

public class LoopJoinerTests
{
    private static readonly RegistryLoop Loop = new("FIC10302", "aaaa-bbbb", "hdpe",
        "section_100", "u1001_polymerization_reactor_1", "FIC", true);
    private static readonly LoopIngestSettings Cfg = new LoopIngestConfig().Resolve(); // grid 5 s, stale 30 s
    private const long T0 = 1_756_600_000_000; // multiple of 5000 for readable grid math

    private static OtLoopPayload P(long ts, string quality = "GOOD") =>
        new(0, "0", "", quality, ts, null, 0, null, null, null, null, null, null, null);

    private static void Feed(LoopJoiner j, string role, double value, long ts, string quality = "GOOD")
    {
        var member = role is "pv" or "sp" or "op" or "vp";
        j.Accept(Loop, "FCS0101",
            new MappedParameter(role, member, value, null),
            P(ts, quality) with { NumericValue = value }, Cfg, ts);
    }

    [Fact]
    public void No_tuple_until_pv_sp_op_all_seen()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 42.1, T0 + 100);
        Feed(j, "sp", 42.0, T0 + 200);
        Assert.Empty(j.Tick(T0 + 5_000, Cfg));           // op never arrived
        Feed(j, "op", 37.6, T0 + 5_100);
        var tuples = j.Tick(T0 + 10_000, Cfg);
        var t = Assert.Single(tuples);
        Assert.Equal("FIC10302", t.LoopId);
        Assert.Equal(42.1, t.Pv); Assert.Equal(42.0, t.Sp); Assert.Equal(37.6, t.Op);
        Assert.Equal("GOOD", t.Quality);
        Assert.Equal("FIC", t.LoopType);
        Assert.Equal("hdpe", t.Site);
    }

    [Fact]
    public void Forward_fills_between_updates_and_emits_every_grid_tick()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Single(j.Tick(T0 + 10_000, Cfg));         // no new data — forward-filled
        Assert.Empty(j.Tick(T0 + 10_500, Cfg));          // same grid slot — no duplicate
    }

    [Fact]
    public void Stale_required_member_makes_quality_BAD_but_still_emits()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        var late = T0 + 40_000;                          // > stale_after 30 s
        Feed(j, "pv", 1.5, late);                        // pv fresh again; sp/op stale
        var t = Assert.Single(j.Tick(late + 5_000, Cfg));
        Assert.Equal("BAD", t.Quality);
    }

    [Fact]
    public void Bad_member_quality_propagates()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0, "BAD"); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        Assert.Equal("BAD", Assert.Single(j.Tick(T0 + 5_000, Cfg)).Quality);
    }

    [Fact]
    public void Mode_and_extras_ride_the_tuple()
    {
        var j = new LoopJoiner();
        Feed(j, "pv", 1, T0); Feed(j, "sp", 2, T0); Feed(j, "op", 3, T0);
        j.Accept(Loop, "FCS0101", new MappedParameter("mode", true, 4.0, "AUT"), P(T0), Cfg, T0);
        Feed(j, "p", 300, T0); Feed(j, "gw", 0, T0);
        var t = Assert.Single(j.Tick(T0 + 5_000, Cfg));
        Assert.Equal("AUT", t.Mode);
        Assert.Equal(300, t.Extras["p"]);
        Assert.Equal(0, t.Extras["gw"]);
    }

    [Fact]
    public void ToJson_matches_the_wire_contract()
    {
        var tuple = new LoopTuple("FIC10302", T0, 42.1, 42.0, 37.6, null, "AUT", "GOOD", "FIC",
            "hdpe", "section_100", "u1001_polymerization_reactor_1", "aaaa-bbbb", "FCS0101",
            new Dictionary<string, double> { ["p"] = 300.0 });
        using var doc = JsonDocument.Parse(tuple.ToJson());
        var r = doc.RootElement;
        Assert.Equal("FIC10302", r.GetProperty("loop_id").GetString());
        Assert.Equal(T0, r.GetProperty("event_ts_ms").GetInt64());
        Assert.Equal(42.1, r.GetProperty("pv").GetDouble());
        Assert.Equal("AUT", r.GetProperty("mode").GetString());
        Assert.Equal("GOOD", r.GetProperty("quality").GetString());
        Assert.Equal("FIC", r.GetProperty("loop_type").GetString());
        Assert.Equal("FCS0101", r.GetProperty("source_fcs").GetString());
        Assert.Equal(300.0, r.GetProperty("p").GetDouble());
        Assert.False(r.TryGetProperty("vp", out _)); // null vp omitted, never 0
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/LoopJoiner.cs
using System.Buffers;
using System.Text;
using System.Text.Json;
using Traverse.IngestionService.Models;

namespace Traverse.IngestionService.Pipeline;

public sealed record LoopTuple(
    string LoopId, long EventTsMs, double Pv, double Sp, double Op, double? Vp,
    string Mode, string Quality, string LoopType,
    string Site, string? Area, string? Unit, string? AssetUuid, string? SourceFcs,
    IReadOnlyDictionary<string, double> Extras)
{
    /// <summary>Wire contract: docs/ot-data-integration/09 §4. Contract fields first,
    /// enrichment extensions after — consumers read named fields and ignore the rest.</summary>
    public string ToJson()
    {
        var buffer = new ArrayBufferWriter<byte>(256);
        using (var w = new Utf8JsonWriter(buffer))
        {
            w.WriteStartObject();
            w.WriteString("loop_id", LoopId);
            w.WriteNumber("event_ts_ms", EventTsMs);
            w.WriteNumber("pv", Pv);
            w.WriteNumber("sp", Sp);
            w.WriteNumber("op", Op);
            if (Vp is { } vp) w.WriteNumber("vp", vp);
            w.WriteString("mode", Mode);
            w.WriteString("quality", Quality);
            w.WriteString("loop_type", LoopType);
            if (!string.IsNullOrEmpty(Site)) w.WriteString("site", Site);
            if (!string.IsNullOrEmpty(Area)) w.WriteString("area", Area);
            if (!string.IsNullOrEmpty(Unit)) w.WriteString("unit", Unit);
            if (!string.IsNullOrEmpty(AssetUuid)) w.WriteString("asset_uuid", AssetUuid);
            if (!string.IsNullOrEmpty(SourceFcs)) w.WriteString("source_fcs", SourceFcs);
            foreach (var (key, value) in Extras) w.WriteNumber(key, value);
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(buffer.WrittenSpan);
    }
}

/// <summary>
/// The stateful heart (doc 03 §5.2): per-loop last-known values, a steady grid
/// (default 5 s), forward-fill for on-change signals. Never emits before pv/sp/op
/// have each been seen (the Flink engine silently discards incomplete tuples);
/// a stale/bad required member emits quality BAD instead of skipping the tick
/// (bad ticks feed exclusion gates — skipped ticks vanish). Deterministic: all
/// timing comes from the caller's nowMs, so tests use a fake clock.
/// </summary>
public sealed class LoopJoiner
{
    private sealed class Member { public double Value; public long TsMs; public bool Good; }

    private sealed class LoopState
    {
        public RegistryLoop Loop = default!;
        public string? SourceFcs;
        public readonly Dictionary<string, Member> Members = new(StringComparer.Ordinal); // pv/sp/op/vp
        public readonly Dictionary<string, Member> Extras = new(StringComparer.Ordinal);  // p/i/d/gw/…
        public string? Mode;
        public long NextTickMs;
    }

    private readonly Dictionary<string, LoopState> _loops = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();

    public int ActiveLoops { get { lock (_gate) return _loops.Count; } }

    public void Accept(RegistryLoop loop, string sourceFcs, MappedParameter mapped,
        OtLoopPayload payload, LoopIngestSettings cfg, long nowMs)
    {
        lock (_gate)
        {
            if (!_loops.TryGetValue(loop.LoopId, out var state))
                _loops[loop.LoopId] = state = new LoopState { NextTickMs = NextGridBoundary(nowMs, cfg.GridSeconds) };
            state.Loop = loop;
            state.SourceFcs = sourceFcs;

            if (mapped.Role == "mode") { state.Mode = mapped.ModeString; return; }

            var bucket = mapped.IsTupleMember ? state.Members : state.Extras;
            if (!bucket.TryGetValue(mapped.Role, out var member))
                bucket[mapped.Role] = member = new Member();
            member.Value = mapped.NumericValue!.Value;
            member.TsMs = payload.TsMs;
            member.Good = IsGood(payload.Quality);
        }
    }

    public List<LoopTuple> Tick(long nowMs, LoopIngestSettings cfg)
    {
        var output = new List<LoopTuple>();
        lock (_gate)
        {
            foreach (var state in _loops.Values)
            {
                if (nowMs < state.NextTickMs) continue;
                var tick = state.NextTickMs;
                state.NextTickMs = NextGridBoundary(nowMs, cfg.GridSeconds);

                if (!state.Members.TryGetValue("pv", out var pv) ||
                    !state.Members.TryGetValue("sp", out var sp) ||
                    !state.Members.TryGetValue("op", out var op))
                    continue; // incomplete — downstream would silently discard anyway

                var staleBefore = tick - cfg.StaleAfterSeconds * 1000L;
                var bad = !pv.Good || !sp.Good || !op.Good ||
                          pv.TsMs < staleBefore || sp.TsMs < staleBefore || op.TsMs < staleBefore;

                output.Add(new LoopTuple(
                    LoopId: state.Loop.LoopId,
                    EventTsMs: tick,
                    Pv: pv.Value, Sp: sp.Value, Op: op.Value,
                    Vp: state.Members.TryGetValue("vp", out var vp) ? vp.Value : null,
                    Mode: state.Mode ?? "UNKNOWN",
                    Quality: bad ? "BAD" : "GOOD",
                    LoopType: state.Loop.LoopType,
                    Site: state.Loop.Site, Area: state.Loop.Area, Unit: state.Loop.Unit,
                    AssetUuid: state.Loop.AssetUuid, SourceFcs: state.SourceFcs,
                    Extras: state.Extras.ToDictionary(kv => kv.Key, kv => kv.Value.Value, StringComparer.Ordinal)));
            }
        }
        return output;
    }

    internal static long NextGridBoundary(long nowMs, int gridSeconds)
    {
        var grid = gridSeconds * 1000L;
        return (nowMs / grid + 1) * grid;
    }

    private static bool IsGood(string quality) =>
        quality.StartsWith("g", StringComparison.OrdinalIgnoreCase) ||
        (int.TryParse(quality, out var q) && q >= 192);
}
```

- [ ] **Step 4: Run tests** → PASS (whole project green). **Step 5: Commit** — `feat(ingestion): per-loop grid joiner + tuple serializer`

---

### Task 9: Kafka producer + DLQ record

**Files:**
- Create: `src/services/ingestion-service/Pipeline/LoopSamplePipelineProducer.cs`
- Test: `tests/ingestion-service.Tests/DeadLetterRecordTests.cs`

**Interfaces:**
- Produces: `LoopSamplePipelineProducer` (`Enabled: bool`, `PublishTupleAsync(LoopTuple, CancellationToken)`, `PublishDeadLetterAsync(string key, DeadLetterRecord, CancellationToken)`, `IDisposable`); `record DeadLetterRecord(string Reason, Guid ConfigId, string MqttTopic, string Payload, long ReceivedAtMs, string? Detail)` with `ToJson()`.
- Config keys: `Kafka:BootstrapServers` (existing), `Kafka:LoopSamplesTopic` (default `traverse.cpa.loop.samples.v1`), `Kafka:OtDlqTopic` (default `traverse.ingestion.ot-dlq`).

- [ ] **Step 1: Failing test** (envelope only — delivery is E2E territory)

```csharp
// tests/ingestion-service.Tests/DeadLetterRecordTests.cs
using System.Text.Json;
using Traverse.IngestionService.Pipeline;
using Xunit;

public class DeadLetterRecordTests
{
    [Fact]
    public void Envelope_serializes_snake_case_with_raw_payload()
    {
        var id = Guid.NewGuid();
        var rec = new DeadLetterRecord("LOOP_NOT_REGISTERED", id,
            "OT/HDPE/FCS0101/Flow/FIC99999/PIDParams/PV", """{"value":1}""", 123L, "no registry row");
        using var doc = JsonDocument.Parse(rec.ToJson());
        var r = doc.RootElement;
        Assert.Equal("LOOP_NOT_REGISTERED", r.GetProperty("reason").GetString());
        Assert.Equal(id.ToString(), r.GetProperty("config_id").GetString());
        Assert.Equal("""{"value":1}""", r.GetProperty("payload").GetString());
        Assert.Equal(123L, r.GetProperty("received_at_ms").GetInt64());
        Assert.Equal("no registry row", r.GetProperty("detail").GetString());
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/LoopSamplePipelineProducer.cs
using System.Text.Json;
using Confluent.Kafka;

namespace Traverse.IngestionService.Pipeline;

public sealed record DeadLetterRecord(
    string Reason, Guid ConfigId, string MqttTopic, string Payload, long ReceivedAtMs, string? Detail)
{
    public string ToJson() => JsonSerializer.Serialize(new
    {
        reason = Reason,
        config_id = ConfigId,
        mqtt_topic = MqttTopic,
        payload = Payload,
        received_at_ms = ReceivedAtMs,
        detail = Detail,
    });
}

/// <summary>
/// Durable producer for the loop plane: acks=all + idempotence + lz4 (the profile the
/// platform's durable consumers use — AMS.Infrastructure KafkaConsumerService §507).
/// One producer instance serves tuples and dead letters; both topics are pre-created
/// (broker auto-create is off). Empty bootstrap = pipeline disabled (matches AuditEmitter).
/// </summary>
public sealed class LoopSamplePipelineProducer : IDisposable
{
    private readonly IProducer<string, string>? _producer;
    private readonly string _samplesTopic;
    private readonly string _dlqTopic;

    public LoopSamplePipelineProducer(IConfiguration config, ILogger<LoopSamplePipelineProducer> logger)
    {
        _samplesTopic = config["Kafka:LoopSamplesTopic"] ?? "traverse.cpa.loop.samples.v1";
        _dlqTopic = config["Kafka:OtDlqTopic"] ?? "traverse.ingestion.ot-dlq";
        var bootstrap = config["Kafka:BootstrapServers"];
        if (string.IsNullOrWhiteSpace(bootstrap))
        {
            logger.LogWarning("Kafka:BootstrapServers not set — loop-sample publishing disabled");
            return;
        }
        _producer = new ProducerBuilder<string, string>(new ProducerConfig
        {
            BootstrapServers = bootstrap,
            EnableIdempotence = true,
            Acks = Acks.All,
            MessageSendMaxRetries = 3,
            RetryBackoffMs = 1000,
            LingerMs = 5,
            CompressionType = CompressionType.Lz4,
        }).Build();
    }

    public bool Enabled => _producer is not null;

    /// <summary>Key = loop_id with registry casing — Flink keyBy and the 16-partition
    /// layout depend on it. Await the delivery report: the caller's retry loop is the
    /// backpressure (QoS-1 messages queue at the MQTT broker while we block).</summary>
    public Task PublishTupleAsync(LoopTuple tuple, CancellationToken ct) =>
        _producer!.ProduceAsync(_samplesTopic,
            new Message<string, string> { Key = tuple.LoopId, Value = tuple.ToJson() }, ct);

    public Task PublishDeadLetterAsync(string key, DeadLetterRecord record, CancellationToken ct) =>
        _producer!.ProduceAsync(_dlqTopic,
            new Message<string, string> { Key = key, Value = record.ToJson() }, ct);

    public void Dispose()
    {
        try { _producer?.Flush(TimeSpan.FromSeconds(5)); } catch { /* shutting down */ }
        _producer?.Dispose();
    }
}
```

- [ ] **Step 4: Run tests + build** → PASS. **Step 5: Commit** — `feat(ingestion): durable Kafka producer for tuples + OT dead letters`

---

### Task 10: Unknown-source inventory aggregator

**Files:**
- Create: `src/services/ingestion-service/Pipeline/UnknownSourceInventory.cs`
- Test: `tests/ingestion-service.Tests/UnknownSourceInventoryTests.cs`

**Interfaces:**
- Consumes: `UnknownSourceRepository` (Task 2).
- Produces: `UnknownSourceInventory.Record(Guid configId, string reason, string sourceKey, string topic, string payloadJson)`; `DrainPending(): IReadOnlyList<UnknownSourceRow>` (returns + clears); `FlushAsync(UnknownSourceRepository, ILogger, CancellationToken)`.

- [ ] **Step 1: Failing tests**

```csharp
// tests/ingestion-service.Tests/UnknownSourceInventoryTests.cs
using Traverse.IngestionService.Pipeline;
using Xunit;

public class UnknownSourceInventoryTests
{
    [Fact]
    public void Aggregates_counts_per_config_reason_source()
    {
        var inv = new UnknownSourceInventory();
        var cfg = Guid.NewGuid();
        for (var i = 0; i < 5; i++)
            inv.Record(cfg, "LOOP_NOT_REGISTERED", "HDPE|FCS0101|FIC99999", "OT/.../PV", """{"value":1}""");
        inv.Record(cfg, "UNKNOWN_PARAMETER", "FIC10302|XYZ", "OT/.../XYZ", """{"value":2}""");

        var rows = inv.DrainPending();
        Assert.Equal(2, rows.Count);
        var loops = rows.Single(r => r.Reason == "LOOP_NOT_REGISTERED");
        Assert.Equal(5, loops.MessageCount);
        Assert.Equal("HDPE|FCS0101|FIC99999", loops.SourceKey);
        Assert.Empty(inv.DrainPending()); // drained
    }

    [Fact]
    public void Truncates_oversized_source_keys_to_column_limit()
    {
        var inv = new UnknownSourceInventory();
        inv.Record(Guid.NewGuid(), "UNKNOWN_PARAMETER", new string('x', 400), "t", "{}");
        Assert.True(inv.DrainPending().Single().SourceKey.Length <= 256);
    }
}
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

```csharp
// src/services/ingestion-service/Pipeline/UnknownSourceInventory.cs
using System.Collections.Concurrent;
using Traverse.IngestionService.Services;

namespace Traverse.IngestionService.Pipeline;

/// <summary>
/// In-memory aggregation for parked messages — one counter per (config, reason,
/// source), flushed to ingestion.unknown_sources periodically. Never one DB write
/// per message: a firehose of unregistered loops must not melt Postgres.
/// </summary>
public sealed class UnknownSourceInventory
{
    private sealed record Key(Guid ConfigId, string Reason, string SourceKey);
    private sealed class Pending
    { public long Count; public string? LastTopic; public string? LastPayload; public DateTime LastSeen; }

    private readonly ConcurrentDictionary<Key, Pending> _pending = new();

    public void Record(Guid configId, string reason, string sourceKey, string topic, string payloadJson)
    {
        if (sourceKey.Length > 256) sourceKey = sourceKey[..256];
        var entry = _pending.GetOrAdd(new Key(configId, reason, sourceKey), _ => new Pending());
        lock (entry)
        {
            entry.Count++;
            entry.LastTopic = topic;
            entry.LastPayload = payloadJson;
            entry.LastSeen = DateTime.UtcNow;
        }
    }

    public IReadOnlyList<UnknownSourceRow> DrainPending()
    {
        var rows = new List<UnknownSourceRow>();
        foreach (var key in _pending.Keys.ToArray())
        {
            if (!_pending.TryRemove(key, out var entry)) continue;
            lock (entry)
            {
                rows.Add(new UnknownSourceRow(key.ConfigId, key.Reason, key.SourceKey,
                    entry.LastSeen, entry.LastSeen, entry.Count, entry.LastTopic, entry.LastPayload));
            }
        }
        return rows;
    }

    public async Task FlushAsync(UnknownSourceRepository repo, ILogger logger, CancellationToken ct)
    {
        var rows = DrainPending();
        if (rows.Count == 0) return;
        try { await repo.UpsertBatchAsync(rows, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning("unknown_sources flush failed ({Count} rows): {Message}", rows.Count, ex.Message);
            foreach (var row in rows) // put the counts back so nothing is lost
                Record(row.ConfigId, row.Reason, row.SourceKey, row.LastTopic ?? "", row.LastPayload ?? "{}");
        }
    }
}
```

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat(ingestion): aggregated unknown-source parking inventory`

---

### Task 11: Metrics, status registry, admin endpoints, health

**Files:**
- Modify: `src/services/ingestion-service/ingestion-service.csproj` (add `<PackageReference Include="prometheus-net.AspNetCore" Version="8.2.1" />`)
- Create: `src/services/ingestion-service/Pipeline/IngestionMetrics.cs`
- Create: `src/services/ingestion-service/Pipeline/PipelineEndpoints.cs`
- Modify: `src/services/ingestion-service/Program.cs` (health `subscriber` check + `MapMetrics` + `MapPipelineEndpoints` — wiring completed in Task 13)

**Interfaces:**
- Produces: `IngestionMetrics` static counters: `MessagesReceived(configName)`, `MessagesDeadLettered(configName, reason)`, `MessagesParked(configName, reason)`, `TuplesEmitted(configName)`, `KafkaPublishFailures(configName)`, `MqttReconnects(configName)`, `ClassMismatchWarnings(configName)`, `UnitMismatchWarnings(configName)`, gauge `JoinerActiveLoops(configName)`, histogram `SourceToIngestLatencyMs`; `class SubscriberStatus { Guid ConfigId; string Name; bool Connected; long Received; long Tuples; long DeadLettered; long Parked; int ActiveLoops; int RegistryLoops; DateTimeOffset? RegistryRefreshedAt; DateTimeOffset? LastMessageAt; }`; `SubscriberStatusRegistry` (thread-safe `Upsert/Remove/List`, `RequestReload(Guid)` + `TryConsumeReload(Guid)`).
- Endpoints (service-local, public via existing `/api/ingestion` gateway route): `GET /stats` (`ingestion.view`) → `SubscriberStatusRegistry.List()`; `GET /unknown-sources?configId=&limit=` (`ingestion.view`) → `UnknownSourceRepository.ListAsync` (limit default 200, max 1000); `POST /data-sources/{id:guid}/reload` (`ingestion.manage`) → `RequestReload(id)` + audit event `ingestion.datasource.reloaded`. `GET /metrics` → prometheus-net, anonymous.

- [ ] **Step 1:** Implement `IngestionMetrics` (thin static wrappers over `Prometheus.Metrics.CreateCounter/Gauge/Histogram`, metric names `ingestion_mqtt_messages_received_total{source}`, `ingestion_ot_deadletter_total{source,reason}`, `ingestion_ot_parked_total{source,reason}`, `ingestion_loop_tuples_emitted_total{source}`, `ingestion_kafka_publish_failures_total{source}`, `ingestion_mqtt_reconnects_total{source}`, `ingestion_class_mismatch_total{source}`, `ingestion_unit_mismatch_total{source}`, `ingestion_joiner_active_loops{source}`, `ingestion_source_latency_ms`). Labels are config names — bounded cardinality; never label by loop tag.
- [ ] **Step 2:** Implement `SubscriberStatusRegistry` + `PipelineEndpoints.MapPipelineEndpoints(WebApplication app)` with the three endpoints above, following the exact `RequireAuthorization(Perms.IngestionView/IngestionManage)` idiom already in `Program.cs`.
- [ ] **Step 3:** In `Program.cs`: register `SubscriberStatusRegistry`, `UnknownSourceRepository`, `UnknownSourceInventory` as singletons; call `app.MapMetrics();` and `app.MapPipelineEndpoints();`; replace the hardcoded `checks["subscriber"] = NotBuilt` with: `Running (N subscriber(s))` when the registry has entries, `NotConfigured — no active MQTT_LOOP_SAMPLES data source` when empty (healthy either way; a configured-but-disconnected subscriber reports `Degraded`).
- [ ] **Step 4: Verify** — `dotnet build` clean; `dotnet test` green; run locally and `curl http://localhost:5000/metrics` returns Prometheus text.
- [ ] **Step 5:** Check `infra/docker/prometheus.yml` (or wherever `scrape_configs` live — find with `Grep "scrape_configs" infra/`) and add a job `ingestion-service` targeting `ingestion-service:5000` with metrics path `/metrics`, mirroring an existing service job's shape.
- [ ] **Step 6: Commit** — `feat(ingestion): metrics, subscriber status, stats/unknown-sources/reload endpoints`

---

### Task 12: Shared MQTT connect-options factory (refactor, behavior-preserving)

**Files:**
- Create: `src/services/ingestion-service/Services/MqttClientOptionsFactory.cs`
- Modify: `src/services/ingestion-service/Services/MqttConnectionTester.cs`

**Interfaces:**
- Produces: `MqttClientOptionsFactory.TryBuild(DataSourceRow row, string password, string clientId, bool cleanSession, uint sessionExpirySeconds, TimeSpan timeout, out MqttClientOptions? options, out string? error): bool` — everything from the current tester's builder logic (URL parse, port defaulting, credentials, MQTT v5, TLS: CA PEM/path, servername, insecure-skip-verify) moved verbatim; keepalive from `profile_config.mqtt.keepalive_seconds` (default 60).

- [ ] **Step 1:** Extract the option-building + `TryLoadCaCertificates` + `ValidateBrokerCertificate` code from `MqttConnectionTester.TestAsync` into the factory, parameterizing exactly: client id, clean session, session expiry (`builder.WithSessionExpiryInterval(...)` only when cleanSession is false), timeout.
- [ ] **Step 2:** Rewrite `MqttConnectionTester.TestAsync` to call `MqttClientOptionsFactory.TryBuild(row, password, $"test-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", cleanSession: true, sessionExpirySeconds: 0, timeout, ...)` — the two-client-identity INVARIANT is preserved (throwaway id, clean session, no reconnect).
- [ ] **Step 3: Verify** — `dotnet test tests/ingestion-service.Tests` green (existing `ConfigMechanismTests` cover the tester paths); `dotnet build` clean.
- [ ] **Step 4: Commit** — `refactor(ingestion): shared MQTT client options factory for tester + subscriber`

---

### Task 13: Subscriber + host service + Program wiring

**Files:**
- Create: `src/services/ingestion-service/Pipeline/OtLoopSubscriber.cs`
- Create: `src/services/ingestion-service/Pipeline/OtIngestionHostService.cs`
- Modify: `src/services/ingestion-service/Program.cs` (DI + hosted service)
- Modify: `src/services/ingestion-service/appsettings.json` (add `"Services": { "CplmApi": "" }`, `"Kafka": { "LoopSamplesTopic": "", "OtDlqTopic": "" }` defaults-empty pattern)

**Interfaces:**
- Consumes: everything from Tasks 1–12. `DataSourceRepository.ListAsync(activeOnly: true)` (existing), `CredentialCipher.Decrypt` (existing), `DataSourceDto.DeriveClientId` (existing).
- Produces: a running pipeline; `data_source_configs.last_data_received` updated (throttled ≥30 s apart) via a new `DataSourceRepository.TouchLastDataReceivedAsync(Guid, CancellationToken)` (single UPDATE, add to the repository).

**`OtLoopSubscriber` responsibilities (one instance per active `MQTT_LOOP_SAMPLES` config; keep ≤ ~350 lines):**

1. **Connect:** MQTTnet **managed client** (`MqttFactory().CreateManagedMqttClient()`), options from `MqttClientOptionsFactory.TryBuild(row, password, DataSourceDto.DeriveClientId(row.ConfigId, mqtt), cleanSession: mqtt?.CleanSession ?? false, sessionExpirySeconds: (uint)(mqtt?.SessionExpirySeconds ?? 86400), timeout)`, wrapped in `ManagedMqttClientOptionsBuilder` with `WithAutoReconnectDelay(TimeSpan.FromSeconds(5))`. Count reconnects via the client's `ConnectedAsync`/`DisconnectedAsync` events → `IngestionMetrics.MqttReconnects` + `SubscriberStatus.Connected`.
2. **Subscribe:** every filter in `profile_config.mqtt.topics` at QoS `mqtt?.Qos ?? 1`.
3. **Backpressure:** `Channel.CreateBounded<(string Topic, byte[] Payload)>(new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.Wait })`; the `ApplicationMessageReceivedAsync` handler `await`s `WriteAsync` — a full channel slows MQTT consumption; QoS-1 messages queue at the broker.
4. **Per-message pipeline** (single consumer task draining the channel):

```csharp
IngestionMetrics.MessagesReceived(name);
status.LastMessageAt = DateTimeOffset.UtcNow;
var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

if (!OtTopicParser.TryParse(settings.TopicTemplate, topic, out var id, out var terr))
{ await DeadLetterAsync(DlqReasons.TopicShapeMismatch, topic, body, terr); continue; }

var payload = OtPayloadParser.Parse(body, nowMs, settings.FutureSkewMaxSeconds, out var reason, out var detail);
if (payload is null)
{ await DeadLetterAsync(reason!, topic, body, detail); continue; }

if (!OtConsistencyValidator.Validate(id!, payload, out reason, out detail))
{ await DeadLetterAsync(reason!, topic, body, detail); continue; }

// warn-only class check: topic class vs payload.line/process_unit
if (!string.IsNullOrEmpty(id!.ProcessClass) &&
    (Contradicts(id.ProcessClass, payload.Line) || Contradicts(id.ProcessClass, payload.ProcessUnit)))
    IngestionMetrics.ClassMismatchWarnings(name);

if (!_registry.TryResolve(id.LoopTag, out var loop))
{
    var key = $"{id.Site}|{id.Fcs}|{id.LoopTag}";
    _inventory.Record(configId, DlqReasons.LoopNotRegistered, key, topic, RawJson(body));
    IngestionMetrics.MessagesParked(name, DlqReasons.LoopNotRegistered);
    await DeadLetterAsync(DlqReasons.LoopNotRegistered, topic, body, null, key);
    continue;
}

if (!LoopParameterMapper.TryMap(id.Parameter, payload, settings, out var mapped, out reason))
{
    var key = $"{loop.LoopId}|{id.Parameter}";
    _inventory.Record(configId, reason!, key, topic, RawJson(body));
    IngestionMetrics.MessagesParked(name, reason!);
    await DeadLetterAsync(reason!, topic, body, $"parameter '{id.Parameter}'", key);
    continue;
}

IngestionMetrics.SourceLatency(nowMs - payload.TsMs);
_joiner.Accept(loop, id.Fcs, mapped!, payload, settings, nowMs);
TouchLastDataReceivedThrottled();
```

5. **DLQ publishing:** `DeadLetterAsync` builds `DeadLetterRecord` and calls `producer.PublishDeadLetterAsync(key ?? topic, record, ct)`; a DLQ publish failure is logged (rate-limited) and counted — it must NOT halt the pipeline. Every dead letter increments `IngestionMetrics.MessagesDeadLettered(name, reason)`. Log lines are rate-limited: at most one log per reason per 30 s, always with the counter carrying the truth.
6. **Grid loop:** `PeriodicTimer(TimeSpan.FromSeconds(1))`; each tick: `foreach tuple in _joiner.Tick(nowMs, settings)` → `producer.PublishTupleAsync` inside a retry loop (`catch` → `IngestionMetrics.KafkaPublishFailures(name)`, log, `Task.Delay(2s)`, retry same tuple until canceled — this stall is the designed backpressure). Update `status.Tuples`, `IngestionMetrics.TuplesEmitted`, `JoinerActiveLoops` gauge.
7. **Registry refresh loop:** `PeriodicTimer(settings.RegistryRefreshSeconds)` → `_registry.RefreshAsync(client, logger, ct)`; also refresh once at startup before subscribing (a failed initial refresh still starts the subscriber — everything parks until the first success, visibly).
8. **Inventory flush loop:** `PeriodicTimer(10 s)` → `_inventory.FlushAsync(repo, logger, ct)`.
9. **Shutdown:** stop timers, `StopAsync` the managed client, drain the channel (bounded wait 5 s), final inventory flush, dispose.

**`OtIngestionHostService : BackgroundService`:**

- On start + every 30 s: `repo.ListAsync(activeOnly: true)` filtered to `ProfileType == "MQTT_LOOP_SAMPLES"`; diff against running subscribers by `(ConfigId, Version)`: start new, stop removed/deactivated, restart version-changed; also restart any config with a pending `SubscriberStatusRegistry.TryConsumeReload(configId)`.
- Decrypt passwords via `CredentialCipher` inside this service only; a decrypt failure logs + marks the status `Connected=false` with the error — never crashes the host.
- Other profile types on active configs: log once — `profile X has no subscriber pipeline yet`.
- Registers/removes `SubscriberStatus` entries in `SubscriberStatusRegistry`.

**Program.cs wiring:** `builder.Services.AddHttpClient<CplmRegistryClient>();` + singletons `LoopSamplePipelineProducer`, `UnknownSourceInventory`, `UnknownSourceRepository`, `SubscriberStatusRegistry`; `builder.Services.AddHostedService<OtIngestionHostService>();`. Keep `Program.cs` under 500 lines — if the additions push past, move `SelfHeal` into its own file `Services/SelfHeal.cs` in the same commit.

- [ ] **Step 1:** Implement `OtLoopSubscriber` per the responsibilities above.
- [ ] **Step 2:** Implement `OtIngestionHostService` + repository `TouchLastDataReceivedAsync` + Program wiring + appsettings keys.
- [ ] **Step 3: Verify** — `dotnet build` clean; `dotnet test` green; `dotnet run` with no active configs logs a quiet start and `/health` shows `subscriber: NotConfigured`.
- [ ] **Step 4: Commit** — `feat(ingestion): OT MQTT subscriber pipeline (phase 2)`

---

### Task 14: Infrastructure provisioning

**Files:**
- Modify: `scripts/kafka-reset-lab-topics.ps1` (the `$ensureTopics` block, ~line 69)
- Modify: `migration/kafka/topics.txt`
- Modify: `infra/docker/docker-compose.yml` (ingestion-service env, ~line 973)
- Modify: `src/services/ingestion-service/Services/ProfileRegistry.cs` (MQTT_LOOP_SAMPLES entry)

- [ ] **Step 1:** Add `traverse.ingestion.ot-dlq` to `$ensureTopics` in `kafka-reset-lab-topics.ps1`, mirroring the `traverse.alarm.raw-alarms-dlq` line's exact format (2 partitions, `cleanup.policy=delete`, `retention.ms=604800000`); add the matching line to `migration/kafka/topics.txt` (RF/min-ISR per that file's convention).
- [ ] **Step 2:** Compose env for `traverse-ingestion-service` — add:

```yaml
      Services__CplmApi: http://cplm-api:5000
      Kafka__LoopSamplesTopic: traverse.cpa.loop.samples.v1
      Kafka__OtDlqTopic: traverse.ingestion.ot-dlq
```

and update the stale comment `# No internal X-Service-Key callers...` to note the service now *sends* the key to cplm-api (registry sync). The Kafka bootstrap + Auth__ServiceKey lines already exist — do not duplicate.
- [ ] **Step 3:** Update the `MQTT_LOOP_SAMPLES` profile entry: `DefaultTopics: new[] { "OT/+/+/+/+/PIDParams/+" }` and extend the description with one sentence: "Per-parameter feed (PV/SP/OP/MODE + tuning); joined onto a per-loop grid by the subscriber."
- [ ] **Step 4: Verify** — `pwsh -File scripts/kafka-reset-lab-topics.ps1` against the lab creates the DLQ topic (or lists it as existing); `docker compose config` parses; `dotnet build` + `dotnet test` green.
- [ ] **Step 5: Commit** — `chore(ingestion): provision ot-dlq topic + compose env for loop pipeline`

---

### Task 15: Integration test against a live broker

**Files:**
- Create: `tests/ingestion-service.Tests/OtSubscriberIntegrationTests.cs`

**Interfaces:** Consumes the compose `mosquitto-test` broker (`localhost:1884`, user `ams_ingest`/`ams-ingest-test`) — trait-gated so CI without the broker skips.

- [ ] **Step 1:** Write the test: `[Trait("Category", "Integration")]`; skip (via `Skip` on a runtime check helper or `SkippableFact` pattern already used in the test project — check `ConfigMechanismTests.cs` for the house idiom) when TCP connect to `localhost:1884` fails. The test wires a real `OtLoopSubscriber` with: an in-memory config row (broker `mqtt://localhost:1884`, topic filter `OT/+/+/+/+/PIDParams/+`), a `LoopRegistryCache` pre-seeded with one `RegistryLoop("FIC10302", null, "hdpe", "section_100", "u1001_polymerization_reactor_1", "FIC", true)` (add an internal test hook: `LoopRegistryCache(IReadOnlyList<RegistryLoop>)` constructor from Task 7 already provides this), and a **fake producer** (extract `ILoopSampleSink { Task PublishTupleAsync(LoopTuple, CancellationToken); Task PublishDeadLetterAsync(string, DeadLetterRecord, CancellationToken); }` implemented by `LoopSamplePipelineProducer` and by a recording fake — do this small refactor first). Publish PV/SP/OP/MODE for FIC10302 + PV for FIC99999 with a raw `MQTTnet` client, wait ≤15 s, assert: ≥1 tuple captured with `LoopId == "FIC10302"`, quality GOOD; ≥1 dead letter with reason `LOOP_NOT_REGISTERED`.
- [ ] **Step 2:** Run: `docker compose -f infra/docker/docker-compose.yml --profile mqtt-test up -d mosquitto-test` then `dotnet test tests/ingestion-service.Tests --filter "Category=Integration"` → PASS; without the broker → SKIPPED.
- [ ] **Step 3: Commit** — `test(ingestion): subscriber integration test vs mosquitto-test`

---

### Task 16: OT gateway lab simulator

**Files:**
- Create: `ams-sims/sim_ot_gateway_mqtt.py`

**Interfaces:** Publishes the exact production topic + payload shape; used by Task 17's E2E and by manual lab runs. Requires `paho-mqtt` (already used by `ams-sims` — verify with `Grep "import paho" ams-sims/` and match the import style).

- [ ] **Step 1:** Write the simulator:

```python
#!/usr/bin/env python3
"""OT gateway stand-in: publishes the real HDPE hierarchy to the lab MQTT broker.

Topic:   OT/HDPE/<FCS>/<class>/<loop>/PIDParams/<PARAM>   (8 params per loop)
Payload: the exact envelope observed on the production gateway (docs/ot-data-integration/08 §1.3).

Default broker is the compose mosquitto-test service:
    docker compose -f infra/docker/docker-compose.yml --profile mqtt-test up -d mosquitto-test
    python ams-sims/sim_ot_gateway_mqtt.py --minutes 30
"""
import argparse
import json
import math
import os
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

# The lab plant: 4 registered pilot loops + one deliberately UNREGISTERED loop
# (FIC99999) so the E2E can prove parking/DLQ instead of silent loss.
LOOPS = [
    # (fcs,       process_class, loop_tag,   base_pv, sp)
    ("FCS0101", "Flow",        "FIC10302", 60.0, 63.0),
    ("FCS0101", "Flow",        "FIC10405", 40.0, 41.0),
    ("FCS0101", "Pressure",    "PIC10201", 12.0, 12.5),
    ("FCS0101", "Temperature", "TIC10101", 180.0, 182.0),
    ("FCS0101", "Flow",        "FIC99999", 10.0, 10.0),
]
TUNING = {"P": (300.0, "%"), "I": (240.0, "s"), "D": (0.0, "s"), "GW": (0.0, "%")}


def envelope(fcs, cls, loop, item, value, unit):
    return json.dumps({
        "value": value, "unit": unit, "quality": "GOOD",
        "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "source": "opc_ua", "seq": 0,
        "device": loop, "area": fcs, "line": cls, "enterprise": "",
        "site": "HDPE", "process_unit": cls, "equipment": loop, "item": item,
    })


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", default=os.environ.get("SIM_OT_MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIM_OT_MQTT_PORT", "1884")))
    ap.add_argument("--username", default=os.environ.get("SIM_OT_MQTT_USERNAME", "ams_ingest"))
    ap.add_argument("--password", default=os.environ.get("SIM_OT_MQTT_PASSWORD", "ams-ingest-test"))
    ap.add_argument("--interval", type=float, default=1.0, help="seconds between fast-param publishes")
    ap.add_argument("--minutes", type=float, default=0.0, help="stop after N minutes (0 = forever)")
    args = ap.parse_args()

    client = mqtt.Client(client_id="sim-ot-gateway")
    client.username_pw_set(args.username, args.password)
    client.connect(args.host, args.port, keepalive=30)
    client.loop_start()

    start = time.time()
    published = 0
    last_tuning = -999.0
    try:
        while args.minutes <= 0 or time.time() - start < args.minutes * 60:
            t = time.time() - start
            for fcs, cls, loop, base, sp in LOOPS:
                pv = base + 2.0 * math.sin(t / 30.0) + random.gauss(0, 0.2)
                op = 30.0 + 5.0 * math.sin(t / 45.0) + random.gauss(0, 0.5)
                fast = {"PV": (pv, ""), "SP": (sp, ""), "OP": (op, "%"), "MODE": (4.0, "")}
                for item, (value, unit) in fast.items():
                    client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}",
                                   envelope(fcs, cls, loop, item, value, unit), qos=1)
                    published += 1
                if t - last_tuning >= 30.0:
                    for item, (value, unit) in TUNING.items():
                        client.publish(f"OT/HDPE/{fcs}/{cls}/{loop}/PIDParams/{item}",
                                       envelope(fcs, cls, loop, item, value, unit), qos=1)
                        published += 1
            if t - last_tuning >= 30.0:
                last_tuning = t
                print(f"[sim-ot-gateway] {published} messages published", flush=True)
            time.sleep(args.interval)
    finally:
        client.loop_stop()
        client.disconnect()
        print(f"[sim-ot-gateway] done — {published} messages", flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify manually** — start `mosquitto-test`, run `python ams-sims/sim_ot_gateway_mqtt.py --minutes 1`, and in parallel `docker exec ams-mosquitto-test mosquitto_sub -t 'OT/#' -u ams_ingest -P ams-ingest-test -C 5 -v` (check the container name in compose first) shows the topics + payloads.
- [ ] **Step 3: Commit** — `feat(sims): OT gateway MQTT simulator (HDPE/PIDParams hierarchy)`

---

### Task 17: Pilot loop fixture + full-pipeline E2E script

**Files:**
- Create: `scripts/fixtures/hdpe-pilot-loops.csv`
- Create: `scripts/test-ot-loop-ingestion-e2e.ps1`

**Interfaces:** Consumes: the running stack (`run-all.ps1`), `mosquitto-test`, `scripts/import-cpm-loops.ps1` (worksheet columns `loop_id, display_name, site, area, unit, loop_type, criticality, pv_ot_tag, sp_ot_tag, op_ot_tag, mode_ot_tag, vp_ot_tag, op_min, op_max, enable_monitoring, profile`), the token/gateway helpers in `scripts/test-ingestion-config-e2e.ps1` (copy its login + call idioms), Task 16's simulator.

- [ ] **Step 1: Fixture** — registered pilot loops matching the simulator (FIC99999 deliberately absent), placed at real HDPE-tree locations (`database/scripts/48_hdpe_plant_hierarchy.sql`):

```csv
loop_id,display_name,site,area,unit,loop_type,criticality,pv_ot_tag,sp_ot_tag,op_ot_tag,mode_ot_tag,vp_ot_tag,op_min,op_max,enable_monitoring,profile
FIC10302,Reactor feed flow,hdpe,section_100,u1001_polymerization_reactor_1,FIC,high,FIC10302.PV,FIC10302.SP,FIC10302.OP,FIC10302.MODE,,0,100,true,
FIC10405,Hexane feed flow,hdpe,section_100,u1001_polymerization_reactor_1,FIC,medium,FIC10405.PV,FIC10405.SP,FIC10405.OP,FIC10405.MODE,,0,100,true,
PIC10201,Reactor pressure,hdpe,section_100,u1002_polymerization_ii_reactor_2,PIC,high,PIC10201.PV,PIC10201.SP,PIC10201.OP,PIC10201.MODE,,0,100,true,
TIC10101,Reactor temperature,hdpe,section_100,u1001_polymerization_reactor_1,TIC,medium,TIC10101.PV,TIC10101.SP,TIC10101.OP,TIC10101.MODE,,0,100,true,
```

- [ ] **Step 2: E2E script** — house style (per-step `PASS/FAIL`, exit non-zero on failure, cleanup at end). Steps the script performs, each asserted:

1. Preconditions: gateway `:8081` healthy; `mosquitto-test` up (start it via compose profile if not); DLQ topic exists (run `kafka-reset-lab-topics.ps1` if missing).
2. Register pilot loops: `scripts/import-cpm-loops.ps1 -CsvPath scripts/fixtures/hdpe-pilot-loops.csv` (or direct `POST /api/v1/cpm/loops/bulk-activate` with the same rows) → assert 4 activated via `GET /api/v1/cpm/loops`.
3. Create + activate the data source through `/api/ingestion/data-sources` (admin token): `connection_url = mqtt://mosquitto-test:1883` (in-network name — the subscriber runs inside compose), `username/password` = the mosquitto-test creds, `profile_type = MQTT_LOOP_SAMPLES`, `profile_config = { "mqtt": { "topics": ["OT/+/+/+/+/PIDParams/+"], "qos": 1 }, "loop_ingest": { "mode_value_map": { "4": "AUT" } } }`. POST `/test` → SUCCESS.
4. Start the simulator in the background: `python ams-sims/sim_ot_gateway_mqtt.py --minutes 5`.
5. Wait ≤60 s, then assert tuples: `docker exec ams-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic traverse.cpa.loop.samples.v1 --property print.key=true --timeout-ms 20000 --max-messages 10` → keys include `FIC10302`; parse one value: has `pv/sp/op` numeric, `mode == "AUT"`, `quality == "GOOD"`, `loop_type == "FIC"`, `site == "hdpe"`, `p == 300.0`.
6. Assert parking: `GET /api/ingestion/unknown-sources` shows `LOOP_NOT_REGISTERED` with `source_key` ending `FIC99999` and a growing count; DLQ has records (`kafka-console-consumer` on `traverse.ingestion.ot-dlq`, ≥1 message).
7. Assert enrichment/health: `GET /api/ingestion/stats` shows the subscriber connected, tuples > 0; `GET /api/ingestion/data-sources` row has `lastDataReceived` set.
8. Assert historian: after ≥60 s, IoTDB row count for the loop grows — `docker exec ams-iotdb /iotdb/sbin/start-cli.sh -e "select count(pv) from root.site1.cpm.FIC10302"` (verify the container name + cli path against an existing script, e.g. the pipeline diagnostics scripts, and reuse their invocation).
9. Assert readiness: `GET /api/v1/cpm/loops/FIC10302/readiness` — registry/tag checks green and the samples check improving (exact assertion: no `registry_row`/`tag_pv..mode` blockers).
10. Registry-refresh proof (the "new loop without redeploy" requirement): activate one more loop (`FIC10403`, same fixture shape) while the sim runs — extend the sim's `LOOPS` list to include `FIC10403` from the start so its messages were parking — and assert that within ~2× `registry_refresh_seconds` its tuples appear on the samples topic.
11. Cleanup: stop sim, deactivate + delete the data source, optionally `bulk-delete` the pilot loops (leave a `-KeepLoops` switch).

- [ ] **Step 3: Run it** end-to-end against the lab stack → all PASS.
- [ ] **Step 4: Commit** — `test(e2e): OT MQTT → registry → Kafka → historian loop ingestion E2E`

---

### Task 18: Runbook + doc cross-links

**Files:**
- Create: `docs/ot-data-integration/10-ot-loop-ingestion-runbook.md`
- Modify: `docs/ot-data-integration/03-mqtt-ingestion-enrichment-service.md` (one line under §9 noting phase 2 loop pipeline is implemented, link to 08/09/10)
- Modify: `docs/api-gateway.md` (note the new `/api/ingestion/stats`, `/unknown-sources`, `/data-sources/{id}/reload` sub-routes ride the existing `api-ingestion` route — table row update only if the table enumerates sub-paths)

- [ ] **Step 1:** Write the runbook covering, each as a short recipe with the exact commands/endpoints: **adding a new loop** (worksheet row → `import-cpm-loops.ps1` → flows on next refresh; verify via `/stats` + readiness); **configuring the mode map** (edit data source → `loop_ingest.mode_value_map`; unmapped modes visible in Grafana via `ingestion_*` metrics and as raw mode strings in tuples); **reviewing unknown sources** (`GET /api/ingestion/unknown-sources`, register-or-ignore decision, count reset by re-registration); **broker outage** (managed client reconnects; QoS-1 backlog delivered; joiner staleness marks BAD ticks meanwhile); **Kafka outage** (pipeline stalls by design, MQTT queue absorbs; watch `ingestion_kafka_publish_failures_total`); **DLQ replay** (`scripts/replay-kafka-dlq.ps1` against `traverse.ingestion.ot-dlq` — replay only after fixing the cause; LOOP_NOT_REGISTERED replays re-enter the pipeline and resolve if the loop now exists); **verifying end-to-end** (the E2E script + the §17 assertion list); **open OT questions** (MODE enum, GW semantics — link assessment §6).
- [ ] **Step 2: Commit** — `docs(ingestion): OT loop ingestion runbook + cross-links`

---

## Self-Review Notes

- **Spec coverage:** prompt §4 objective → Tasks 3–13; §6 resolution → 7; §7 mapping → 6+7; §8 authority → 5; §9 dynamic/static params → 6+8 (tuning as extensions); §10 canonical event → 8; §11 Kafka key → 9; §12 timestamps → 4+8; §13 seq → 4 (preserved, unused); §14 subscription → 1+13; §15 caching → 7; §16 unknown loops → 10+13; §17 unknown params → 6; §18 quality → 4+8; §19 units → 5 note + metrics (warn-only, documented); §20 delivery → 9+13; §21 observability → 11; §29 tests → per-task TDD + 15 + 17; §30 QA counts → sim/E2E scale checks; §31 performance → O(1) cache, aggregated inventory, bounded channel, no per-message DB writes; §32 config → 1; §36 deliverables → docs 08/09 (done pre-plan), runbook Task 18, mapping doc done, example messages in doc 09.
- **Deliberate scope-outs (recorded in assessment):** telemetry/alarms/PRM profile pipelines (structure ready — new profile = new parser + destination); backfill door; historizing P/I/D/GW in IoTDB (extend `RawLoopIotDbConsumer` measurement list later); admin UI for the mode map (JSONB-editable via existing wizard's profile_config for now); deadman watchdog for `loop.samples.v1`.
- **Type consistency check:** `LoopIngestSettings` produced in Task 1, consumed in 3(no)/4(FutureSkewMaxSeconds)/6/8/13 — signatures match; `MappedParameter` 6→8/13; `RegistryLoop` 7→8/13/15; `LoopTuple` 8→9/13/15; `UnknownSourceRow` 2→10/11; `DlqReasons` 4→5/6/13.
