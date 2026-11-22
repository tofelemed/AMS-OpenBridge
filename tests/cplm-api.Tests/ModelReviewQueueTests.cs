// CHG-109: the model review shortlist - one row per active loop and path with an unreviewed VALIDATED model. Lab database.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ModelReviewQueueTests : IAsyncLifetime
{
    private const string Site = "e2e-rq-site";
    private static readonly string[] Loops = { "RQ_A", "RQ_B", "RQ_C", "RQ_OLD" };
    private NpgsqlDataSource _db = null!;

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await Cleanup();
        await using var conn = await _db.OpenConnectionAsync();
        foreach (var l in Loops)
            await conn.ExecuteAsync("INSERT INTO cpm.loop_registry (loop_id, display_name, site, loop_type, is_active) VALUES (@l, @name, @site, 'FIC', @active)",
                new { l, name = l + " flow", site = Site, active = l != "RQ_OLD" });
    }

    public async Task DisposeAsync()
    {
        await Cleanup();
        await _db.DisposeAsync();
    }

    private async Task Cleanup()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id IN (SELECT method_run_id FROM analytics.system_model WHERE loop_id = ANY(@Loops))", new { Loops });
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE loop_id = ANY(@Loops)", new { Loops });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = ANY(@Loops)", new { Loops });
    }

    private async Task<Guid> Model(string loop, string state, int hoursAgo, double gain, DateTime? reviewedAt = null)
    {
        var id = Guid.NewGuid();
        var run = Guid.NewGuid();
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.system_model (model_id, loop_id, path_id, family, parameters, model_state, method_run_id, created_from_event, created_at, revision, reviewed_by, reviewed_at)
            VALUES (@id, @loop, 'OP_TO_PV', 'FOPDT', @p::jsonb, @state, @run, @event, now() - make_interval(hours => @hoursAgo), @rev, @by, @at)
            """, new
        {
            id, loop, state, run, @event = Guid.NewGuid(), hoursAgo, rev = reviewedAt is null ? 1 : 2, by = reviewedAt is null ? null : "eng", at = reviewedAt,
            p = "{\"process_gain\":{\"value\":" + gain.ToString(System.Globalization.CultureInfo.InvariantCulture)
                + "},\"time_constant\":{\"value\":20.0},\"dead_time\":{\"value\":4.0}}",
        });
        await conn.ExecuteAsync("""
            INSERT INTO analytics.response_metric (method_run_id, quantity_id, value, unit, path_id, method, config_hash, reason)
            VALUES (@run, 'fit_improvement', 0.4, 'fraction', 'OP_TO_PV', 'm', 'legacy', ''), (@run, 'validation_rmse', 0.7, 'PV_EU', 'OP_TO_PV', 'm', 'legacy', '')
            """, new { run });
        return id;
    }

    [Fact]
    public async Task One_row_per_loop_with_the_newest_unreviewed_candidate_loops_without_a_baseline_first()
    {
        await Model("RQ_A", "VALIDATED", 30, 1.0);
        await Model("RQ_A", "VALIDATED", 20, 1.1);
        var newestA = await Model("RQ_A", "VALIDATED", 10, 1.2);
        var reviewed = DateTime.UtcNow.AddDays(-2);
        var baseA = await Model("RQ_A", "ACTIVE_BASELINE", 100, 0.9, reviewed);
        var onlyB = await Model("RQ_B", "VALIDATED", 50, 2.0);
        await Model("RQ_C", "VALIDATED", 5, 3.0, DateTime.UtcNow.AddHours(-1));   // reviewed already: nothing to review
        await Model("RQ_OLD", "VALIDATED", 5, 4.0);                              // retired loop

        var rows = (await ModelReviewQueue.ReadAsync(_db, Site, 100, default)).ToList();
        rows.Select(r => r.LoopId).Should().Equal("RQ_B", "RQ_A");
        rows[0].Baseline.Should().BeNull();
        rows[0].Candidate.ModelId.Should().Be(onlyB);
        rows[0].PendingCount.Should().Be(1);

        var a = rows[1];
        a.DisplayName.Should().Be("RQ_A flow");
        a.Candidate.ModelId.Should().Be(newestA);
        a.Candidate.Gain.Should().Be(1.2);
        a.Candidate.TimeConstant.Should().Be(20.0);
        a.Candidate.DeadTime.Should().Be(4.0);
        a.Candidate.FitImprovement.Should().Be(0.4);
        a.Candidate.ValidationRmse.Should().Be(0.7);
        a.Baseline!.ModelId.Should().Be(baseA);
        a.PendingCount.Should().Be(3);
        a.LastReviewedAt.Should().BeCloseTo(reviewed, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task The_site_filter_and_the_limit_apply()
    {
        await Model("RQ_A", "VALIDATED", 10, 1.2);
        await Model("RQ_B", "VALIDATED", 50, 2.0);
        (await ModelReviewQueue.ReadAsync(_db, "another-site", 100, default)).Should().BeEmpty();
        (await ModelReviewQueue.ReadAsync(_db, Site, 1, default)).Should().ContainSingle();
    }
}
