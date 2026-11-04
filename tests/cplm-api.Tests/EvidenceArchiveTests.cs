// CHG-102 Phase 5b-1 - the evidence boundary archive on a throwaway PLAIN database (migration/schema/03 + cpm-10b + cpm-19,
// which must be a no-op on top of the fresh install). A boundary set stored like the consumer stores it is packed by the
// archiver, its live rows are swept, and the manifest, the bundle and every chunk are served from the archive byte for
// byte (same artifact JSON, same ETag, same SHA-256); a second pass changes nothing; FINDING evidence and unsettled sets
// are not archived; an incomplete artifact is counted missing. Never touches the lab's traverse_cplm.
using System.Text.Json;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;
using Xunit.Abstractions;

namespace Traverse.CplmApi.Tests;

public sealed class ArchiveCplmDb : PlainCplmDb
{
    public ArchiveCplmDb() : base("cplm_evidence_archive_test") { }
    protected override Task AfterCpm10bAsync() => ApplyAsync(RepoFile("scripts", "cpm-19-evidence-archive.sql"));   // must be a no-op
}

[Trait("Category", "Integration")]
public sealed class EvidenceArchiveTests : IClassFixture<ArchiveCplmDb>, IAsyncLifetime
{
    private readonly ArchiveCplmDb _fx;
    private readonly ITestOutputHelper _out;
    private NpgsqlDataSource Db => _fx.Db;
    private const string Site = "arch";

    public EvidenceArchiveTests(ArchiveCplmDb fx, ITestOutputHelper output) { _fx = fx; _out = output; }

