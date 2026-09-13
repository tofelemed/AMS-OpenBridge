using System.Text.Json;
using StackExchange.Redis;

namespace AMS.HistorianBff;

/// <summary>
/// CHG-023 (P2-6) — GET /snapshot's Redis read.
///
/// Before: one awaited SMEMBERS then one awaited MGET per device, in series — a
/// wildcard seed over D devices was ~2D round trips, and every device name ever
/// SADDed into <c>snapshot:devices</c> stayed there after its metrics expired, so
/// dead devices were paid for on every wildcard read forever (the lab carried
/// 3,282 names for ~30 live devices).
///
/// Now: all index reads go out together, then all MGETs (the multiplexer pipelines
/// them), expired index members are still pruned lazily, and a device with no live
/// key at all is dropped from the devices set — the edge node SADDs it back on its
/// next publish, so nothing live is ever lost.
/// </summary>
public static class SnapshotReader
{
    public static async Task<Dictionary<string, Dictionary<string, object?>>> ReadAsync(
        IDatabase db, IReadOnlyList<string> devices, Func<string, bool> groupAllowed,
        string devicesSetKey = "snapshot:devices")
    {
        // 1. Every device's index, in flight together.
        var indexes = await Task.WhenAll(devices.Select(d => db.SetMembersAsync($"snapshot:index:{d}")));

        // 2. Every device's values, in flight together.
        var keysPerDevice = new RedisKey[devices.Count][];
        var valueTasks = new Task<RedisValue[]>?[devices.Count];
        for (var i = 0; i < devices.Count; i++)
        {
            keysPerDevice[i] = indexes[i].Select(k => (RedisKey)(string)k!).ToArray();
            valueTasks[i] = keysPerDevice[i].Length == 0 ? null : db.StringGetAsync(keysPerDevice[i]);
        }
        await Task.WhenAll(valueTasks.Where(t => t is not null)!);

        var result = new Dictionary<string, Dictionary<string, object?>>();
        var deadDevices = new List<RedisValue>();
        for (var i = 0; i < devices.Count; i++)
        {
            var device = devices[i];
            var keys = keysPerDevice[i];
            if (keys.Length == 0) { deadDevices.Add(device); continue; }
            var values = await valueTasks[i]!;

            Dictionary<string, object?>? assetMetrics = null;
            var stale = new List<RedisValue>();
            var anyLive = false;
            for (var j = 0; j < keys.Length; j++)
            {
                var keyStr = (string)keys[j]!;
                var parts = keyStr.Split(':');             // snapshot:metric:<group>:<edge>:<device>:<metric>
                if (parts.Length < 6) continue;
                if (values[j].IsNullOrEmpty) { stale.Add(keyStr); continue; }   // TTL-expired -> prune
                anyLive = true;                             // live even if this caller may not see it
                if (!groupAllowed(parts[2])) continue;      // parts[2] = sparkplug group (site scope)

                assetMetrics ??= result.TryGetValue(device, out var existing)
                    ? existing
                    : (result[device] = new Dictionary<string, object?>());

                var metricName = parts[^1];
                try   { assetMetrics[metricName] = JsonSerializer.Deserialize<JsonElement>(values[j]!); }
                catch { assetMetrics[metricName] = (string?)values[j]; }
            }

            // Lazy index hygiene: drop members whose snapshot key expired (fire-and-forget).
            if (stale.Count > 0)
                _ = db.SetRemoveAsync($"snapshot:index:{device}", stale.ToArray(), CommandFlags.FireAndForget);
            if (!anyLive) deadDevices.Add(device);
        }

        // Same hygiene one level up: a device with nothing live leaves the wildcard set.
        if (deadDevices.Count > 0)
            _ = db.SetRemoveAsync(devicesSetKey, deadDevices.ToArray(), CommandFlags.FireAndForget);

        return result;
    }
}
