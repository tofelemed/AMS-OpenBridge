// CHG-102 Phase 5c - episodes and pins keep archived SETS, not whole days (cpm-20b), on a throwaway PLAIN database:
// a day past retention is dropped, its pinned / episode-overlapped sets move to evidence_archive_kept and are still served
// by method run; an episode closed longer than EVIDENCE_ARCHIVE_EPISODE days ago, or an unpin, releases them; the
// episode-kept packs are capped oldest first and a pinned set never goes by the cap. cpm-20b rollback / re-apply re-run.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class ArchiveKeepCplmDb : PlainCplmDb
{
    public ArchiveKeepCplmDb() : base("cplm_evidence_archive_keep_test") { }
    protected override async Task AfterCpm10bAsync()
    {
        await ApplyAsync(RepoFile("scripts", "cpm-19-evidence-archive.sql"));
        await ApplyAsync(RepoFile("scripts", "cpm-20b-evidence-archive-keep.sql"));
    }
}

[Trait("Category", "Integration")]
public sealed class EvidenceArchiveKeepTests : IClassFixture<ArchiveKeepCplmDb>, IAsyncLifetime
{
    private readonly ArchiveKeepCplmDb _fx;
    private NpgsqlDataSource Db => _fx.Db;
    private const string Loop = "ARCHKEEP_TIC1";
    private const string Other = "ARCHKEEP_FIC2";
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public EvidenceArchiveKeepTests(ArchiveKeepCplmDb fx) => _fx = fx;

