// CHG-045 (SME review #7) — the priority queue, against the REAL traverse_cplm database (lab Postgres
// on 127.0.0.1:5433, or CPLM_TEST_DB), like the other fleet SQL tests. The matrix is restated here in C#
// as the oracle; the shelving case shelves one episode inside a transaction and rolls it back, so the
// lab data is never changed.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Data;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
public sealed class FleetPrioritySqlTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;

    public Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _db.DisposeAsync();

    // Settable properties: Dapper fills the columns it knows and ignores the rest of the queue's projection.
    private sealed class Row
    {
        public string loop_id { get; set; } = "";
        public string? criticality { get; set; }
        public string diagnosis { get; set; } = "";
        public string? severity { get; set; }
        public double? confidence { get; set; }
        public double? good_error_pct { get; set; }
        public int priority { get; set; }
        public DateTime? episode_opened_at { get; set; }
        public string? ack_state { get; set; }
    }

    private static int Matrix(string? criticality, string? severity)
    {
        var c = (criticality ?? "medium").ToLowerInvariant();
        var s = (severity ?? "LOW").ToUpperInvariant();
        if (s == "MED") s = "MEDIUM";
        return (c, s) switch
        {
            ("critical", "HIGH" or "MEDIUM") => 1,
            ("high", "HIGH") => 1,
            ("critical", _) => 2,
            ("high", "MEDIUM") => 2,
            ("medium", "HIGH") => 2,
            _ => 3,
        };
    }

    private static object Args(int limit = 200) => new
    {
        site = (string?)null, area = (string?)null, unit = (string?)null,
        windowKind = "24h", limit, staleSeconds = FleetLatestSql.StaleAfterSeconds("24h"),
    };

    [Fact]
    public async Task Queue_is_current_findings_in_matrix_then_impact_then_persistence_order()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync<Row>(FleetPrioritySql.Queue(), Args())).ToList();
        rows.Should().NotBeEmpty("the lab carries current findings");

        rows.Should().OnlyContain(r => System.Text.RegularExpressions.Regex.IsMatch(r.diagnosis, "^(CONFIRMED|SUSPECTED|DETECTED|CLASSIFIED)_"));
        rows.Should().OnlyContain(r => r.priority == Matrix(r.criticality, r.severity), "the SQL matrix matches the documented one");

        for (var i = 1; i < rows.Count; i++)
        {
            var (a, b) = (rows[i - 1], rows[i]);
            if (a.priority != b.priority) { a.priority.Should().BeLessThan(b.priority); continue; }
            var ga = a.good_error_pct ?? double.MaxValue; var gb = b.good_error_pct ?? double.MaxValue;
            if (ga != gb) { ga.Should().BeLessThan(gb, $"{a.loop_id} before {b.loop_id}: worse impact first"); continue; }
            var oa = a.episode_opened_at ?? DateTime.MaxValue; var ob = b.episode_opened_at ?? DateTime.MaxValue;
            if (oa != ob) oa.Should().BeBefore(ob, "longer persistence first");
        }
    }

    [Fact]
    public async Task Queue_plus_shelved_equals_the_operating_pictures_poor_count()
    {
        await using var conn = await _db.OpenConnectionAsync();
        var queued = (await conn.QueryAsync<Row>(FleetPrioritySql.Queue(), Args(limit: 5000))).Count();
        var shelved = await conn.ExecuteScalarAsync<int>(FleetPrioritySql.ShelvedCount(), Args());
        var poor = (await conn.QueryAsync<(string Status, int Count)>(FleetLatestSql.SummaryByStatus, Args()))
            .Where(x => x.Status == "POOR").Sum(x => x.Count);

        (queued + shelved).Should().Be(poor, "the queue is the poor-performance loops, minus the actively shelved");
    }

    [Fact]
    public async Task An_actively_shelved_episode_leaves_the_queue_and_is_counted()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();
        var before = (await conn.QueryAsync<Row>(FleetPrioritySql.Queue(), Args(limit: 5000), tx)).ToList();
        var target = before.FirstOrDefault(r => r.episode_opened_at != null);
        if (target is null) return; // no open episode on this database: nothing to shelve
        var shelvedBefore = await conn.ExecuteScalarAsync<int>(FleetPrioritySql.ShelvedCount(), Args(), tx);

        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames SET ack_state = 'SHELVED', shelve_until = now() + interval '1 hour'
            WHERE lower(loop_id) = lower(@loop) AND window_kind = '24h' AND closed_at IS NULL
            """, new { loop = target.loop_id }, tx);
        var during = (await conn.QueryAsync<Row>(FleetPrioritySql.Queue(), Args(limit: 5000), tx)).ToList();
        during.Should().NotContain(r => r.loop_id == target.loop_id);
        (await conn.ExecuteScalarAsync<int>(FleetPrioritySql.ShelvedCount(), Args(), tx)).Should().Be(shelvedBefore + 1);

        // An expired shelf brings it back (ISA-18.2: a shelved alarm returns when the shelf lapses).
        await conn.ExecuteAsync("""
            UPDATE analytics.cplm_event_frames SET shelve_until = now() - interval '1 minute'
            WHERE lower(loop_id) = lower(@loop) AND window_kind = '24h' AND closed_at IS NULL
            """, new { loop = target.loop_id }, tx);
        (await conn.QueryAsync<Row>(FleetPrioritySql.Queue(), Args(limit: 5000), tx))
            .Should().Contain(r => r.loop_id == target.loop_id);

        await tx.RollbackAsync();
    }
}

public sealed class FleetPriorityLabelTests
{
    [Theory]
    [InlineData(1, "HIGH")]
    [InlineData(2, "MEDIUM")]
    [InlineData(3, "LOW")]
    [InlineData(null, null)]
    public void Labels(int? p, string? label) => FleetPrioritySql.PriorityLabel(p).Should().Be(label);
}
