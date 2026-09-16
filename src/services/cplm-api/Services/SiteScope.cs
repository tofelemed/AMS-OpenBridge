namespace Traverse.CplmApi.Services;

/// <summary>
/// v2.5 Task 2C.2: evidence is served only for sites inside the caller's scope. The gateway may
/// forward the caller's sites as X-Auth-Sites (comma-separated); when the header is present the
/// loop's site must be in it, when absent the deployment has no site partitioning and every site
/// is in scope. Never a client-supplied header: the gateway strips inbound X-Auth-*.
/// </summary>
public static class SiteScope
{
    public const string Header = "X-Auth-Sites";

    public static bool Allows(HttpRequest request, string? loopSite)
    {
        if (!request.Headers.TryGetValue(Header, out var raw) || string.IsNullOrWhiteSpace(raw)) return true;
        var allowed = raw.ToString().Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowed.Length == 0) return true;
        if (string.IsNullOrWhiteSpace(loopSite)) return false;                     // a scoped caller may not read an unsited loop
        return allowed.Any(s => string.Equals(s, loopSite, StringComparison.OrdinalIgnoreCase));
    }

    public static object Forbidden(string? loopSite) => new { error = "SITE_OUT_OF_SCOPE", site = loopSite };
}