    public async Task InitializeAsync()
    {
        await using var conn = await Db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest; DELETE FROM analytics.evidence_archive_run; DELETE FROM analytics.evidence_archive;");
        await EvidenceArchiveSeed.RegisterLoopAsync(Db, "ARCH_FIC100", Site);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private static T With<T>(T c, params (string, string)[] headers) where T : ControllerBase
    {
        var http = new DefaultHttpContext();
        foreach (var (k, v) in headers) http.Request.Headers[k] = v;
        c.ControllerContext = new ControllerContext { HttpContext = http };
        return c;
    }

    private async Task<(string Artifacts, string Etag, string Source, byte[] Bundle)> ReadRunAsync(Guid run)
    {
        await using var conn = await Db.OpenConnectionAsync();
        var reader = new EvidenceManifestReader(new MethodRunResolver(Db));
        var site = await reader.SiteOfAsync(conn, run, CancellationToken.None);
        site.Should().Be(Site);
        var m = await reader.ReadAsync(conn, run, site, CancellationToken.None);
        var json = JsonSerializer.SerializeToElement(m.ToResponse());
        var bundle = await EvidenceManifestReader.BundleAsync(conn, m, CancellationToken.None);
        return (json.GetProperty("artifacts").GetRawText(), m.Etag, json.GetProperty("source").GetString()!, bundle);
    }

    private async Task<FileContentResult> ChunkAsync(Guid evidenceId, int n)
    {
        var res = await With(new CpmEvidenceController(Db, new PostgresEvidenceBlobStore(Db))).GetChunk(evidenceId, n, CancellationToken.None);
        return res.Should().BeOfType<FileContentResult>().Subject;
    }

    [Fact]
    public async Task Cpm19_on_the_fresh_install_is_a_no_op_and_ships_the_retention_row()
    {
        await _fx.ApplyAsync(PlainCplmDb.RepoFile("scripts", "cpm-19-evidence-archive.sql"));        // a third time: still fine
        await using var conn = await Db.OpenConnectionAsync();
        var row = await conn.QuerySingleAsync("SELECT days, max_bytes FROM analytics.retention_policy WHERE record_class = 'EVIDENCE_ARCHIVE'");
        ((int)row.days).Should().Be(30);
        ((long)row.max_bytes).Should().Be(12L * 1024 * 1024 * 1024);
        (await conn.ExecuteScalarAsync<string>("SELECT relkind::text FROM pg_class WHERE oid = 'analytics.evidence_archive'::regclass")).Should().Be("p");
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM pg_indexes WHERE indexname = 'ix_evidence_manifest_boundary_set'")).Should().Be(1);
    }

    [Fact]
    public async Task A_swept_boundary_set_is_served_from_the_archive_byte_for_byte()
    {
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddMinutes(-30), runs: 2, perRun: 3);
        var before = new Dictionary<Guid, (string, string, string, byte[])>();
        foreach (var run in set.MethodRuns) before[run] = await ReadRunAsync(run);
        var chunksBefore = new Dictionary<(Guid, int), (byte[] Bytes, string Sha)>();
        foreach (var id in set.EvidenceIds)
            for (var n = 0; ; n++)
            {
                var res = await With(new CpmEvidenceController(Db, new PostgresEvidenceBlobStore(Db))).GetChunk(id, n, CancellationToken.None);
                if (res is not FileContentResult f) break;
                chunksBefore[(id, n)] = (f.FileContents, f.EntityTag!.Tag.ToString());
            }
        chunksBefore.Count.Should().BeGreaterThan(set.EvidenceIds.Length, "the artifacts span several chunks");

        var stats = new EvidenceArchiveStats();
        var pass = await EvidenceArchiveSeed.Archiver(Db, stats).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.SetsArchived.Should().Be(1);
        pass.ArtifactsArchived.Should().Be(6);
        pass.MissingArtifacts.Should().Be(0);
        stats.ArchivedSets.Should().Be(1);

        await EvidenceArchiveSeed.SweepLiveAsync(Db, set);
        foreach (var run in set.MethodRuns)
        {
            var after = await ReadRunAsync(run);
            after.Source.Should().Be("ARCHIVE");
            before[run].Item3.Should().Be("LIVE");
            after.Artifacts.Should().Be(before[run].Item1, "the archived artifact JSON is exactly what the live rows produced");
            after.Etag.Should().Be(before[run].Item2, "a browser-cached manifest stays valid");
            after.Bundle.Should().Equal(before[run].Item4, "the bundle frames the original chunk bytes");
        }
        foreach (var ((id, n), (bytes, tag)) in chunksBefore)
        {
            var f = await ChunkAsync(id, n);
            f.FileContents.Should().Equal(bytes);
            f.EntityTag!.Tag.ToString().Should().Be(tag);
            EvidenceArchiveSeed.Sha(f.FileContents).Should().Be(tag.Trim('"'));
        }
        // the whole artifact (chunks concatenated) still verifies against the manifest's SHA-256
        await using var conn = await Db.OpenConnectionAsync();
        var shas = await conn.ExecuteScalarAsync<string[]>("SELECT artifact_sha256 FROM analytics.evidence_archive_run WHERE boundary_set_id = @s", new { s = set.SetId });
        for (var i = 0; i < set.EvidenceIds.Length; i++)
        {
            var id = (await conn.ExecuteScalarAsync<Guid[]>("SELECT evidence_ids FROM analytics.evidence_archive_run WHERE boundary_set_id = @s", new { s = set.SetId }))![i];
            var whole = chunksBefore.Where(kv => kv.Key.Item1 == id).OrderBy(kv => kv.Key.Item2).SelectMany(kv => kv.Value.Bytes).ToArray();
            EvidenceArchiveSeed.Sha(whole).Should().Be(shas![i]);
        }
    }

    [Fact]
    public async Task An_unpacked_set_is_served_from_memory_and_a_dropped_set_is_never_served()
    {
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddMinutes(-30), runs: 1, perRun: 3);
        (await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(1);
        await EvidenceArchiveSeed.SweepLiveAsync(Db, set);
        await using var conn = await Db.OpenConnectionAsync();
        var first = await EvidenceArchiveReader.ForMethodRunAsync(conn, set.MethodRuns[0], CancellationToken.None);
        first.Should().HaveCount(3);
        // the pack row gone but the run row kept: only a cached copy can still answer
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_archive WHERE boundary_set_id = @s", new { s = set.SetId });
        (await EvidenceArchiveReader.ForMethodRunAsync(conn, set.MethodRuns[0], CancellationToken.None)).Should().HaveCount(3, "served from the unpacked-set cache");
        (await EvidenceArchiveReader.ArtifactAsync(conn, set.EvidenceIds[1], CancellationToken.None)).Should().NotBeNull("the chunk route shares it");
        // retention removes the run row with the partition: the set is not found any more, the cache is never reached
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_archive_run WHERE boundary_set_id = @s", new { s = set.SetId });
        (await EvidenceArchiveReader.ForMethodRunAsync(conn, set.MethodRuns[0], CancellationToken.None)).Should().BeEmpty();
    }

