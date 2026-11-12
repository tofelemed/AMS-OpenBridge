// cplm-api's own authorization policies: the ones that are not "this one permission key". The shared TraverseAuth.cs
// registers one policy per key (named after the key) and must stay byte-identical across services
// (scripts/sync-auth-module.ps1), so a policy that accepts ANY of several keys is registered here, in cplm-api only.
using Traverse.Auth;

namespace Traverse.CplmApi.Auth;

public static class CplmPolicies
{
    /// <summary>
    /// CHG-179: display.view OR analytics.view - either key is enough. For GET /loops/signal-paths, which every HMI
    /// display user must be able to read (operator and display roles usually lack analytics.view).
    /// </summary>
    public const string DisplayOrAnalyticsView = "display.view|analytics.view";

    /// <summary>Adds cplm-api's policies. Call after builder.AddTraverseAuth() (Program.cs).</summary>
    public static IServiceCollection Register(IServiceCollection services) =>
        services.AddAuthorization(options =>
            // RequireClaim with several values: ONE "permission" claim whose value is any of them (compared exactly,
            // as the per-key policies compare). No identity -> 401 (challenge); an identity without either -> 403.
            options.AddPolicy(DisplayOrAnalyticsView, p => p
                .RequireAuthenticatedUser()
                .RequireClaim("permission", Perms.DisplayView, Perms.AnalyticsView)));
}
