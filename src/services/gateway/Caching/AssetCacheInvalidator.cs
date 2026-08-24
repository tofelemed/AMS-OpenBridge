// Event-driven invalidation for the "assets" response-cache class (P2.5).
//
// ResponseCacheMiddleware caches /api/assets and /api/aliases GETs for 60 s with
// TTL-only invalidation — its header even notes "event-driven invalidation
// (asset-events…) can tighten this later without changing the key scheme". This
// is that tightening: asset-model publishes every create/update/delete on the
// Redis pub/sub channel `asset-events` (Program.cs PublishAssetEvent), so a
// write busts every `cache:assets:*` entry immediately instead of serving up to
// 60 s of stale dropdowns to the Master Data UI it now backs.
//
// Failure posture matches the cache itself: fail-open. If Redis or the
// subscription drops, entries simply age out on their TTL as before.
using StackExchange.Redis;

namespace Traverse.Gateway.Caching;

public sealed class AssetCacheInvalidator : BackgroundService
{
    private const string Channel = "asset-events";
    private const string KeyPattern = "cache:assets:*";

    private readonly IConfiguration _config;
    private readonly ILogger<AssetCacheInvalidator> _log;

    public AssetCacheInvalidator(IConfiguration config, ILogger<AssetCacheInvalidator> log)
    {
        _config = config;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!_config.GetValue("ResponseCache:Enabled", true)) return;

        var host = _config["Redis:Host"] ?? "redis";
        var port = _config.GetValue("Redis:Port", 6379);

        ConnectionMultiplexer? mux = null;
        while (!ct.IsCancellationRequested && mux is null)
        {
            try
            {
                mux = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions
                {
                    EndPoints = { $"{host}:{port}" },
                    AbortOnConnectFail = false,
                    ConnectTimeout = 2000,
                    Password = _config["Redis:Password"],
                });
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "asset-events invalidator: Redis unavailable, retrying in 30 s");
                await Task.Delay(TimeSpan.FromSeconds(30), ct);
            }
        }
        if (mux is null) return;

        // Coalesce bursts (a bulk import publishes one event per asset): the
        // handler only flags work; one sweep per second clears the class once.
        var pending = 0;
        await mux.GetSubscriber().SubscribeAsync(RedisChannel.Literal(Channel), (_, _) =>
        {
            Interlocked.Exchange(ref pending, 1);
        });
        _log.LogInformation("Subscribed to '{Channel}' for assets response-cache invalidation", Channel);

        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
            if (Interlocked.Exchange(ref pending, 0) == 0) continue;

            try
            {
                var db = mux.GetDatabase();
                var deleted = 0;
                foreach (var endpoint in mux.GetEndPoints())
                {
                    var server = mux.GetServer(endpoint);
                    if (!server.IsConnected || server.IsReplica) continue;
                    await foreach (var key in server.KeysAsync(pattern: KeyPattern, pageSize: 500)
                                       .WithCancellation(ct))
                    {
                        await db.KeyDeleteAsync(key, CommandFlags.FireAndForget);
                        deleted++;
                    }
                }
                if (deleted > 0)
                    _log.LogDebug("asset-events: invalidated {Count} cached assets response(s)", deleted);
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "asset-events invalidation sweep failed — entries will age out on TTL");
            }
        }
    }
}
