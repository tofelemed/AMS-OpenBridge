// CHG-102 Phase 5b-1 - retention of the evidence boundary archive on a throwaway PLAIN database: whole day partitions
// dropped past EVIDENCE_ARCHIVE days, then oldest first while over max_bytes; a partition holding evidence an investigation
// pins is never dropped; the run rows go with their day; the next days are created ahead. cpm-19's rollback and a second
// apply are re-runnable. Never touches the lab's traverse_cplm.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ArchiveRetentionCplmDb : PlainCplmDb
{
    public ArchiveRetentionCplmDb() : base("cplm_evidence_archive_ret_test") { }
    // CHG-102 5c: these tests pin the cpm-19 behaviour (a pinned day kept whole), so the fresh schema's cpm-20b keep is rolled back
    protected override async Task AfterCpm10bAsync()
    {
        await ApplyAsync(RepoFile("scripts", "cpm-19-evidence-archive.sql"));
        await ApplyAsync(RepoFile("scripts", "cpm-20b-evidence-archive-keep.rollback.sql"));
    }
}

[Trait("Category", "Integration")]
public sealed class EvidenceArchiveRetentionTests : IClassFixture<ArchiveRetentionCplmDb>, IAsyncLifetime
{
    private readonly ArchiveRetentionCplmDb _fx;
    private NpgsqlDataSource Db => _fx.Db;
    private const string Loop = "ARCHRET_TIC1";
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public EvidenceArchiveRetentionTests(ArchiveRetentionCplmDb fx) => _fx = fx;

