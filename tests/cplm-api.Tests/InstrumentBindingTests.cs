// v2.5 Task 1H.3 (spec v6 §4.2; NR-041) — effective-dated primary device bindings: a
// replacement splits the binding, history resolves the device installed at that time, an
// overlap is refused, and identity is explicit. Pure resolution + lab-DB service tests.
using Dapper;
using FluentAssertions;
using Npgsql;
using Traverse.CplmApi.Services;
using Xunit;

namespace Traverse.CplmApi.Tests;

public sealed class BindingResolutionTests
{
    private static InstrumentBinding B(string role, string device, DateTime from, DateTime? to) =>
        new(Guid.NewGuid(), "FIC101", role, device, null, "instr-prm-1", from, to, "eng", from, null);

    [Fact]
    public void Nr041_history_resolves_the_device_installed_at_that_time_and_never_substitutes_the_replacement()
    {
        var cutover = new DateTime(2026, 9, 15, 10, 0, 0, DateTimeKind.Utc);
        var history = new[]
        {
            B("PV", "TT-OLD", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), cutover),
            B("PV", "TT-NEW", cutover, null),
            B("VP", "ZT-1", new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), null),
        };
        BindingResolution.AsOf(history, "PV", cutover.AddMinutes(-1))!.DeviceId.Should().Be("TT-OLD");
        BindingResolution.AsOf(history, "PV", cutover)!.DeviceId.Should().Be("TT-NEW", "[from, to) is half-open");
        BindingResolution.AsOf(history, "PV", cutover.AddDays(3))!.DeviceId.Should().Be("TT-NEW");
        BindingResolution.AsOf(history, "PV", new DateTime(2025, 12, 31, 0, 0, 0, DateTimeKind.Utc)).Should().BeNull("before any binding = NOT_CONFIGURED");
        BindingResolution.AsOf(history, "SP", cutover).Should().BeNull();
        BindingResolution.AsOf(history, "vp", cutover)!.DeviceId.Should().Be("ZT-1");
    }
}

[Collection("instrument-bindings-lab")]
[Trait("Category", "Integration")]
public sealed class InstrumentBindingServiceTests : IAsyncLifetime
{
    private NpgsqlDataSource _db = null!;
    private string _loop = "";

    public async Task InitializeAsync()
    {
        _db = NpgsqlDataSource.Create(TestDb.ConnectionString());
        await using var conn = await _db.OpenConnectionAsync();
        _loop = await conn.ExecuteScalarAsync<string>("SELECT loop_id FROM cpm.loop_registry ORDER BY loop_id LIMIT 1")
                ?? throw new InvalidOperationException("the lab registry has no loops");
        await conn.ExecuteAsync("DELETE FROM cpm.signal_device_binding_history WHERE loop_id = @l AND note LIKE 'TEST:%'", new { l = _loop });
    }

    public async Task DisposeAsync()
    {
        await using var conn = await _db.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM cpm.signal_device_binding_history WHERE loop_id = @l AND note LIKE 'TEST:%'", new { l = _loop });
        await _db.DisposeAsync();
    }

    private InstrumentBindingService Service() => new(_db);

    [Fact]
    public async Task A_replacement_splits_the_binding_and_the_history_keeps_both()
    {
        var svc = Service();
        var t0 = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var first = await svc.CreateAsync(_loop, new("PV", "TT-OLD", "inst-1", "instr-prm-1", t0, "TEST: first"), "eng", CancellationToken.None);
        first.ValidTo.Should().BeNull();
        var cutover = t0.AddDays(10);
        var second = await svc.CreateAsync(_loop, new("PV", "TT-NEW", "inst-2", "instr-prm-1", cutover, "TEST: replacement"), "eng", CancellationToken.None);
        second.ValidFrom.Should().Be(cutover);

        var history = (await svc.ListAsync(_loop, CancellationToken.None)).Where(b => b.SignalRole == "PV" && (b.Note ?? "").StartsWith("TEST:")).ToList();
        history.Should().HaveCount(2);
        history.Single(b => b.DeviceId == "TT-OLD").ValidTo.Should().Be(cutover, "the old binding is closed at the cutover, not deleted");
        BindingResolution.AsOf(history, "PV", cutover.AddDays(-1))!.DeviceId.Should().Be("TT-OLD");
        BindingResolution.AsOf(history, "PV", cutover.AddDays(1))!.DeviceId.Should().Be("TT-NEW");
    }

    [Fact]
    public async Task An_overlapping_primary_is_refused_and_identity_must_be_explicit()
    {
        var svc = Service();
        var t0 = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        await svc.CreateAsync(_loop, new("VP", "ZT-1", null, "instr-prm-1", t0.AddDays(5), "TEST: vp"), "eng", CancellationToken.None);
        // a replacement that would start BEFORE the current one is an overlap, not a split
        await FluentActions.Awaiting(() => svc.CreateAsync(_loop, new("VP", "ZT-2", null, "instr-prm-1", t0, "TEST: overlap"), "eng", CancellationToken.None))
            .Should().ThrowAsync<BindingConflictException>();
        await FluentActions.Awaiting(() => svc.CreateAsync(_loop, new("PV", "", null, "instr-prm-1", null, "TEST: no device"), "eng", CancellationToken.None))
            .Should().ThrowAsync<BindingValidationException>();
        await FluentActions.Awaiting(() => svc.CreateAsync(_loop, new("XX", "TT-1", null, "instr-prm-1", null, "TEST: bad role"), "eng", CancellationToken.None))
            .Should().ThrowAsync<BindingValidationException>();
        await FluentActions.Awaiting(() => svc.CreateAsync("NOT_A_LOOP_ZZ", new("PV", "TT-1", null, "instr-prm-1", null, "TEST: no loop"), "eng", CancellationToken.None))
            .Should().ThrowAsync<BindingValidationException>();
    }
}