    [Fact]
    public async Task A_rebuild_stored_beside_a_swept_run_does_not_hide_its_archived_proof()
    {
        // CHG-102 E2E 2026-11-04: an EVALUATE (or "Reconstruct evidence") of a window whose live rows were swept stores its
        // artifacts beside the run under the same method_run_id; the reader counted them and never fell back to the archive
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddMinutes(-30), runs: 1, perRun: 3);
        var run = set.MethodRuns[0];
        var before = await ReadRunAsync(run);
        (await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(1);
        await EvidenceArchiveSeed.SweepLiveAsync(Db, set);

        var analysisRun = Guid.NewGuid();
        await using (var conn = await Db.OpenConnectionAsync())
            await conn.ExecuteAsync("""
                INSERT INTO analytics.analysis_run (analysis_run_id, loop_id, purpose, state, created_by, manifest)
                VALUES (@id, 'ARCH_FIC100', 'EVIDENCE_RECONSTRUCTION', 'FINISHED', 'test', '{}'::jsonb)
                """, new { id = analysisRun });
        var bytes = EvidenceArchiveSeed.ArtifactBytes(300, 2, 777);
        var rebuilt = JsonSerializer.SerializeToElement(new Dictionary<string, object?>
        {
            ["evidence_id"] = set.EvidenceIds[0].ToString(), ["method_run_id"] = run.ToString(), ["gate_id"] = "G9",
            ["artifact_kind"] = "kind_0", ["role_or_path"] = "PV", ["data_type"] = "f64", ["columns"] = new[] { "x", "y" },
            ["encoding"] = "f64le+gzip", ["calculation_samples"] = 300, ["display_points"] = 300, ["chunk_count"] = 1,
            ["total_bytes"] = bytes.Length, ["sha256"] = EvidenceArchiveSeed.Sha(bytes), ["chunk_sha256"] = new[] { EvidenceArchiveSeed.Sha(bytes) },
            ["provenance"] = new Dictionary<string, object?> { ["purpose"] = "EVIDENCE_RECONSTRUCTION", ["analysis_run_id"] = analysisRun.ToString() },
        });
        (await new PostgresEvidenceBlobStore(Db).UpsertManifestAsync(rebuilt, CancellationToken.None)).Should().NotBeNull("stored beside the swept original");

        var after = await ReadRunAsync(run);
        after.Source.Should().Be("ARCHIVE", "the run's own rows are gone: its archived proof is served, not the rebuild");
        after.Artifacts.Should().Be(before.Artifacts);
        after.Bundle.Should().Equal(before.Bundle);
        await using var c2 = await Db.OpenConnectionAsync();
        var reader = new EvidenceManifestReader(new MethodRunResolver(Db));
        var m = await reader.ReadAsync(c2, run, Site, CancellationToken.None);
        JsonSerializer.SerializeToElement(m.ToResponse()).GetProperty("reconstructions").GetArrayLength().Should().Be(1, "the rebuild stays listed beside the proof");
    }

