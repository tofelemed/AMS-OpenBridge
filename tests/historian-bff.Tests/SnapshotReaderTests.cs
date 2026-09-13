// CHG-023 (P2-6) — GET /snapshot's Redis read, extracted so it can be proven.
//
// Runs against a REAL Redis. The lab's Redis containers publish no host port (Plan 04
// lockdown), so the default is a throwaway one:
//   docker run --rm -d --name snaptest-redis -p 6390:6379 redis:7.2-alpine
// or point REDIS_TEST at any Redis (StackExchange configuration string). Every key it
// writes carries a unique prefix and is deleted afterwards.
// The contract under test: every live metric of every requested device comes back
// parsed; expired members are pruned from the device's index; a device with no live
// key at all is dropped from the devices set (so the wildcard seed stops paying for
// dead devices forever); out-of-scope Sparkplug groups are filtered.
using System.Text.Json;
using AMS.HistorianBff;
using FluentAssertions;
using StackExchange.Redis;
using Xunit;

namespace AMS.HistorianBff.Tests;

[Trait("Category", "Integration")]
public sealed class SnapshotReaderTests : IAsyncLifetime
{
    private ConnectionMultiplexer _mux = null!;
    private IDatabase _db = null!;
    private readonly string _p = $"snaptest_{Guid.NewGuid():N}";
    private string DevicesSet => $"{_p}:devices";

    public async Task InitializeAsync()
    {
        _mux = await ConnectionMultiplexer.ConnectAsync(TestRedis.Configuration());
        _db = _mux.GetDatabase();
    }

    public async Task DisposeAsync()
    {
        var server = _mux.GetServer(_mux.GetEndPoints()[0]);
        var keys = server.Keys(pattern: $"*{_p}*").ToArray();
        if (keys.Length > 0) await _db.KeyDeleteAsync(keys);
        await _mux.DisposeAsync();
    }

    private string Device(int i) => $"{_p}_dev{i:D3}";
    private static string MetricKey(string device, string metric, string group = "ams_site1")
        => $"snapshot:metric:{group}:ams_edge1:{device}:{metric}";

    private async Task SeedAsync(string device, string[] metrics, string group = "ams_site1", string[]? deadMembers = null)
    {
        var index = $"snapshot:index:{device}";
        foreach (var m in metrics)
        {
            var key = MetricKey(device, m, group);
            await _db.StringSetAsync(key, $$$"""{"v": 1.5, "q": 192, "ts": 1700000000000}""");
            await _db.SetAddAsync(index, key);
        }
        foreach (var dead in deadMembers ?? Array.Empty<string>())
            await _db.SetAddAsync(index, MetricKey(device, dead, group));   // member without a value = expired
        await _db.SetAddAsync(DevicesSet, device);
    }

    [Fact]
    public async Task Returns_every_live_metric_of_every_requested_device_parsed_as_json()
    {
        var metrics = new[] { "pv", "sp", "op", "vp", "mode", "quality" };
        var devices = Enumerable.Range(0, 40).Select(Device).ToArray();
        foreach (var d in devices) await SeedAsync(d, metrics);

        var result = await SnapshotReader.ReadAsync(_db, devices, _ => true, DevicesSet);

        result.Keys.Should().BeEquivalentTo(devices);
        foreach (var d in devices)
        {
            result[d].Keys.Should().BeEquivalentTo(metrics);
            result[d]["pv"].Should().BeOfType<JsonElement>()
                .Which.GetProperty("v").GetDouble().Should().Be(1.5);
        }
    }

    [Fact]
    public async Task Expired_index_members_are_skipped_and_pruned_from_the_device_index()
    {
        var d = Device(1);
        await SeedAsync(d, new[] { "pv", "sp" }, deadMembers: new[] { "op" });

        var result = await SnapshotReader.ReadAsync(_db, new[] { d }, _ => true, DevicesSet);

        result[d].Keys.Should().BeEquivalentTo(new[] { "pv", "sp" });
        await Task.Delay(200); // the prune is fire-and-forget
        (await _db.SetMembersAsync($"snapshot:index:{d}")).Select(m => (string)m!)
            .Should().BeEquivalentTo(new[] { MetricKey(d, "pv"), MetricKey(d, "sp") });
    }

    [Fact]
    public async Task A_device_with_no_live_key_is_absent_and_removed_from_the_devices_set()
    {
        var live = Device(2);
        var dead = Device(3);
        var never = Device(4);
        await SeedAsync(live, new[] { "pv" });
        await SeedAsync(dead, Array.Empty<string>(), deadMembers: new[] { "pv", "sp" });
        await _db.SetAddAsync(DevicesSet, never);   // in the set, no index at all

        var result = await SnapshotReader.ReadAsync(_db, new[] { live, dead, never }, _ => true, DevicesSet);

        result.Keys.Should().BeEquivalentTo(new[] { live });
        await Task.Delay(200);
        (await _db.SetMembersAsync(DevicesSet)).Select(m => (string)m!)
            .Should().BeEquivalentTo(new[] { live }, "dead device names must not be paid for on every wildcard read");
    }

    [Fact]
    public async Task Metrics_from_an_out_of_scope_group_are_filtered()
    {
        var d = Device(5);
        await SeedAsync(d, new[] { "pv" }, group: "ams_site1");
        await SeedAsync(d, new[] { "sp" }, group: "othersite");

        var result = await SnapshotReader.ReadAsync(_db, new[] { d }, g => g == "ams_site1", DevicesSet);

        result[d].Keys.Should().BeEquivalentTo(new[] { "pv" });
    }
}

internal static class TestRedis
{
    public static ConfigurationOptions Configuration()
    {
        var explicitCs = Environment.GetEnvironmentVariable("REDIS_TEST");
        if (!string.IsNullOrWhiteSpace(explicitCs)) return ConfigurationOptions.Parse(explicitCs);

        return new ConfigurationOptions { EndPoints = { "127.0.0.1:6390" }, ConnectTimeout = 3000, AbortOnConnectFail = true };
    }
}
