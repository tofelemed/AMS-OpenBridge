// v2.5 Task 2C.2 (spec §3.3; NR-034, NR-060) — the immutable evidence API on the lab traverse_cplm:
// a method run resolves from ANY tier's row (short, long, fused) or a response event; the manifest
// carries a stable ETag (If-None-Match -> 304) and a readiness summary; chunks are served as bytes
// with the chunk's SHA-256 as ETag and immutable caching; PENDING -> 409, EXPIRED -> 404 with the
// reason, a site outside X-Auth-Sites -> 403.
using System.Security.Cryptography;
using System.Text;
using Dapper;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Traverse.CplmApi.Controllers;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

[Trait("Category", "Integration")]
[Collection("instrument-bindings-lab")]                    // mutates cpm.loop_registry: serialised with the other registry-touching lab tests
public sealed class EvidenceApiTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid(), _complete = Guid.NewGuid(), _pending = Guid.NewGuid(), _expired = Guid.NewGuid();
    private readonly string _loop = "EVAPI_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    private static readonly byte[] Chunk0 = { 1, 2, 3, 4, 5 }, Chunk1 = { 9, 8, 7 };

    private static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO cpm.loop_registry (loop_id, display_name, loop_type, site, area, unit, monitoring)
            VALUES (@loop, 'evidence api probe', 'FIC', 'hdpe', 'section_100', 'u1001', '{"enabled": false}'::jsonb)
            ON CONFLICT (loop_id) DO NOTHING
            """, new { loop = _loop });
        // a SHORT tier row that carries the run under G3
        await conn.ExecuteAsync("""
            INSERT INTO analytics.cplm_short_feature_results (loop_id, window_kind, window_start, window_end, sample_count, payload, source, method_run_ids, bundle_hash)
            VALUES (@loop, '60m', NOW() - interval '1 hour', NOW(), 720, '{"gate3_status":"WARN","loop_id":"x"}'::jsonb, 'flink', jsonb_build_object('G3', @run::text), 'b:test')
            """, new { loop = _loop, run = _run });
        foreach (var (id, readiness, chunks) in new[] { (_complete, "COMPLETE", 2), (_pending, "PENDING", 2), (_expired, "EXPIRED", 0) })
        {
            var all = EvidenceChunkerBytes();
            await conn.ExecuteAsync("""
                INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, role_or_path, x_quantity, x_unit, y_quantity, y_unit,
                    data_type, columns, encoding, calculation_samples, display_points, chunk_count, total_bytes, sha256, chunk_sha256, readiness, provenance)
                VALUES (@id, @run, 'G3', 'objective_error', 'ERROR', 'sample_time', 'ms_epoch', 'error', 'EU',
                    'f64', '["x","y","mask"]'::jsonb, 'f64le+gzip', 720, 720, 2, @total, @sha, @chunkShas::jsonb, @readiness,
                    jsonb_build_object('loop_id', @loop, 'window_kind', '60m'))
                """, new { id, run = _run, total = (long)all.Length, sha = Sha(all), chunkShas = $"[\"{Sha(Chunk0)}\",\"{Sha(Chunk1)}\"]", readiness, loop = _loop });
            if (chunks == 2)
            {
                await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 5, @s, @p)", new { id, s = Sha(Chunk0), p = Chunk0 });
                if (readiness == "COMPLETE")
                    await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 1, 3, @s, @p)", new { id, s = Sha(Chunk1), p = Chunk1 });
            }
        }
    }

    private static byte[] EvidenceChunkerBytes() => Chunk0.Concat(Chunk1).ToArray();

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
        await conn.ExecuteAsync("DELETE FROM analytics.cplm_short_feature_results WHERE loop_id = @loop", new { loop = _loop });
        await conn.ExecuteAsync("DELETE FROM analytics.analysis_run WHERE loop_id = @loop", new { loop = _loop });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_registry WHERE loop_id = @loop", new { loop = _loop });
        await _db.DisposeAsync();
    }

    private static T WithRequest<T>(T controller, params (string name, string value)[] headers) where T : ControllerBase
    {
        var http = new DefaultHttpContext();
        foreach (var (name, value) in headers) http.Request.Headers[name] = value;
        controller.ControllerContext = new ControllerContext { HttpContext = http };
        return controller;
    }

    private CpmMethodRunsController Runs(params (string, string)[] headers) =>
        WithRequest(new CpmMethodRunsController(_db, new MethodRunResolver(_db)), headers);

    private CpmEvidenceController Evidence(params (string, string)[] headers) =>
        WithRequest(new CpmEvidenceController(_db, new PostgresEvidenceBlobStore(_db)), headers);

    [Fact]
    public async Task A_method_run_resolves_from_a_short_tier_row()
    {
        var res = await Runs().GetMethodRun(_run, CancellationToken.None);
        var ok = res.Should().BeOfType<OkObjectResult>().Subject;
        var json = System.Text.Json.JsonSerializer.SerializeToElement(ok.Value);
        json.GetProperty("tier").GetString().Should().Be("short");
        json.GetProperty("gate").GetString().Should().Be("G3");
        json.GetProperty("loopId").GetString().Should().Be(_loop);
        json.GetProperty("identity").GetProperty("bundleHash").GetString().Should().Be("b:test");
    }

    [Fact]
    public async Task The_manifest_has_a_stable_etag_and_a_readiness_summary_and_honours_if_none_match()
    {
        var first = (await Runs().GetEvidence(_run, CancellationToken.None)).Should().BeOfType<OkObjectResult>().Subject;
        var json = System.Text.Json.JsonSerializer.SerializeToElement(first.Value);
        json.GetProperty("count").GetInt32().Should().Be(3);
        json.GetProperty("readiness").GetString().Should().Be("PENDING", "one artifact is still pending");
        json.GetProperty("reconstructable").GetBoolean().Should().BeTrue();
        var etag = json.GetProperty("etag").GetString()!;
        etag.Should().StartWith("\"");
        var second = (await Runs().GetEvidence(_run, CancellationToken.None)).Should().BeOfType<OkObjectResult>().Subject;
        System.Text.Json.JsonSerializer.SerializeToElement(second.Value).GetProperty("etag").GetString().Should().Be(etag, "the ETag is a function of the manifest, not of the clock");
        var notModified = await Runs(("If-None-Match", etag)).GetEvidence(_run, CancellationToken.None);
        notModified.Should().BeOfType<StatusCodeResult>().Which.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    [Fact]
    public async Task A_complete_chunk_is_served_as_immutable_bytes_with_its_sha_as_etag()
    {
        var ctl = Evidence();
        var res = await ctl.GetChunk(_complete, 1, CancellationToken.None);
        var file = res.Should().BeOfType<FileContentResult>().Subject;
        file.FileContents.Should().Equal(Chunk1);
        file.ContentType.Should().Be("application/octet-stream");
        file.EntityTag!.Tag.ToString().Should().Be($"\"{Sha(Chunk1)}\"");
        ctl.Response.Headers["Cache-Control"].ToString().Should().Contain("immutable");
        ctl.Response.Headers["X-Evidence-Chunk"].ToString().Should().Be("1/2");
        var cached = await Evidence(("If-None-Match", $"\"{Sha(Chunk1)}\"")).GetChunk(_complete, 1, CancellationToken.None);
        cached.Should().BeOfType<StatusCodeResult>().Which.StatusCode.Should().Be(StatusCodes.Status304NotModified);
    }

    [Fact]
    public async Task Pending_is_409_expired_is_404_with_the_reason_and_a_missing_chunk_is_404()
    {
        var pending = await Evidence().GetChunk(_pending, 0, CancellationToken.None);
        pending.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status409Conflict);
        var expired = await Evidence().GetChunk(_expired, 0, CancellationToken.None);
        var nf = expired.Should().BeOfType<NotFoundObjectResult>().Subject;
        System.Text.Json.JsonSerializer.SerializeToElement(nf.Value).GetProperty("error").GetString().Should().Be("EVIDENCE_EXPIRED");
        var missing = await Evidence().GetChunk(_complete, 7, CancellationToken.None);
        missing.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task A_site_outside_the_callers_scope_is_forbidden_and_inside_is_served()
    {
        var forbidden = await Evidence(("X-Auth-Sites", "other_site,another")).GetChunk(_complete, 0, CancellationToken.None);
        forbidden.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
        var allowed = await Evidence(("X-Auth-Sites", "hdpe,other")).GetChunk(_complete, 0, CancellationToken.None);
        allowed.Should().BeOfType<FileContentResult>();
        var manifestForbidden = await Runs(("X-Auth-Sites", "other_site")).GetEvidence(_run, CancellationToken.None);
        manifestForbidden.Should().BeOfType<ObjectResult>().Which.StatusCode.Should().Be(StatusCodes.Status403Forbidden);
    }

    [Fact]
    public async Task A_redelivered_manifest_revives_an_expired_artifact_so_reconstruction_can_complete_it()
    {
        // NR-060: after retention the manifest is EXPIRED with no chunks; a reconstruction re-emits the SAME
        // artifact (same evidence id). The store must take it back to PENDING and let the new chunks complete it.
        var store = new PostgresEvidenceBlobStore(_db);
        var manifest = System.Text.Json.JsonSerializer.SerializeToElement(new Dictionary<string, object?>
        {
            ["evidence_id"] = _expired.ToString(), ["method_run_id"] = _run.ToString(), ["gate_id"] = "G3", ["artifact_kind"] = "objective_error",
            ["role_or_path"] = "ERROR", ["x_quantity"] = "sample_time", ["x_unit"] = "ms_epoch", ["y_quantity"] = "error", ["y_unit"] = "EU",
            ["data_type"] = "f64", ["columns"] = new[] { "x", "y", "mask" }, ["encoding"] = "f64le+gzip", ["calculation_samples"] = 720,
            ["display_points"] = 720, ["chunk_count"] = 2, ["total_bytes"] = (long)EvidenceChunkerBytes().Length, ["sha256"] = Sha(EvidenceChunkerBytes()),
            ["chunk_sha256"] = new[] { Sha(Chunk0), Sha(Chunk1) },
            ["provenance"] = new Dictionary<string, object?> { ["loop_id"] = _loop, ["window_kind"] = "60m", ["purpose"] = "EVIDENCE_RECONSTRUCTION" },
        });
        await store.UpsertManifestAsync(manifest, CancellationToken.None);
        var revived = await store.GetManifestAsync(_expired, CancellationToken.None);
        revived!.Readiness.Should().Be("PENDING", "an EXPIRED manifest re-delivered by a reconstruction is live again");
        (await store.GetChunksAsync(_expired, CancellationToken.None)).Should().BeEmpty();
        (await store.PutChunkAsync(_expired, 0, Sha(Chunk0), Chunk0, CancellationToken.None)).Should().BeTrue();
        (await store.PutChunkAsync(_expired, 1, Sha(Chunk1), Chunk1, CancellationToken.None)).Should().BeTrue();
        await store.SetReadinessAsync(_expired, "COMPLETE", null, CancellationToken.None);
        (await store.GetManifestAsync(_expired, CancellationToken.None))!.Readiness.Should().Be("COMPLETE");
        var served = await Evidence().GetChunk(_expired, 1, CancellationToken.None);
        served.Should().BeOfType<FileContentResult>().Which.FileContents.Should().Equal(Chunk1);
        // a COMPLETE manifest re-delivered (a duplicate) is left alone
        await store.UpsertManifestAsync(manifest, CancellationToken.None);
        (await store.GetManifestAsync(_expired, CancellationToken.None))!.Readiness.Should().Be("COMPLETE");
    }

    [Fact]
    public async Task The_resolver_names_the_support_and_tier_for_reconstruction_and_refuses_G12()
    {
        var resolver = new MethodRunResolver(_db);
        var loc = await resolver.ResolveAsync(_run, CancellationToken.None);
        loc.Should().NotBeNull();
        loc!.Tier.Should().Be("short");
        loc.Gate.Should().Be("G3");
        loc.WindowKind.Should().Be("60m");
        (loc.ToMs - loc.FromMs).Should().BeCloseTo(3_600_000L, 5_000L);
        loc.Site.Should().Be("hdpe");
        MethodRunResolver.ReconstructionTier("G12").Should().BeNull("G12 evidence is event-keyed and owned by the response job");
        MethodRunResolver.ReconstructionTier("G9").Should().Be("long");
    }
}