    [Fact]
    public async Task A_second_pass_changes_nothing_and_the_set_is_listed_for_its_loop()
    {
        var end = EvidenceArchiveSeed.BoundaryEnd(1, 12);
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "24h", end);
        var archiver = EvidenceArchiveSeed.Archiver(Db);
        (await archiver.RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(1);
        (await archiver.RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(0);
        (await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).SetsArchived.Should().Be(0, "a new process finds the run row");
        await using var conn = await Db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_archive")).Should().Be(1);
        (await conn.ExecuteScalarAsync<string>("SELECT tableoid::regclass::text FROM analytics.evidence_archive"))
            .Should().Be("analytics." + EvidenceArchiveRetention.PartitionName(DateOnly.FromDateTime(end)));

        var res = await With(new CpmEvidenceArchiveController(Db)).List("arch_fic100", null, null, "24h");
        var json = JsonSerializer.SerializeToElement(res.Should().BeOfType<OkObjectResult>().Subject.Value);
        json.GetProperty("count").GetInt32().Should().Be(1);
        var s = json.GetProperty("sets")[0];
        s.GetProperty("boundarySetId").GetGuid().Should().Be(set.SetId);
        s.GetProperty("plantTz").GetString().Should().Be("Asia/Tehran");
        s.GetProperty("artifactCount").GetInt32().Should().Be(6);
        s.GetProperty("methodRunIds").EnumerateArray().Select(x => x.GetGuid()).Should().BeEquivalentTo(set.MethodRuns);
        var none = await With(new CpmEvidenceArchiveController(Db)).List("ARCH_FIC100", null, null, "12h");
        JsonSerializer.SerializeToElement(((OkObjectResult)none).Value).GetProperty("count").GetInt32().Should().Be(0);
        (await With(new CpmEvidenceArchiveController(Db), ("X-Auth-Sites", "other")).List("ARCH_FIC100"))
            .Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task Finding_evidence_and_unsettled_sets_are_not_archived()
    {
        await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddHours(-2), emissionReason: "FINDING");
        var fresh = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddMinutes(-5));
        var pass = await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.SetsArchived.Should().Be(0);
        pass.Pending.Should().Be(1, "the boundary set 5 min after its window end waits for the settle time");
        var later = await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow.AddMinutes(15), CancellationToken.None);
        later.SetsArchived.Should().Be(1);
        await using var conn = await Db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<Guid>("SELECT boundary_set_id FROM analytics.evidence_archive_run")).Should().Be(fresh.SetId);
    }

    [Fact]
    public async Task An_incomplete_artifact_is_counted_missing_and_the_rest_is_archived()
    {
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddHours(-1), incomplete: 1);
        var pass = await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.ArtifactsArchived.Should().Be(5);
        pass.MissingArtifacts.Should().Be(1);
        await using var conn = await Db.OpenConnectionAsync();
        var r = await conn.QuerySingleAsync("SELECT artifact_count, missing_count, evidence_ids FROM analytics.evidence_archive_run WHERE boundary_set_id = @s", new { s = set.SetId });
        ((int)r.artifact_count).Should().Be(5);
        ((int)r.missing_count).Should().Be(1);
        ((Guid[])r.evidence_ids).Should().NotContain(set.EvidenceIds[0]);
    }

    [Fact]
    public async Task A_set_the_sweep_deletes_before_it_settles_is_counted_lost()
    {
        var stats = new EvidenceArchiveStats();
        var archiver = EvidenceArchiveSeed.Archiver(Db, stats);
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddMinutes(-2));
        (await archiver.RunOnceAsync(DateTime.UtcNow, CancellationToken.None)).Pending.Should().Be(1);
        await EvidenceArchiveSeed.SweepLiveAsync(Db, set);
        var pass = await archiver.RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.Lost.Should().Be(1);
        stats.LostToSweep.Should().Be(1);
    }

    [Fact]
    public async Task Pack_size_on_a_realistic_set()
    {
        // 5 method runs x 10 artifacts (about the 50 artifacts of a 12 h boundary window), one chunk each as the plant's are
        var set = await EvidenceArchiveSeed.SeedSetAsync(Db, "ARCH_FIC100", "12h", DateTime.UtcNow.AddHours(-1), runs: 5, perRun: 10, chunkSize: 1 << 20, seed: 7);
        await using var conn = await Db.OpenConnectionAsync();
        var live = await conn.ExecuteScalarAsync<long>("""
            SELECT (SELECT sum(pg_column_size(m.*)) FROM analytics.evidence_manifest m WHERE evidence_id = ANY(@ids))
                 + (SELECT sum(pg_column_size(c.*)) FROM analytics.evidence_chunk c WHERE evidence_id = ANY(@ids))
            """, new { ids = set.EvidenceIds });
        var pass = await EvidenceArchiveSeed.Archiver(Db).RunOnceAsync(DateTime.UtcNow, CancellationToken.None);
        pass.ArtifactsArchived.Should().Be(50);
        var stored = await conn.ExecuteScalarAsync<long>("SELECT pg_column_size(payload) FROM analytics.evidence_archive WHERE boundary_set_id = @s", new { s = set.SetId });
        _out.WriteLine($"50 artifacts: chunk bytes {set.ChunkBytes}, live row bytes (tuples only, before index / TOAST page overhead) {live}, " +
                       $"pack {pass.PackBytes} (stored {stored}); pack - chunks = {pass.PackBytes - set.ChunkBytes} B ({(pass.PackBytes - set.ChunkBytes) / 50.0:F0} B per artifact)");
        pass.PackBytes.Should().BeLessThan(set.ChunkBytes + 50 * 400, "the manifests cost a few hundred bytes per artifact, not ~2 KB");
        stored.Should().BeLessOrEqualTo(pass.PackBytes + 8, "STORAGE EXTERNAL: no second compression attempt");
    }
}
