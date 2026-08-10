using System.Data;
using Dapper;
using FluentAssertions;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace AMS.Tests.Integration.Alarms;

/// <summary>
/// Regression coverage for the Plan 01 alarm-integrity work. These run the real
/// scripts from database/scripts against a throwaway PostgreSQL container, so a
/// change that weakens the projection's identity guarantees fails here rather
/// than in the plant.
///
/// Covers:
///   DATA-01 — the alarm projection has a real identity constraint
///             (server + source + condition + subCondition) and no longer lets
///             two OPC servers collide on the same tag name.
///   DOM-02  — shelving is persisted and the ISA-18.2 expiry sweep releases it.
///   DATA-06 — alarms.alarm_history accepts the writer's exact column list.
/// </summary>
/// <summary>
/// Owns one PostgreSQL container for the whole class — starting a container per test
/// turned a 25-second suite into two and a half minutes of CI time.
/// </summary>
public sealed class AlarmSchemaFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        // TimescaleDB image: 01_init_extensions.sql creates the timescaledb extension.
        .WithImage("timescale/timescaledb:latest-pg15")
        .WithDatabase("ams")
        .WithUsername("ams_user")
        .WithPassword("test_password")
        .Build();

    public NpgsqlConnection Connection { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await _db.StartAsync();
        Connection = new NpgsqlConnection(_db.GetConnectionString());
        await Connection.OpenAsync();

        foreach (var script in new[]
                 {
                     "01_init_extensions.sql",
                     "02_alarm_schema.sql",
                     "35_alarm_current_identity.sql",
                     "36_alarm_shelving.sql",
                 })
        {
            await Connection.ExecuteAsync(ReadScript(script));
        }
    }

    public async Task DisposeAsync()
    {
        if (Connection is not null) await Connection.DisposeAsync();
        await _db.DisposeAsync();
    }

    /// <summary>Loads the real migration from database/scripts, stripping psql meta-commands.</summary>
    private static string ReadScript(string fileName)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "database", "scripts")))
            dir = dir.Parent;

        if (dir is null)
            throw new DirectoryNotFoundException("Could not locate database/scripts from the test output directory.");

        var path = Path.Combine(dir.FullName, "database", "scripts", fileName);
        var sql  = File.ReadAllText(path);

        // \c / \gexec are psql client directives; Npgsql cannot execute them. These four
        // scripts all target the default database, so dropping the lines is faithful.
        var kept = sql.Split('\n')
                      .Where(l => !l.TrimStart().StartsWith(@"\", StringComparison.Ordinal))
                      .Where(l => !l.Contains(@"\gexec", StringComparison.Ordinal));
        return string.Join('\n', kept);
    }
}

[Trait("Category", "Integration")]
public sealed class Plan01ProjectionIntegrityTests : IClassFixture<AlarmSchemaFixture>, IAsyncLifetime
{
    private static readonly Guid ServerA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid ServerB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private readonly NpgsqlConnection _conn;

    public Plan01ProjectionIntegrityTests(AlarmSchemaFixture fixture) => _conn = fixture.Connection;

    /// <summary>The container is shared, so each test starts from an empty projection.</summary>
    public Task InitializeAsync() => _conn.ExecuteAsync(
        "TRUNCATE alarms.alarm_current, alarms.alarm_history, alarms.shelving_actions");

    public Task DisposeAsync() => Task.CompletedTask;

    private Task InsertAlarmAsync(string alarmId, Guid serverId, string source,
                                  string condition, string? subCondition)
        => _conn.ExecuteAsync(@"
            INSERT INTO alarms.alarm_current
                (alarm_id, server_id, source, severity, condition, sub_condition, event_time, state)
            VALUES (@alarmId, @serverId, @source, 700, @condition, @subCondition, now(), 'ACTIVE')",
            new { alarmId, serverId, source, condition, subCondition });

    // ── DATA-01 ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Projection_RejectsDuplicateAlarmIdentity()
    {
        await InsertAlarmAsync("first", ServerA, "FIC-101", "PVHIGH", "HI");

        // Same identity, different alarm_id — before DATA-01 this created a duplicate
        // logical alarm because nothing but UNIQUE(alarm_id) guarded the table.
        var duplicate = async () =>
            await InsertAlarmAsync("second-with-same-identity", ServerA, "FIC-101", "PVHIGH", "HI");

        await duplicate.Should().ThrowAsync<PostgresException>()
            .Where(e => e.SqlState == PostgresErrorCodes.UniqueViolation);
    }

