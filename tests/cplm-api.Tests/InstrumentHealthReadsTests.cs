using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

/// <summary>
/// v2.5 Task 1H.5: the mirror writer is idempotent and the as-of read resolves the device installed
/// at that instant (NR-041/NR-045), reports stale ages, and never manufactures OK for an unbound role.
/// </summary>
[Collection("instrument-bindings-lab")]
[Trait("Category", "Integration")]
public sealed class InstrumentHealthReadsTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private string _loop = "";
    private static readonly DateTime T0 = new(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Cutover = T0.AddDays(10);

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        _loop = await conn.ExecuteScalarAsync<string>("SELECT loop_id FROM cpm.loop_registry ORDER BY loop_id LIMIT 1")
                ?? throw new InvalidOperationException("the lab registry has no loops");
        await Cleanup(conn);
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await Cleanup(conn);
        await _db.DisposeAsync();
    }

    private async Task Cleanup(NpgsqlConnection conn)
    {
        await conn.ExecuteAsync("DELETE FROM cpm.signal_device_binding_history WHERE loop_id = @l AND note LIKE 'TEST:%'", new { l = _loop });
        await conn.ExecuteAsync("DELETE FROM cpm.loop_health_context WHERE loop_id = @l AND device_id LIKE 'TEST-%'", new { l = _loop });
        await conn.ExecuteAsync("DELETE FROM cpm.instrument_health_observation WHERE device_id LIKE 'TEST-%'");
        await conn.ExecuteAsync("DELETE FROM cpm.device_health_interval WHERE device_id LIKE 'TEST-%'");
        await conn.ExecuteAsync("DELETE FROM cpm.source_availability WHERE source_id = 'TEST-src'");
    }

    private static long Ms(DateTime t) => new DateTimeOffset(t).ToUnixTimeMilliseconds();

    private static string LoopContext(string loop, string role, string device, string eligibility, DateTime from, DateTime? to, string[] flags, int rev = 1) =>
        $$$$"""
        {"record_kind":"LOOP_CONTEXT","context_key":"loop:{{{{loop}}}}:{{{{role}}}}","loop_id":"{{{{loop}}}}","role":"{{{{role}}}}","device_id":"{{{{device}}}}",
         "binding_id":"TEST-b","eligibility":"{{{{eligibility}}}}","descriptive_eligibility":"{{{{eligibility}}}}","reason":"TEST","emitted_at_ms":{{{{Ms(from)}}}},
         "interval":{"tenant_id":"default","site":"lab","device_id":"{{{{device}}}}","from_ms":{{{{Ms(from)}}}}{{{{(to is null ? "" : $",\"to_ms\":{Ms(to.Value)}")}}}},
                     "boundary_kind":"OPEN","active_flags":[{{{{string.Join(",", flags.Select(f => $"\"{f}\""))}}}}],"collection_state":"VERIFIED",
                     "measurement_impact":"{{{{(flags.Contains("F") ? "INVALID" : "VALID")}}}}","health_state_id":"hs-{{{{device}}}}","revision":{{{{rev}}}}}}
        """;

    private static string Observation(string device, DateTime observedAt, string id) =>
        $$$$"""
        {"gateway":{"received_at":"{{{{observedAt:O}}}}","topic":"t","kind":"state","mqtt_retained":false,"authenticated_producer":"ams_ingest","flags":[]},
         "observation":{"schema_version":"1.0","message_kind":"STATE_SNAPSHOT","observation_id":"{{{{id}}}}","tenant_id":"default","site_id":"lab",
           "producer_id":"p","producer_epoch":1,"sequence":1,"source_id":"TEST-src","device_id":"{{{{device}}}}","observed_at":"{{{{observedAt:O}}}}",
           "verified_at":"{{{{observedAt:O}}}}","published_at":"{{{{observedAt:O}}}}","state_revision":1,"state_complete":true,
           "state":{"active_flags":["F"],"native_status":"FAILURE","collection_state":"VERIFIED","measurement_impact":"INVALID",
             "diagnostics":[{"diagnostic_id":"d1","native_code":"F042","message":"Sensor break","flags":["F"],"affected_variable_ids":["{{{{device}}}}.PV"],
                             "measurement_impact":"INVALID","cause":"Open circuit","remedy":"Replace sensor"}]}}}
        """;

    [Fact]
    public async Task As_of_resolves_the_device_installed_then_and_reports_observation_age()
    {
        var bindings = new InstrumentBindingService(_db);
        await bindings.CreateAsync(_loop, new("PV", "TEST-TT-OLD", null, "TEST-src", T0, "TEST: old"), "eng", CancellationToken.None);
        await bindings.CreateAsync(_loop, new("PV", "TEST-TT-NEW", null, "TEST-src", Cutover, "TEST: new"), "eng", CancellationToken.None);
        var writer = new InstrumentHealthMirrorWriter(_db);
        (await writer.ApplyContextAsync(LoopContext(_loop, "PV", "TEST-TT-OLD", "ELIGIBLE", T0, Cutover, Array.Empty<string>()), CancellationToken.None)).Should().BeTrue();
        (await writer.ApplyContextAsync(LoopContext(_loop, "PV", "TEST-TT-NEW", "INELIGIBLE", Cutover, null, new[] { "F" }), CancellationToken.None)).Should().BeTrue();
        var obsAt = Cutover.AddHours(1);
        await writer.ApplyObservationAsync(Observation("TEST-TT-NEW", obsAt, "TEST-obs-1"), CancellationToken.None);
        await writer.ApplyObservationAsync(Observation("TEST-TT-NEW", obsAt, "TEST-obs-1"), CancellationToken.None); // redelivery

        var reads = new InstrumentHealthReads(_db);
        var before = await reads.GetAsOfAsync(_loop, Cutover.AddDays(-1), CancellationToken.None);
        before.Should().NotBeNull();
        var pvBefore = before!.Roles.Single(r => r.Role == "PV");
        pvBefore.DeviceId.Should().Be("TEST-TT-OLD");
        pvBefore.Eligibility.Should().Be("ELIGIBLE");
        pvBefore.LastObservedAt.Should().BeNull("the old device never reported in this fixture");

        var after = await reads.GetAsOfAsync(_loop, Cutover.AddHours(2), CancellationToken.None);
        var pvAfter = after!.Roles.Single(r => r.Role == "PV");
        pvAfter.DeviceId.Should().Be("TEST-TT-NEW");
        pvAfter.Eligibility.Should().Be("INELIGIBLE");
        pvAfter.ActiveFlags.Should().Contain("F");
        pvAfter.NativeStatus.Should().Be("FAILURE");
        pvAfter.ActiveDiagnostics.Should().Be(1);
        pvAfter.Diagnostics.Should().ContainSingle(d => d.DiagnosticId == "d1" && d.Remedy == "Replace sensor" && d.Flags.Contains("F"));
        pvAfter.InterpretationVersion.Should().Be(1);
        pvAfter.ObservedAgeS.Should().BeApproximately(3600, 1, "one observation an hour before the as-of instant");

        after.Roles.Single(r => r.Role == "VP").Eligibility.Should().Be("NOT_CONFIGURED", "no VP binding exists; absence is never OK");
        after.Roles.Should().NotContain(r => r.Role == "SP", "unbound optional roles are not listed");

        await using var conn = await _db.OpenConnectionAsync();
        (await conn.ExecuteScalarAsync<int>("SELECT count(*) FROM cpm.instrument_health_observation WHERE device_id = 'TEST-TT-NEW'"))
            .Should().Be(1, "redelivery of the same observation_id is idempotent");

        var history = await reads.HistoryAsync(_loop, T0.AddDays(-1), Cutover.AddDays(1), 50, CancellationToken.None);
        history.Should().HaveCount(2, "the replacement is a separate interval row, not a rewrite");
    }

    [Fact]
    public async Task A_revision_is_a_new_row_and_a_close_updates_the_open_interval()
    {
        var writer = new InstrumentHealthMirrorWriter(_db);
        var open = $$$$"""
            {"record_kind":"DEVICE_INTERVAL","context_key":"device:default|lab|TEST-DEV:{{{{Ms(T0)}}}}:1","interval":{"tenant_id":"default","site":"lab",
             "device_id":"TEST-DEV","from_ms":{{{{Ms(T0)}}}},"boundary_kind":"OPEN","active_flags":["S"],"collection_state":"VERIFIED","measurement_impact":"DEGRADED",
             "health_state_id":"hs1","affected_variable_ids":[],"from_observation_id":"o1","revision":1}}
            """;
        var close = open.Replace("\"boundary_kind\":\"OPEN\"", $"\"to_ms\":{Ms(T0.AddHours(1))},\"boundary_kind\":\"NEWER_STATE\"");
        var revision = open.Replace("\"revision\":1", "\"revision\":2").Replace("\"active_flags\":[\"S\"]", "\"active_flags\":[\"C\"]");
        await writer.ApplyContextAsync(open, CancellationToken.None);
        await writer.ApplyContextAsync(close, CancellationToken.None);
        await writer.ApplyContextAsync(revision, CancellationToken.None);
        await using var conn = await _db.OpenConnectionAsync();
        var rows = (await conn.QueryAsync("SELECT revision, to_at, active_flags FROM cpm.device_health_interval WHERE device_id = 'TEST-DEV' ORDER BY revision")).ToList();
        rows.Should().HaveCount(2);
        ((DateTime?)rows[0].to_at).Should().Be(T0.AddHours(1), "the CLOSE updated revision 1 in place");
        ((string[])rows[1].active_flags).Should().Equal("C");
        ((DateTime?)rows[1].to_at).Should().BeNull("revision 2 is its own open row; revision 1 is kept");
    }
}
