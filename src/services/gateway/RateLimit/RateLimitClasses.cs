// The route classes of GW-03 and how a request is classified (pure; tested).
//
// 2026-09-17: a token refresh is its own class. It used to fall into `mutation` (anything that
// is not a GET) and so failed CLOSED whenever the limiter's Redis call failed - one 1 s Redis
// hiccup answered every in-flight /api/auth/refresh with 429 and the SPA ended the session.
// A refresh is not a plant-state mutation, and the brute-force protection it needs lives in
// auth-service (single-use rotating refresh tokens + its own limiter): per-IP, fail OPEN.
namespace Traverse.Gateway.RateLimit;

/// <param name="FailClosed">
/// On a Redis failure: a fail-closed class is still enforced from the gateway's own in-process
/// counters (brute-force and write protection never lapse); a fail-open class passes (operators
/// never lose alarm visibility to a dead cache). Neither means "deny everyone".
/// </param>
public sealed record RateLimitClass(string Name, int Limit, bool PerIp, bool FailClosed);

public sealed record RateLimitClasses(
    RateLimitClass Login, RateLimitClass Session, RateLimitClass Snapshot, RateLimitClass Historian,
    RateLimitClass Mutation, RateLimitClass Read, RateLimitClass Global)
{
    public static RateLimitClasses FromConfig(IConfiguration config) => new(
        Login:     new("login",     config.GetValue("RateLimiting:LoginPerMinutePerIp",   10),   PerIp: true,  FailClosed: true),
        Session:   new("session",   config.GetValue("RateLimiting:SessionPerMinutePerIp", 60),   PerIp: true,  FailClosed: false),
        Snapshot:  new("snapshot",  config.GetValue("RateLimiting:SnapshotPerMinute",     30),   PerIp: false, FailClosed: false),
        Historian: new("historian", config.GetValue("RateLimiting:HistorianPerMinute",    120),  PerIp: false, FailClosed: false),
        Mutation:  new("mutation",  config.GetValue("RateLimiting:MutationPerMinute",     120),  PerIp: false, FailClosed: true),
        Read:      new("read",      config.GetValue("RateLimiting:ReadPerMinute",         600),  PerIp: false, FailClosed: false),
        Global:    new("global",    config.GetValue("RateLimiting:GlobalPerMinutePerIp",  2000), PerIp: true,  FailClosed: false));

    /// <summary>The class a request counts against. Order matters: the specific auth routes first, then the historian reads, then any write, then any read.</summary>
    public RateLimitClass Classify(string method, PathString path)
    {
        var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        if (HttpMethods.IsPost(method) && path.StartsWithSegments("/api/auth/login")) return Login;
        if (HttpMethods.IsPost(method) && (path.StartsWithSegments("/api/auth/refresh") || path.StartsWithSegments("/api/auth/logout"))) return Session;
        if (isRead && path.StartsWithSegments("/api/hist/snapshot")) return Snapshot;
        if (isRead && path.StartsWithSegments("/api/hist")) return Historian;
        if (!isRead) return Mutation;
        return Read;
    }
}