    public async Task InitializeAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            DELETE FROM analytics.evidence_manifest; DELETE FROM analytics.evidence_archive_run; DELETE FROM analytics.evidence_archive_kept;
            DELETE FROM analytics.investigation_reference; DELETE FROM analytics.cplm_event_frames;
            UPDATE analytics.retention_policy SET days = 30, max_bytes = 4294967296 WHERE record_class = 'EVIDENCE_ARCHIVE_EPISODE';
            """);
        foreach (var day in await EvidenceArchiveRetention.ExistingDaysAsync(conn))
            await conn.ExecuteAsync($"DROP TABLE analytics.{EvidenceArchiveRetention.PartitionName(day)}");
        await EvidenceArchiveSeed.RegisterLoopAsync(Db, Loop, "keep");
        await EvidenceArchiveSeed.RegisterLoopAsync(Db, Other, "keep");
    }

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>One 12 h set per (loop, days ago), window end 12:00 UTC of that day, all archived with retention off.</summary>
    private async Task<Dictionary<(string, int), SeededSet>> ArchiveAsync(params (string Loop, int DaysAgo)[] sets)
    {
        var map = new Dictionary<(string, int), SeededSet>();
        var seed = 1;
        foreach (var (loop, d) in sets)
            map[(loop, d)] = await EvidenceArchiveSeed.SeedSetAsync(Db, loop, "12h", EvidenceArchiveSeed.BoundaryEnd(d, 12), runs: 1, perRun: 3, seed: seed++);
        await PolicyAsync(null, null);
        (await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(sets.Length);
        foreach (var s in map.Values) await EvidenceArchiveSeed.SweepLiveAsync(Db, s);
        return map;
    }

    private async Task PolicyAsync(int? days, long? maxBytes)
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = @days, max_bytes = @maxBytes WHERE record_class = 'EVIDENCE_ARCHIVE'",
            new { days, maxBytes });
    }

    private async Task EpisodePolicyAsync(int? days, long? maxBytes)
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("UPDATE analytics.retention_policy SET days = @days, max_bytes = @maxBytes WHERE record_class = 'EVIDENCE_ARCHIVE_EPISODE'",
            new { days, maxBytes });
    }

    private Task<ArchiveRetentionResult> MaintainAsync() =>
        EvidenceArchiveRetention.MaintainAsync(Db, DateTime.UtcNow, 2, 5, null, CancellationToken.None);

    /// <summary>An episode of <paramref name="loop"/> from <paramref name="opened"/>, closed at <paramref name="closed"/> (null = open).</summary>
    private async Task<long> EpisodeAsync(string loop, DateTime opened, DateTime? closed)
    {
        await using var conn = await Db.OpenConnectionAsync();
        return await conn.ExecuteScalarAsync<long>("""
            INSERT INTO analytics.cplm_event_frames (loop_id, window_kind, family, opened_at, closed_at, peak_diagnosis)
            VALUES (@loop, '12h', 'OSCILLATION', @opened, @closed, 'SUSPECTED') RETURNING id
            """, new { loop, opened, closed });
    }

    private async Task<Guid> PinAsync(Guid evidenceId)
    {
        var id = Guid.NewGuid();
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("INSERT INTO analytics.investigation_reference (ref_id, loop_id, evidence_ids, note) VALUES (@id, @loop, @ids, 'keep')",
            new { id, loop = Loop, ids = new[] { evidenceId } });
        return id;
    }

    private async Task<ArchivedArtifact?> ServedAsync(SeededSet s, int artifact = 0)
    {
        await using var conn = await Db.OpenConnectionAsync();
        return await EvidenceArchiveReader.ArtifactAsync(conn, s.EvidenceIds[artifact], CancellationToken.None);
    }

    private async Task<(int Kept, int Runs)> CountsAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        return (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_archive_kept"),
                await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_archive_run"));
    }

    [Fact]
    public async Task Only_the_overlapped_and_pinned_sets_outlive_their_dropped_day()
    {
        var sets = await ArchiveAsync((Loop, 40), (Other, 40), (Loop, 45), (Other, 45), (Loop, 3));
        var end40 = EvidenceArchiveSeed.BoundaryEnd(40, 12);
        await EpisodeAsync(Loop, end40.AddHours(-3), end40.AddDays(2));        // overlaps Loop's -40 set; closed 38 days ago
        await EpisodePolicyAsync(null, null);                                 // episodes keep while the frame exists
        await PinAsync(sets[(Other, 45)].EvidenceIds[1]);
        await PolicyAsync(30, null);

        var r = await MaintainAsync();
        r.DroppedByAge.Should().Be(2, "both old days are dropped - no whole day is kept any more");
        r.KeptPinned.Should().Be(0);
        r.Keep!.Moved.Should().Be(2);
        r.Keep.Kept.Should().Be(2);
        (await EvidenceArchiveRetention.ExistingDaysAsync(await Db.OpenConnectionAsync()))
            .Should().NotContain(new[] { Today.AddDays(-40), Today.AddDays(-45) });

        (await ServedAsync(sets[(Loop, 40)])).Should().NotBeNull("the episode keeps the set it overlaps");
        (await ServedAsync(sets[(Other, 45)], 2)).Should().NotBeNull("a pin keeps its whole set");
        (await ServedAsync(sets[(Other, 40)])).Should().BeNull("same day, no episode, no pin: gone with the day");
        (await ServedAsync(sets[(Loop, 45)])).Should().BeNull("the episode did not overlap it");
        (await ServedAsync(sets[(Loop, 3)])).Should().NotBeNull();
        await using (var conn = await Db.OpenConnectionAsync())
            (await EvidenceArchiveReader.ForMethodRunAsync(conn, sets[(Loop, 40)].MethodRuns[0], CancellationToken.None)).Should().HaveCount(3);
        (await CountsAsync()).Should().Be((2, 3));

        var again = await MaintainAsync();
        again.Keep!.Moved.Should().Be(0);
        again.Keep.Released.Should().Be(0, "a second pass changes nothing");
    }

    [Fact]
    public async Task An_episode_closed_past_its_keep_or_an_unpin_releases_the_set()
    {
        var sets = await ArchiveAsync((Loop, 40), (Other, 41));
        var end40 = EvidenceArchiveSeed.BoundaryEnd(40, 12);
        var frame = await EpisodeAsync(Loop, end40.AddHours(-1), null);       // still open
        var pin = await PinAsync(sets[(Other, 41)].EvidenceIds[0]);
        await PolicyAsync(30, null);
        (await MaintainAsync()).Keep!.Kept.Should().Be(2);

        await using (var conn = await Db.OpenConnectionAsync())
        {
            await conn.ExecuteAsync("UPDATE analytics.cplm_event_frames SET closed_at = now() - interval '31 days' WHERE id = @frame", new { frame });
            await conn.ExecuteAsync("UPDATE analytics.investigation_reference SET pinned = FALSE WHERE ref_id = @pin", new { pin });
        }
        var r = await MaintainAsync();
        r.Keep!.Released.Should().Be(2, "closed 31 d ago with a 30 d keep, and unpinned");
        (await CountsAsync()).Should().Be((0, 0), "the kept run rows go with their packs");
        (await ServedAsync(sets[(Loop, 40)])).Should().BeNull();
    }

    [Fact]
    public async Task The_episode_cap_releases_the_oldest_episode_sets_and_never_a_pinned_one()
    {
        var sets = await ArchiveAsync((Loop, 50), (Loop, 45), (Loop, 40), (Other, 55));
        await EpisodeAsync(Loop, EvidenceArchiveSeed.BoundaryEnd(51), null);   // open across all three Loop sets
        await PinAsync(sets[(Other, 55)].EvidenceIds[0]);
        await PolicyAsync(30, null);
        (await MaintainAsync()).Keep!.Kept.Should().Be(4);

        long one;
        await using (var conn = await Db.OpenConnectionAsync())
            one = await conn.ExecuteScalarAsync<long>("SELECT max(payload_bytes) FROM analytics.evidence_archive_kept WHERE loop_id = @l", new { l = Loop });
        await EpisodePolicyAsync(30, one + 1);                                 // room for one episode pack
        var r = await MaintainAsync();
        r.Keep!.ReleasedByBytes.Should().Be(2);
        (await ServedAsync(sets[(Loop, 50)])).Should().BeNull("oldest first");
        (await ServedAsync(sets[(Loop, 45)])).Should().BeNull();
        (await ServedAsync(sets[(Loop, 40)])).Should().NotBeNull();
        (await ServedAsync(sets[(Other, 55)])).Should().NotBeNull("the cap never releases a pinned set, however old");
    }

    [Fact]
    public async Task Zero_episode_days_keeps_nothing_for_episodes_and_the_rollback_restores_the_cpm19_day_keep()
    {
        var sets = await ArchiveAsync((Loop, 40), (Other, 40));
        await EpisodeAsync(Loop, EvidenceArchiveSeed.BoundaryEnd(41), null);
        await EpisodePolicyAsync(0, null);
        await PolicyAsync(30, null);
        (await MaintainAsync()).Keep!.Moved.Should().Be(0);
        (await ServedAsync(sets[(Loop, 40)])).Should().BeNull();

        var rollback = PlainCplmDb.RepoFile("scripts", "cpm-20b-evidence-archive-keep.rollback.sql");
        await _fx.ApplyAsync(rollback);
        await _fx.ApplyAsync(rollback);
        try
        {
            await using (var conn = await Db.OpenConnectionAsync())
                (await EvidenceArchiveKeep.InstalledAsync(conn)).Should().BeFalse();
            var again = await ArchiveAsync((Loop, 42));
            await PinAsync(again[(Loop, 42)].EvidenceIds[0]);
            await PolicyAsync(30, null);
            var r = await MaintainAsync();
            r.Keep.Should().BeNull();
            r.KeptPinned.Should().Be(1, "without cpm-20b a pinned day is kept whole, as before");
        }
        finally
        {
            await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-20b-evidence-archive-keep.sql"));
            await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-20b-evidence-archive-keep.sql"));
        }
    }
}