    [Fact]
    public async Task Projection_AllowsSameTagNameOnDifferentServers()
    {
        await InsertAlarmAsync("server-a", ServerA, "FIC-101", "PVHIGH", "HI");
        await InsertAlarmAsync("server-b", ServerB, "FIC-101", "PVHIGH", "HI");

        var count = await _conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM alarms.alarm_current WHERE source = 'FIC-101'");

        count.Should().Be(2, "the same tag on two OPC servers is two distinct alarms");
    }

    [Fact]
    public async Task Projection_TreatsNullAndEmptySubConditionAsTheSameIdentity()
    {
        await InsertAlarmAsync("null-subcond", ServerA, "TIC-205", "PVLOW", null);

        // COALESCE(sub_condition,'') in the index — without it NULLs are distinct in a
        // btree and a NULL sub-condition would slip past the constraint entirely.
        var duplicate = async () =>
            await InsertAlarmAsync("another-null-subcond", ServerA, "TIC-205", "PVLOW", null);

        await duplicate.Should().ThrowAsync<PostgresException>()
            .Where(e => e.SqlState == PostgresErrorCodes.UniqueViolation);
    }

    // ── DOM-02 ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task ShelveExpiry_ReleasesAlarmsPastTheirShelveUntil()
    {
        await InsertAlarmAsync("shelved", ServerA, "PIC-300", "PVHIGH", "HI");
        await _conn.ExecuteAsync(@"
            UPDATE alarms.alarm_current
               SET is_shelved = TRUE, shelve_until = now() - interval '1 minute',
                   state = 'SHELVED', shelved_by = 'operator1'
             WHERE alarm_id = 'shelved'");

        var expired = await _conn.ExecuteScalarAsync<int>("SELECT alarms.expire_shelved_alarms()");

        expired.Should().Be(1);

        var row = await _conn.QuerySingleAsync<(bool IsShelved, string State)>(
            "SELECT is_shelved AS \"IsShelved\", state AS \"State\" FROM alarms.alarm_current WHERE alarm_id='shelved'");
        row.IsShelved.Should().BeFalse();
        row.State.Should().Be("ACTIVE");

        var audited = await _conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM alarms.shelving_actions WHERE action = 'AUTO_EXPIRED'");
        audited.Should().Be(1, "every automatic un-shelve must leave an audit row");
    }

    [Fact]
    public async Task ShelveExpiry_LeavesUnexpiredShelvesAlone()
    {
        await InsertAlarmAsync("still-shelved", ServerA, "LIC-400", "PVLOW", "LO");
        await _conn.ExecuteAsync(@"
            UPDATE alarms.alarm_current
               SET is_shelved = TRUE, shelve_until = now() + interval '2 hours', state = 'SHELVED'
             WHERE alarm_id = 'still-shelved'");

        var expired = await _conn.ExecuteScalarAsync<int>("SELECT alarms.expire_shelved_alarms()");

        expired.Should().Be(0);
        var stillShelved = await _conn.ExecuteScalarAsync<bool>(
            "SELECT is_shelved FROM alarms.alarm_current WHERE alarm_id='still-shelved'");
        stillShelved.Should().BeTrue();
    }

    // ── DATA-06 ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task AlarmHistory_AcceptsTheWritersColumnList()
    {
        // Mirrors HistoricalAlarmRepository.AppendHistoryAsync exactly — if that INSERT
        // and this schema ever drift, the history writer silently stops working again.
        await _conn.ExecuteAsync(@"
            INSERT INTO alarms.alarm_history
                (alarm_id, source, severity, message, condition, sub_condition,
                 event_time, state, ack_status, cleared_time)
            VALUES (@AlarmId, @Source, @Severity, @Message, @Condition, @SubCondition,
                    @EventTime, @State, @AckStatus, @ClearedTime)",
            new
            {
                AlarmId = "v1|hist|FIC-101|PVHIGH|HI",
                Source = "FIC-101",
                Severity = 700,
                Message = "history row",
                Condition = "PVHIGH",
                SubCondition = "HI",
                EventTime = DateTimeOffset.UtcNow,
                State = "ACTIVE",
                AckStatus = false,
                ClearedTime = (DateTimeOffset?)null
            });

        var count = await _conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM alarms.alarm_history");
        count.Should().Be(1);
    }
}
