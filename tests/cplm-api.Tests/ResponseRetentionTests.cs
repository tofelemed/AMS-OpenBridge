// CHG-049 - response_event / response_metric retention (row RESPONSE of retention_policy). The purge is tested with
// a 3600 d window so the lab's own rows are never touched; only this test's ids are created and removed.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]
public sealed class ResponseRetentionTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _oldEvent = Guid.NewGuid(), _newEvent = Guid.NewGuid(), _oldRun = Guid.NewGuid(), _newRun = Guid.NewGuid();
    // CHG-049 (final review I4): an old event a system model was created from, with its metric
    private readonly Guid _modelEvent = Guid.NewGuid(), _modelRun = Guid.NewGuid(), _modelId = Guid.NewGuid();
    private bool _createdPolicyRow;

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await Event(conn, _oldEvent, _oldRun, 3650);
        await Event(conn, _newEvent, _newRun, 1);
        await Event(conn, _modelEvent, _modelRun, 3650);
        await conn.ExecuteAsync(
            """
            INSERT INTO analytics.system_model (model_id, loop_id, path_id, family, parameters, model_state, created_from_event)
            VALUES (@_modelId, 'TEST_CHG049_RESP', 'OP_TO_PV', 'FOPDT', '{}'::jsonb, 'CANDIDATE', @_modelEvent)
            """, new { _modelId, _modelEvent });
        foreach (var run in new[] { _oldRun, _oldRun, _newRun, _modelRun })
            await conn.ExecuteAsync("INSERT INTO analytics.response_metric (method_run_id, quantity_id, unit) VALUES (@run, @q, 's')",
                new { run, q = "q" + Guid.NewGuid().ToString("N")[..8] });
    }

    private static Task Event(NpgsqlConnection conn, Guid id, Guid run, int ageDays) => conn.ExecuteAsync(
        """
        INSERT INTO analytics.response_event (event_id, loop_id, method_run_id, event_type, path_id, t0_ms, capture_state, evaluation_state, eligibility, result, created_at)
        VALUES (@id, 'TEST_CHG049_RESP', @run, 'INPUT_TEST', 'OP_TO_PV', 0, 'COMPLETE', 'EVALUATED', 'ELIGIBLE', '{}'::jsonb, NOW() - make_interval(days => @ageDays))
        """, new { id, run, ageDays });

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.system_model WHERE model_id = @_modelId", new { _modelId });
        await conn.ExecuteAsync("DELETE FROM analytics.response_metric WHERE method_run_id = ANY(@runs)", new { runs = new[] { _oldRun, _newRun, _modelRun } });
        await conn.ExecuteAsync("DELETE FROM analytics.response_event WHERE event_id = ANY(@ids)", new { ids = new[] { _oldEvent, _newEvent, _modelEvent } });
        if (_createdPolicyRow) await conn.ExecuteAsync("DELETE FROM analytics.retention_policy WHERE record_class = 'RESPONSE'");
        await _db.DisposeAsync();
    }

    [Fact]
    public async Task Purge_deletes_the_old_event_and_its_metrics_and_keeps_the_new_one()
    {
        var n = await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None);
        n.Should().Be(1);
        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = ANY(@ids)", new { ids = new[] { _oldEvent, _newEvent } })).Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @id", new { id = _newEvent })).Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @run", new { run = _oldRun })).Should().Be(0);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @run", new { run = _newRun })).Should().Be(1);
    }

    [Fact]
    public async Task Purge_keeps_an_old_event_a_system_model_was_created_from_and_its_metrics()
    {
        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @id", new { id = _modelEvent })).Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @run", new { run = _modelRun })).Should().Be(1);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @id", new { id = _oldEvent })).Should().Be(0);
    }

    [Fact]
    public async Task Censored_only_purge_leaves_complete_events()
    {
        // CHG-091: _oldEvent is COMPLETE and 3650 d old; a censored-only pass must not take it
        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None, censoredOnly: true);
        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @id", new { id = _oldEvent })).Should().Be(1);
        await conn.ExecuteAsync("UPDATE analytics.response_event SET capture_state = 'CENSORED' WHERE event_id = @id", new { id = _oldEvent });
        await ResponseRetention.PurgeAsync(_db, 3600, 1000, CancellationToken.None, censoredOnly: true);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_event WHERE event_id = @id", new { id = _oldEvent })).Should().Be(0);
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.response_metric WHERE method_run_id = @run", new { run = _oldRun })).Should().Be(0);
    }

    [Fact]
    public async Task A_RESPONSE_policy_row_is_not_an_evidence_class_and_drives_the_response_purge()
    {
        await using (var conn = await _db.OpenConnectionAsync())
        {
            var had = await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.retention_policy WHERE record_class = 'RESPONSE'");
            if (had == 0)
            {
                await conn.ExecuteAsync("INSERT INTO analytics.retention_policy (record_class, days) VALUES ('RESPONSE', 3600)");
                _createdPolicyRow = true;
            }
        }
        var r = await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None);   // must not throw on the RESPONSE row
        r.ResponsePurged.Should().BeGreaterThanOrEqualTo(0);
        if (_createdPolicyRow) r.ResponsePurged.Should().Be(1, "the 3650 d old event is past the 3600 d window");
    }
}
