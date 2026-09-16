// v2.5 Task 2D.2 (spec §3.4, R24; NR-062) - investigations on the lab traverse_cplm: a reference pins
// its evidence (the retention sweeper leaves pinned manifests alone), its outcome defaults to
// INCONCLUSIVE and is changed only by a person ("work completed" is not "performance restored"),
// and unknown evidence is refused rather than recorded.
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
[Collection("instrument-bindings-lab")]
public sealed class InvestigationsApiTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private readonly Guid _run = Guid.NewGuid(), _old = Guid.NewGuid();
    private readonly string _loop = "INV_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("""
            INSERT INTO analytics.evidence_manifest (evidence_id, method_run_id, gate_id, artifact_kind, chunk_count, total_bytes, sha256, readiness, pinned, created_at, provenance)
            VALUES (@id, @run, 'G5', 'acf_series', 1, 3, 'x', 'COMPLETE', false, NOW() - make_interval(days => 120), jsonb_build_object('loop_id', @loop))
            """, new { id = _old, run = _run, loop = _loop });
        await conn.ExecuteAsync("INSERT INTO analytics.evidence_chunk (evidence_id, chunk_no, byte_length, sha256, payload) VALUES (@id, 0, 3, 'x', @p)",
            new { id = _old, p = new byte[] { 1, 2, 3 } });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM analytics.investigation_reference WHERE loop_id = @loop", new { loop = _loop });
        await conn.ExecuteAsync("DELETE FROM analytics.evidence_manifest WHERE method_run_id = @run", new { run = _run });
        await _db.DisposeAsync();
    }

    private CpmInvestigationsController Controller(string user = "engineer.a")
    {
        var http = new DefaultHttpContext();
        http.Request.Headers["X-Auth-User"] = user;
        return new CpmInvestigationsController(new InvestigationStore(_db)) { ControllerContext = new ControllerContext { HttpContext = http } };
    }

    [Fact]
    public async Task An_investigation_pins_its_evidence_and_the_sweeper_leaves_it_alone()
    {
        var res = await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, _run, new[] { _old }, "valve overhauled 16 Sep", null), CancellationToken.None);
        var created = res.Should().BeOfType<CreatedResult>().Subject;
        var json = System.Text.Json.JsonSerializer.SerializeToElement(created.Value);
        json.GetProperty("outcome").GetString().Should().Be("INCONCLUSIVE", "completed work is not restored performance until someone says so");
        json.GetProperty("createdBy").GetString().Should().Be("engineer.a");

        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<bool>("SELECT pinned FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id = _old })).Should().BeTrue();
        await EvidenceRetentionSweeper.SweepOnceAsync(_db, CancellationToken.None);
        (await conn.ExecuteScalarAsync<string>("SELECT readiness FROM analytics.evidence_manifest WHERE evidence_id = @id", new { id = _old })).Should().Be("COMPLETE");
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.evidence_chunk WHERE evidence_id = @id", new { id = _old })).Should().Be(1);

        var list = await Controller().ForLoop(_loop, CancellationToken.None);
        var ok = list.Should().BeOfType<OkObjectResult>().Subject;
        System.Text.Json.JsonSerializer.SerializeToElement(ok.Value).GetProperty("count").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task The_outcome_is_set_explicitly_and_audited_to_the_person()
    {
        var res = await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, _run, new[] { _old }, "n", null), CancellationToken.None);
        var id = System.Text.Json.JsonSerializer.SerializeToElement(((CreatedResult)res).Value).GetProperty("refId").GetGuid();
        var upd = await Controller("supervisor.b").SetOutcome(id, new CpmInvestigationsController.OutcomeRequest("PERFORMANCE_RESTORED", "trend back in band"), CancellationToken.None);
        var json = System.Text.Json.JsonSerializer.SerializeToElement(((OkObjectResult)upd).Value);
        json.GetProperty("outcome").GetString().Should().Be("PERFORMANCE_RESTORED");
        json.GetProperty("updatedBy").GetString().Should().Be("supervisor.b");
        var bad = await Controller().SetOutcome(id, new CpmInvestigationsController.OutcomeRequest("FIXED", null), CancellationToken.None);
        bad.Should().BeOfType<BadRequestObjectResult>();
    }

    [Fact]
    public async Task Unknown_evidence_is_refused_not_recorded()
    {
        var res = await Controller().Create(new CpmInvestigationsController.CreateRequest(_loop, _run, new[] { Guid.NewGuid() }, "n", null), CancellationToken.None);
        res.Should().BeOfType<NotFoundObjectResult>();
        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM analytics.investigation_reference WHERE loop_id = @loop", new { loop = _loop })).Should().Be(0);
    }
}
