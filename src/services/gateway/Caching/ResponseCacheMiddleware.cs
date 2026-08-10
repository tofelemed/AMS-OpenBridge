// Response caching at the edge (Plan 04 item 4, GW-01).
//
// ALLOW-LIST design: only the route families from the plan's cache table are ever
// cached — everything else (current alarm state, ACK/shelve/suppress, /hubs, /mqtt-ws,
// CPM, auth, audit) is structurally uncacheable because no rule matches it. Tests
// assert the deny behaviour explicitly.
//
//   assets/aliases reads ... 60 s     displays/{id} config ... 30 s
//   bindings/resolve ....... 30 s     hist trend/summary ..... 10 s
//   templates/{id} ......... 60 s
//
// Key: cache:{class}:{sha256(path?query)}:{sha256(sub + sorted permissions)}.
// The scope hash includes the SUBJECT, not just the permission set: displays have
// operator-owned Personal Views, so sharing cache entries across same-permission
// users could leak another operator's content. Per-user is correct by construction;
// the dominant pattern (an HMI polling the same endpoints) still hits.
//
// Only 200 responses to GET are stored. Redis down → cache bypassed (fail-open).
// Invalidation is TTL-based; the TTLs are the plan's staleness bounds. Event-driven
// invalidation (asset-events, display writes) can tighten this later without
// changing the key scheme.
using System.Security.Cryptography;
using System.Text;
using StackExchange.Redis;

namespace Traverse.Gateway.Caching;

public sealed record CacheRule(string Name, PathString Prefix, int TtlSeconds);

public sealed class ResponseCacheMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ResponseCacheMiddleware> _log;
    private readonly Lazy<Task<IConnectionMultiplexer?>> _redis;
    private readonly bool _enabled;
    private readonly List<CacheRule> _rules;

    public ResponseCacheMiddleware(RequestDelegate next, IConfiguration config,
                                   ILogger<ResponseCacheMiddleware> log)
    {
        _next = next;
        _log = log;
        _enabled = config.GetValue("ResponseCache:Enabled", true);

        _rules = new List<CacheRule>
        {
            new("assets",    "/api/assets",           config.GetValue("ResponseCache:AssetsTtlSeconds",    60)),
            new("assets",    "/api/aliases",          config.GetValue("ResponseCache:AssetsTtlSeconds",    60)),
            new("displays",  "/api/displays",         config.GetValue("ResponseCache:DisplaysTtlSeconds",  30)),
            new("bindings",  "/api/bindings/resolve", config.GetValue("ResponseCache:BindingsTtlSeconds",  30)),
            new("hist",      "/api/hist/trend",       config.GetValue("ResponseCache:HistTtlSeconds",      10)),
            new("hist",      "/api/hist/summary",     config.GetValue("ResponseCache:HistTtlSeconds",      10)),
            new("templates", "/api/templates",        config.GetValue("ResponseCache:TemplatesTtlSeconds", 60)),
        };

        var host = config["Redis:Host"] ?? "redis";
        var port = config.GetValue("Redis:Port", 6379);
        _redis = new Lazy<Task<IConnectionMultiplexer?>>(async () =>
        {
            try
            {
                var mux = await ConnectionMultiplexer.ConnectAsync(new ConfigurationOptions
                {
                    EndPoints = { $"{host}:{port}" },
                    AbortOnConnectFail = false,
                    ConnectTimeout = 2000,
                    SyncTimeout = 1000,
                    Password = config["Redis:Password"],
                });
                return (IConnectionMultiplexer)mux;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Response-cache Redis unavailable — caching disabled");
                return null;
            }
        });
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (!_enabled || !HttpMethods.IsGet(ctx.Request.Method))
        {
            await _next(ctx);
            return;
        }

        var rule = _rules.FirstOrDefault(r => ctx.Request.Path.StartsWithSegments(r.Prefix));
        if (rule is null)
        {
            await _next(ctx);
            return;
        }

        IDatabase? db = null;
        try
        {
            var mux = await _redis.Value;
            if (mux is not null) db = mux.GetDatabase();
        }
        catch { /* fail-open: no cache */ }

        if (db is null)
        {
            await _next(ctx);
            return;
        }

        var key = BuildKey(ctx, rule);

        // ---- try HIT ----
        try
        {
            var cached = await db.StringGetAsync(key);
            if (cached.HasValue)
            {
                // stored as: contentType '\n' body
                var raw = (string)cached!;
                var sep = raw.IndexOf('\n');
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                ctx.Response.ContentType = sep > 0 ? raw[..sep] : "application/json";
                ctx.Response.Headers["X-Cache"] = "HIT";
                await ctx.Response.WriteAsync(sep > 0 ? raw[(sep + 1)..] : raw);
                return;
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Cache read failed for {Class} — bypassing", rule.Name);
            await _next(ctx);
            return;
        }

        // ---- MISS: capture the upstream response body ----
        ctx.Response.Headers["X-Cache"] = "MISS";
        var originalBody = ctx.Response.Body;
        using var buffer = new MemoryStream();
        ctx.Response.Body = buffer;
        try
        {
            await _next(ctx);

            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody);

            if (ctx.Response.StatusCode == StatusCodes.Status200OK && buffer.Length > 0)
            {
                var body = Encoding.UTF8.GetString(buffer.ToArray());
                var payload = (ctx.Response.ContentType ?? "application/json") + "\n" + body;
                try
                {
                    await db.StringSetAsync(key, payload, TimeSpan.FromSeconds(rule.TtlSeconds));
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Cache write failed for {Class}", rule.Name);
                }
            }
        }
        finally
        {
            ctx.Response.Body = originalBody;
        }
    }

    private static string BuildKey(HttpContext ctx, CacheRule rule)
    {
        var query = Sha256(ctx.Request.Path + ctx.Request.QueryString.Value);

        // Per-user scope: subject + sorted permission set (see file header for why).
        var sub = ctx.User.FindFirst("sub")?.Value ?? "anon";
        var perms = string.Join(",", ctx.User.FindAll("permission").Select(c => c.Value).OrderBy(p => p, StringComparer.Ordinal));
        var scope = Sha256(sub + "|" + perms);

        return $"cache:{rule.Name}:{query}:{scope}";
    }

    private static string Sha256(string input)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input)))[..24];
}