    public async Task InitializeAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            DELETE FROM analytics.evidence_manifest; DELETE FROM analytics.evidence_archive_run; DELETE FROM analytics.investigation_reference;
            UPDATE analytics.retention_policy SET days = 30, max_bytes = 12884901888 WHERE record_class = 'EVIDENCE_ARCHIVE';
            """);
        foreach (var day in await EvidenceArchiveRetention.ExistingDaysAsync(conn))
            await conn.ExecuteAsync($"DROP TABLE analytics.{EvidenceArchiveRetention.PartitionName(day)}");
        await EvidenceArchiveSeed.RegisterLoopAsync(Db, Loop, "ret");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Archives one boundary set per day back (window end 12:00 UTC of that day).</summary>
    private async Task<Dictionary<int, SeededSet>> ArchiveDaysAsync(params int[] daysAgo)
    {
        var sets = new Dictionary<int, SeededSet>();
        foreach (var d in daysAgo)
            sets[d] = await EvidenceArchiveSeed.SeedSetAsync(Db, Loop, "12h", EvidenceArchiveSeed.BoundaryEnd(d, 12), runs: 1, perRun: 4, seed: d);
        // retention off for the archiving pass itself, so every day lands first
        await using (var conn = await Db.OpenConnectionAsync())
            await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = NULL, max_bytes = NULL WHERE record_class = 'EVIDENCE_ARCHIVE'");
        var pass = await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.SetsArchived.Should().Be(daysAgo.Length);
        return sets;
    }

    private async Task<List<DateOnly>> DaysAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        return await EvidenceArchiveRetention.ExistingDaysAsync(conn);
    }

    private async Task PolicyAsync(int? days, long? maxBytes)
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = @days, max_bytes = @maxBytes WHERE record_class = 'EVIDENCE_ARCHIVE'",
            new { days, maxBytes });
    }

    private Task<ArchiveRetentionResult> MaintainAsync() =>
        EvidenceArchiveRetention.MaintainAsync(Db, DateTime.UtcNow, 2, 5, null, CancellationToken.None);

    private async Task PinAsync(Guid evidenceId)
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.investigation_reference (ref_id, loop_id, evidence_ids, note) VALUES (gen_random_uuid(), @loop, @ids, 'keep')
            """, new { loop = Loop, ids = new[] { evidenceId } });
    }

    [Fact]
    public async Task Days_past_retention_are_dropped_with_their_run_rows_and_the_next_days_are_ready()
    {
        await ArchiveDaysAsync(40, 31, 29, 1);
        await PolicyAsync(30, null);
        var r = await MaintainAsync();
        r.DroppedByAge.Should().Be(2);
        var days = await DaysAsync();
        days.Should().NotContain(new[] { Today.AddDays(-40), Today.AddDays(-31) });
        days.Should().Contain(new[] { Today.AddDays(-29), Today.AddDays(-1), Today, Today.AddDays(1), Today.AddDays(2) });
        await using var conn = await Db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_archive_run")).Should().Be(2);
        (await conn.ExecuteScalarAsync<DateTime>("SELECT min(window_end) FROM analytics.evidence_archive")).Should().Be(EvidenceArchiveSeed.BoundaryEnd(29, 12));
        (await MaintainAsync()).DroppedByAge.Should().Be(0, "a second pass changes nothing");
    }

    [Fact]
    public async Task A_day_holding_pinned_evidence_survives_both_the_age_and_the_byte_cap()
    {
        var sets = await ArchiveDaysAsync(45, 40, 3);
        await PinAsync(sets[40].EvidenceIds[2]);
        await PolicyAsync(30, null);
        var r = await MaintainAsync();
        r.DroppedByAge.Should().Be(1);
        r.KeptPinned.Should().Be(1);
        (await DaysAsync()).Should().Contain(Today.AddDays(-40)).And.NotContain(Today.AddDays(-45));
        await PolicyAsync(null, 1);
        var c = await MaintainAsync();
        c.DroppedByBytes.Should().Be(1, "the -3 day goes; the pinned -40 day and today / the next days never");
        (await DaysAsync()).Should().Contain(new[] { Today.AddDays(-40), Today }).And.NotContain(Today.AddDays(-3));
        // the pinned day still serves its evidence
        await EvidenceArchiveSeed.SweepLiveAsync(Db, sets[40]);
        await using var conn = await Db.OpenConnectionAsync();
        (await EvidenceArchiveReader.ArtifactAsync(conn, sets[40].EvidenceIds[2], CancellationToken.None)).Should().NotBeNull();
        (await new InvestigationStore(Db).MissingEvidenceAsync(new[] { sets[40].EvidenceIds[1] }, CancellationToken.None))
            .Should().BeEmpty("archived evidence may be referenced by a new investigation");
    }

    [Fact]
    public async Task Over_the_byte_cap_the_oldest_day_goes_first()
    {
        await ArchiveDaysAsync(5, 4, 3);
        await using var conn = await Db.OpenConnectionAsync();
        await MaintainAsync();                                             // today + lookahead exist before the sizes are taken
        long total = 0;
        foreach (var day in await EvidenceArchiveRetention.ExistingDaysAsync(conn))
            total += await conn.ExecuteScalarAsync<long>("SELECT pg_total_relation_size(@n::regclass)", new { n = "analytics." + EvidenceArchiveRetention.PartitionName(day) });
        await PolicyAsync(null, total - 1);
        var r = await MaintainAsync();
        r.DroppedByBytes.Should().Be(1);
        var days = await DaysAsync();
        days.Should().NotContain(Today.AddDays(-5)).And.Contain(new[] { Today.AddDays(-4), Today.AddDays(-3) });
    }

    [Fact]
    public async Task Rollback_and_reapply_are_re_runnable_and_the_archiver_waits_for_cpm19()
    {
        var rollback = PlainCplmDb.RepoFile("scripts", "cpm-19-evidence-archive.rollback.sql");
        await _fx.ApplyAsync(rollback);
        await _fx.ApplyAsync(rollback);
        await using (var conn = await Db.OpenConnectionAsync())
        {
            (await EvidenceArchiveRetention.InstalledAsync(conn)).Should().BeFalse();
            (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM information_schema.columns WHERE table_name = 'retention_policy' AND column_name = 'max_bytes'")).Should().Be(0);
            // the read path answers "not archived", never an error
            (await EvidenceArchiveReader.ArtifactAsync(conn, Guid.NewGuid(), CancellationToken.None)).Should().BeNull();
            (await EvidenceArchiveReader.ForMethodRunAsync(conn, Guid.NewGuid(), CancellationToken.None)).Should().BeEmpty();
        }
        var stats = new EvidenceArchiveStats();
        (await EvidenceArchiveSeed.Archiver(Db, stats).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).Installed.Should().BeFalse();
        stats.Installed.Should().BeFalse();
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-19-evidence-archive.sql"));
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-19-evidence-archive.sql"));
        await using var c2 = await Db.OpenConnectionAsync();
        (await EvidenceArchiveRetention.InstalledAsync(c2)).Should().BeTrue();
        (await c2.ExecuteScalarAsync<int>("SELECT days FROM analytics.retention_policy WHERE record_class = 'EVIDENCE_ARCHIVE'")).Should().Be(30);
    }
}
