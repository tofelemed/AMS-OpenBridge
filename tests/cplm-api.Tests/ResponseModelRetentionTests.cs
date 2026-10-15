// CHG-091 - unreviewed system models age out with the RESPONSE days. Tested with a 3600 d window and 3650 d old rows on
// this test's own loop, so the lab's own models are never touched; only this test's ids are created and removed.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ResponseModelRetentionTests : IAsyncLifetime
{
    private const string Loop = "TEST_CHG091_MODELS";
    private NpgsqlDataSource _db = null!;
    private readonly Guid _rejected = Guid.NewGuid(), _olderValidated = Guid.NewGuid(), _newestValidated = Guid.NewGuid(),
        _newest = Guid.NewGuid(), _reviewed = Guid.NewGuid(), _baseline = Guid.NewGuid(), _named = Guid.NewGuid(),
        _otherPathOld = Guid.NewGuid(), _event = Guid.NewGuid(), _run = Guid.NewGuid();

    private Guid[] All => new[] { _rejected, _olderValidated, _newestValidated, _newest, _reviewed, _baseline, _named, _otherPathOld };

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            INSERT INTO analytics.response_event (event_id, loop_id, method_run_id, event_type, path_id, t0_ms, capture_state, evaluation_state, eligibility, result, created_at)
            VALUES (@_event, @Loop, @_run, 'INPUT_TEST', 'OP_TO_PV', 0, 'COMPLETE', 'EVALUATED', 'ELIGIBLE', '{}'::jsonb, NOW() - interval '3650 days')
            """, new { _event, Loop, _run });
        await conn.ExecuteAsync("INSERT INTO analytics.response_metric (method_run_id, quantity_id, unit) VALUES (@_run, 'q91', 's')", new { _run });
        await Model(conn, _rejected, "OP_TO_PV", "REJECTED", 3650, fromEvent: _event);
        await Model(conn, _olderValidated, "OP_TO_PV", "VALIDATED", 3649);
        await Model(conn, _newestValidated, "OP_TO_PV", "VALIDATED", 3640);
        await Model(conn, _newest, "OP_TO_PV", "CANDIDATE", 3630);
        await Model(conn, _reviewed, "OP_TO_PV", "REJECTED", 3650, reviewedBy: "engineer", supersededBy: _named);
        await Model(conn, _baseline, "OP_TO_PV", "ACTIVE_BASELINE", 3650);
        await Model(conn, _named, "OP_TO_PV", "SUPERSEDED", 3648);
        await Model(conn, _otherPathOld, "SP_TO_PV", "CANDIDATE", 3650);   // the only (= newest) model of its path
    }

    private Task Model(NpgsqlConnection conn, Guid id, string path, string state, int ageDays,
        Guid? fromEvent = null, string? reviewedBy = null, Guid? supersededBy = null) => conn.ExecuteAsync(
        """
        INSERT INTO analytics.system_model (model_id, loop_id, path_id, family, parameters, model_state, created_from_event, reviewed_by, superseded_by, created_at)
        VALUES (@id, @Loop, @path, 'FOPDT', '{}'::jsonb, @state, @fromEvent, @reviewedBy, @supersededBy, NOW() - make_interval(days => @ageDays))
        """, new { id, Loop, path, state, fromEvent, reviewedBy, supersededBy, ageDays });

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE loop_id = @Loop", new { Loop });
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id = @_run", new { _run });
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE event_id = @_event", new { _event });
        await _db.DisposeAsync();
    }

    private async Task<HashSet<Guid>> Left()
    {
        await using var conn = await _db.OpenConnectionAsync();
        return (await conn.QueryAsync<Guid>("SELECT model_id FROM analytics.system_model WHERE model_id = ANY(@ids)", new { ids = All })).ToHashSet();
    }

    [Fact]
    public async Task Only_old_unreviewed_models_that_nothing_needs_are_deleted()
    {
        await ResponseRetention.PurgeModelsAsync(_db, 3600, 1000, CancellationToken.None);
        var left = await Left();
        left.Should().NotContain(new[] { _rejected, _olderValidated }, "old, unreviewed, neither newest nor named");
        left.Should().Contain(_newest, "the newest model of the loop and path stays");
        left.Should().Contain(_newestValidated, "the newest VALIDATED model of the loop and path stays");
        left.Should().Contain(_reviewed, "a model a person reviewed stays");
        left.Should().Contain(_baseline, "an ACTIVE_BASELINE stays");
        left.Should().Contain(_named, "a model another row's superseded_by names stays");
        left.Should().Contain(_otherPathOld, "newest is per loop AND path");
    }

    [Fact]
    public async Task A_deleted_model_unpins_its_event_for_the_event_purge()
    {
        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None);
        await using (var conn = await _db.OpenConnectionAsync())
            (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @_event", new { _event })).Should().Be(1, "pinned while its model exists");
        await ResponseRetention.PurgeModelsAsync(_db, 3600, 1000, CancellationToken.None);
        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None);
        await using (var conn = await _db.OpenConnectionAsync())
        {
            (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @_event", new { _event })).Should().Be(0);
            (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @_run", new { _run })).Should().Be(0);
        }
    }
}
