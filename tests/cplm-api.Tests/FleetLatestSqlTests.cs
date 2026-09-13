// CHG-023 — the fleet "latest verdict per loop" read path.
//
// These run against a REAL traverse_cplm database (the lab Postgres on 127.0.0.1:5433 by
// default, or CPLM_TEST_DB). The oracle is the query shape the controllers shipped with
// (DISTINCT ON over the whole gate table, real-verdict-first), copied verbatim below. The
// new per-loop probe must return exactly the same rows — and must do it through the two
// new indexes rather than a whole-table sort, which is the defect being fixed.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class FleetLatestSqlTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    // ── Legacy shapes (verbatim from CpmFleetController before CHG-023) ─────────

    private static string LegacyRankings(string rankExpr) => $"""
        WITH latest AS (
            SELECT DISTINCT ON (g.loop_id)
                   g.loop_id, g.window_kind, g.window_end, g.diagnosis, g.severity,
                   g.confidence, g.effort_ratio, g.triangularity, g.horch_oddness,
                   g.acf_period_s, g.good_error_pct, g.mae, g.payload::text AS payload
            FROM analytics.cplm_gate_results g
            WHERE g.window_kind = @windowKind
            ORDER BY g.loop_id,
                     (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') DESC,
                     g.window_end DESC NULLS LAST, g.created_at DESC
        )
        SELECT r.loop_id, r.display_name, r.site, r.area, r.unit, r.loop_type, r.criticality,
               l.window_end, l.diagnosis, l.severity, l.confidence,
               l.effort_ratio, l.triangularity, l.horch_oddness, l.acf_period_s,
               l.good_error_pct, l.mae, l.payload
        FROM cpm.loop_registry r
        LEFT JOIN latest l ON lower(l.loop_id) = lower(r.loop_id)
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        ORDER BY
            (l.diagnosis IS NOT NULL AND l.diagnosis <> 'INSUFFICIENT_DATA') DESC,
            {rankExpr},
            r.loop_id
        LIMIT @limit
        """;

    private const string LegacyHeatmap = """
        WITH latest AS (
            SELECT DISTINCT ON (g.loop_id)
                   g.loop_id, g.window_end, g.diagnosis, g.confidence, g.payload::text AS payload
            FROM analytics.cplm_gate_results g
            WHERE g.window_kind = @windowKind
            ORDER BY g.loop_id,
                     (g.diagnosis IS NOT NULL AND g.diagnosis <> 'INSUFFICIENT_DATA') DESC,
                     g.window_end DESC NULLS LAST, g.created_at DESC
        )
        SELECT r.loop_id, r.display_name, r.site, r.loop_type,
               l.window_end, l.diagnosis, l.confidence, l.payload
        FROM cpm.loop_registry r
        LEFT JOIN latest l ON lower(l.loop_id) = lower(r.loop_id)
        WHERE (@site::text IS NULL OR r.site = @site)
          AND (@area::text IS NULL OR r.area = @area)
          AND (@unit::text IS NULL OR r.unit = @unit)
          AND COALESCE((r.monitoring->>'enabled')::boolean, FALSE)
        ORDER BY r.loop_id
        LIMIT @limit
        """;

    private const string LegacySummary = """
        WITH latest AS (
            SELECT DISTINCT ON (g.loop_id) g.loop_id, g.diagnosis
            FROM analytics.cplm_gate_results g
            JOIN cpm.loop_registry r ON lower(r.loop_id) = lower(g.loop_id)
            WHERE g.window_kind = @windowKind
              AND g.diagnosis IS DISTINCT FROM 'INSUFFICIENT_DATA'
              AND (@site::text IS NULL OR r.site = @site)
              AND (@area::text IS NULL OR r.area = @area)
              AND (@unit::text IS NULL OR r.unit = @unit)
            ORDER BY g.loop_id, g.window_end DESC NULLS LAST, g.created_at DESC
        )
        SELECT diagnosis AS "Diagnosis", COUNT(*)::int AS "Count"
        FROM latest GROUP BY diagnosis ORDER BY 2 DESC
        """;

    // ── Helpers ────────────────────────────────────────────────────────────

    /// <summary>
    /// The legacy oracle sorts the whole gate table; at prod scale that is 20–45 s on the
    /// lab — past Dapper's 30 s default, which is exactly the HTTP 500 the old endpoints
    /// produced. The NEW queries deliberately keep the default: if they ever need more
    /// than 30 s the test must fail.
    /// </summary>
    private const int OracleTimeoutSeconds = 600;

    private static object Args(string windowKind, string? site = null, int limit = 200)
        => new { windowKind, site, area = (string?)null, unit = (string?)null, limit };

    /// <summary>The legacy endpoint parsed the WHOLE payload for one array; mirror that here.</summary>
    private static string[] FlagsFromPayload(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return Array.Empty<string>();
        using var doc = JsonDocument.Parse(payload);
        if (doc.RootElement.ValueKind != JsonValueKind.Object
            || !doc.RootElement.TryGetProperty("observability_flags", out var arr)
            || arr.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        return arr.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray();
    }

    private static string[] FlagsFromFragment(string? fragment)
    {
        if (string.IsNullOrWhiteSpace(fragment)) return Array.Empty<string>();
        using var doc = JsonDocument.Parse(fragment);
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        return doc.RootElement.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray();
    }

    private static Dictionary<string, string> GatesFromPayload(string? payload)
    {
        var gates = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(payload)) return gates;
        using var doc = JsonDocument.Parse(payload);
        if (doc.RootElement.ValueKind == JsonValueKind.Object
            && doc.RootElement.TryGetProperty("gates", out var g) && g.ValueKind == JsonValueKind.Object)
            foreach (var p in g.EnumerateObject())
                if (p.Value.ValueKind == JsonValueKind.String) gates[p.Name] = p.Value.GetString()!;
        return gates;
    }

    private static Dictionary<string, string> GatesFromFragment(string? fragment)
    {
        var gates = new Dictionary<string, string>();
        if (string.IsNullOrWhiteSpace(fragment)) return gates;
        using var doc = JsonDocument.Parse(fragment);
        if (doc.RootElement.ValueKind == JsonValueKind.Object)
            foreach (var p in doc.RootElement.EnumerateObject())
                if (p.Value.ValueKind == JsonValueKind.String) gates[p.Name] = p.Value.GetString()!;
        return gates;
    }

    private static string Row(dynamic r, string[] flags) =>
        $"{r.loop_id}|{r.window_end}|{r.diagnosis}|{r.confidence}|{r.mae}|{r.good_error_pct}|{r.effort_ratio}|{string.Join(',', flags)}";

    // ── Tests ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("24h", "l.confidence DESC NULLS LAST")]
    [InlineData("12h", "l.confidence DESC NULLS LAST")]
    [InlineData("24h", "l.good_error_pct ASC NULLS LAST")]
    public async Task Rankings_per_loop_probe_returns_the_same_ordered_rows_as_legacy_distinct_on(
        string windowKind, string rankExpr)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var legacy = (await conn.QueryAsync(LegacyRankings(rankExpr), Args(windowKind), commandTimeout: OracleTimeoutSeconds))
            .Select(r => Row(r, FlagsFromPayload((string?)r.payload))).ToList();
        var fresh = (await conn.QueryAsync(FleetLatestSql.Rankings(rankExpr), Args(windowKind)))
            .Select(r => Row(r, FlagsFromFragment((string?)r.flags))).ToList();

        legacy.Should().NotBeEmpty("the lab registry has monitored loops");
        fresh.Should().Equal(legacy);
    }

    [Fact]
    public async Task Rankings_scoped_to_a_site_matches_legacy()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var site = await conn.ExecuteScalarAsync<string>(
            "SELECT site FROM cpm.loop_registry WHERE site IS NOT NULL ORDER BY loop_id LIMIT 1");
        const string rank = "l.confidence DESC NULLS LAST";
        var legacy = (await conn.QueryAsync(LegacyRankings(rank), Args("24h", site), commandTimeout: OracleTimeoutSeconds))
            .Select(r => Row(r, FlagsFromPayload((string?)r.payload))).ToList();
        var fresh = (await conn.QueryAsync(FleetLatestSql.Rankings(rank), Args("24h", site)))
            .Select(r => Row(r, FlagsFromFragment((string?)r.flags))).ToList();

        fresh.Should().Equal(legacy);
    }

    [Theory]
    [InlineData("24h")]
    [InlineData("12h")]
    public async Task Heatmap_per_loop_probe_returns_the_same_gate_cells_as_legacy(string windowKind)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var legacy = (await conn.QueryAsync(LegacyHeatmap, Args(windowKind, limit: 300), commandTimeout: OracleTimeoutSeconds))
            .Select(r => $"{r.loop_id}|{r.window_end}|{r.diagnosis}|{r.confidence}|" +
                         string.Join(',', GatesFromPayload((string?)r.payload).OrderBy(k => k.Key).Select(k => $"{k.Key}={k.Value}")))
            .ToList();
        var fresh = (await conn.QueryAsync(FleetLatestSql.Heatmap, Args(windowKind, limit: 300)))
            .Select(r => $"{r.loop_id}|{r.window_end}|{r.diagnosis}|{r.confidence}|" +
                         string.Join(',', GatesFromFragment((string?)r.gates).OrderBy(k => k.Key).Select(k => $"{k.Key}={k.Value}")))
            .ToList();

        legacy.Should().NotBeEmpty();
        fresh.Should().Equal(legacy);
    }

    [Theory]
    [InlineData("24h")]
    [InlineData("12h")]
    public async Task Summary_diagnosis_counts_match_legacy(string windowKind)
    {
        await using var conn = await _db.OpenConnectionAsync();
        var legacy = (await conn.QueryAsync<(string Diagnosis, int Count)>(LegacySummary, Args(windowKind), commandTimeout: OracleTimeoutSeconds))
            .OrderBy(x => x.Diagnosis).ToList();
        var fresh = (await conn.QueryAsync<(string Diagnosis, int Count)>(FleetLatestSql.SummaryByDiagnosis, Args(windowKind)))
            .OrderBy(x => x.Diagnosis).ToList();

        fresh.Should().Equal(legacy);
    }

    [Fact]
    public async Task Both_latest_indexes_exist_on_the_gate_table()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var names = (await conn.QueryAsync<string>(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'analytics' AND tablename = 'cplm_gate_results'")).ToList();

        names.Should().Contain(CplmReadIndexes.RealVerdictIndex);
        names.Should().Contain(CplmReadIndexes.AnyRowIndex);
    }

    [Fact]
    public async Task Rankings_plan_probes_the_latest_indexes_instead_of_sorting_the_whole_table()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var plan = await conn.ExecuteScalarAsync<string>(
            "EXPLAIN (FORMAT JSON) " + FleetLatestSql.Rankings("l.confidence DESC NULLS LAST"), Args("24h", limit: 50));

        plan.Should().Contain(CplmReadIndexes.RealVerdictIndex);
        plan.Should().Contain(CplmReadIndexes.AnyRowIndex);
        // A DISTINCT ON over the table shows up as a Unique above a Sort of the gate rows.
        plan.Should().NotContain("\"Node Type\": \"Unique\"");
    }
}

/// <summary>Lab connection: CPLM_TEST_DB, else 127.0.0.1:5433 with the password from infra/docker/.env.</summary>
internal static class TestDb
{
    public static string ConnectionString()
    {
        var explicitCs = Environment.GetEnvironmentVariable("CPLM_TEST_DB");
        if (!string.IsNullOrWhiteSpace(explicitCs)) return explicitCs;

        var password = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD") ?? PasswordFromDotEnv()
            ?? throw new InvalidOperationException(
                "Set CPLM_TEST_DB or POSTGRES_PASSWORD (or have infra/docker/.env in the repo) — these tests need the lab traverse_cplm database.");
        return $"Host=127.0.0.1;Port=5433;Database=traverse_cplm;Username=ams_user;Password={password};Timeout=5";
    }

    private static string? PasswordFromDotEnv()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var envFile = Path.Combine(dir.FullName, "infra", "docker", ".env");
            if (File.Exists(envFile))
            {
                foreach (var line in File.ReadAllLines(envFile))
                    if (line.StartsWith("POSTGRES_PASSWORD=", StringComparison.Ordinal))
                        return line["POSTGRES_PASSWORD=".Length..].Trim().Trim('"');
                return null;
            }
            dir = dir.Parent;
        }
        return null;
    }
}
