// Traverse platform auth — the SAME file is copied into each service (see scripts/sync-auth-module.ps1).
// Services build from their own Docker context, so a shared project reference is not an option; this
// module is duplicated by design and must stay byte-identical across services.
//
// EDGE-ONLY MODEL (MIGRATION_LOG decision #16, Plan 04 final lockdown): the API gateway is the single
// JWT validator in the platform. It validates the RS256 token against auth-service JWKS, enforces
// revocation, strips any client-supplied X-Auth-* headers, and forwards the caller's identity as:
//
//     X-Auth-Subject / X-Auth-Username / X-Auth-Role / X-Auth-Permissions (comma-separated)
//
// This module does NO cryptography. It authenticates a request from exactly two sources:
//   1. The gateway's X-Auth-* identity headers → a user principal carrying the permission claims.
//      The existing per-endpoint policies (RequireAuthorization("asset.view") etc.) work unchanged.
//   2. Another service, presenting the internal secret in X-Service-Key (e.g. binding-resolver →
//      asset-model). Promoted to a service principal scoped by Auth:ServicePermissions (Plan 03) —
//      to be replaced by mTLS/SPIFFE workload identity on-prem.
//
// TRUST PREREQUISITES (Plan 04 §2 — why header trust is safe): direct service ports are NOT
// published; the only route in from outside the compose network is the gateway, which owns the
// X-Auth-* namespace. On-prem production adds gateway↔service mTLS so the trust is cryptographically
// bound to the peer, not just network-bound.
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Traverse.Auth;

/// <summary>Every permission key in the platform (mirrors the auth-service seed).</summary>
public static class Perms
{
    public const string AlarmView = "alarm.view";
    public const string DisplayView = "display.view";
    public const string DisplayEdit = "display.edit";
    public const string DisplayPublish = "display.publish";
    public const string AssetView = "asset.view";
    public const string AssetEdit = "asset.edit";
    public const string TemplateView = "template.view";
    public const string TemplateEdit = "template.edit";
    public const string TemplatePublish = "template.publish";
    public const string BindingResolve = "binding.resolve";
    public const string HistorianView = "historian.view";
    public const string AnalysisView = "analysis.view";
    public const string AnalysisEdit = "analysis.edit";
    public const string AuditView = "admin.audit.view";
    // CPLM (extraction Phase 2): loop-performance reads, onboarding/ack/recompute
    // writes, and pipeline/OPC operations. Keys are seeded by 33_cpm_permissions.sql.
    public const string AnalyticsView = "analytics.view";
    public const string CpmManage = "cpm.manage";
    public const string SystemManage = "system.manage";

    public static readonly string[] All =
    {
        AlarmView, DisplayView, DisplayEdit, DisplayPublish, AssetView, AssetEdit,
        TemplateView, TemplateEdit, TemplatePublish, BindingResolve, HistorianView,
        AnalysisView, AnalysisEdit, AuditView,
        AnalyticsView, CpmManage, SystemManage,
    };
}

public sealed class TraverseHeaderAuthOptions : AuthenticationSchemeOptions
{
    public string? ServiceKey { get; set; }
    public string[] ServicePermissions { get; set; } = Perms.All;
}

/// <summary>
/// Authenticates from the gateway's X-Auth-* identity headers, or from X-Service-Key for
/// internal service-to-service calls. No token validation happens here — the gateway is
/// the single JWT validator (edge-only model).
/// </summary>
public sealed class TraverseHeaderAuthHandler : AuthenticationHandler<TraverseHeaderAuthOptions>
{
    public const string SchemeName = "TraverseHeaders";

    public TraverseHeaderAuthHandler(IOptionsMonitor<TraverseHeaderAuthOptions> options,
        ILoggerFactory logger, UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        // 1. Internal service call: a matching X-Service-Key becomes a service principal
        //    scoped to Auth:ServicePermissions (empty scope = a principal that can do nothing).
        var configuredKey = Options.ServiceKey;
        if (!string.IsNullOrEmpty(configuredKey) &&
            Request.Headers.TryGetValue(TraverseAuthExtensions.ServiceKeyHeader, out var presented) &&
            CryptoEquals(presented.ToString(), configuredKey))
        {
            var svcClaims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, "service"),
                new("sub", "service"),
                new("preferred_username", "traverse-service"),
                new("role", "Service"),
            };
            svcClaims.AddRange(Options.ServicePermissions.Select(p => new Claim("permission", p)));
            return Task.FromResult(AuthenticateResult.Success(Ticket(svcClaims)));
        }

        // 2. Gateway-forwarded user identity.
        var subject = Request.Headers["X-Auth-Subject"].ToString();
        if (string.IsNullOrEmpty(subject))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, subject),
            new("sub", subject),
        };
        var username = Request.Headers["X-Auth-Username"].ToString();
        if (!string.IsNullOrEmpty(username))
        {
            claims.Add(new Claim("preferred_username", username));
            claims.Add(new Claim(ClaimTypes.Name, username));
        }
        var role = Request.Headers["X-Auth-Role"].ToString();
        if (!string.IsNullOrEmpty(role))
        {
            claims.Add(new Claim("role", role));
            claims.Add(new Claim(ClaimTypes.Role, role));
        }
        claims.AddRange(Request.Headers["X-Auth-Permissions"].ToString()
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(p => new Claim("permission", p)));

        return Task.FromResult(AuthenticateResult.Success(Ticket(claims)));
    }

    private AuthenticationTicket Ticket(IEnumerable<Claim> claims) =>
        new(new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName);

    private static bool CryptoEquals(string a, string b)
    {
        if (a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }
}

public static class TraverseAuthExtensions
{
    public const string ServiceKeyHeader = "X-Service-Key";
    private const string InsecureDefaultServiceKey = "traverse-internal-dev-key";

    /// <summary>Header-trust authentication + a policy per permission key. Call before builder.Build().</summary>
    public static IServiceCollection AddTraverseAuth(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        var services = builder.Services;

        services.AddAuthentication(TraverseHeaderAuthHandler.SchemeName)
            .AddScheme<TraverseHeaderAuthOptions, TraverseHeaderAuthHandler>(
                TraverseHeaderAuthHandler.SchemeName, options =>
                {
                    options.ServiceKey = config["Auth:ServiceKey"];
                    options.ServicePermissions =
                        ParseServicePermissions(config["Auth:ServicePermissions"]);
                });

        services.AddAuthorization(options =>
        {
            foreach (var perm in Perms.All)
                options.AddPolicy(perm, p => p.RequireClaim("permission", perm));
        });

        return services;
    }

    /// <summary>Authentication + authorization, with the fail-closed default-key guard. Call before mapping endpoints.</summary>
    public static WebApplication UseTraverseAuth(this WebApplication app)
    {
        // The built-in default key is visible in source. Fail closed in EVERY non-Development
        // environment; only a local dev box may run with it (AUTH-01).
        var serviceKey = app.Configuration["Auth:ServiceKey"];
        if (string.Equals(serviceKey, InsecureDefaultServiceKey, StringComparison.Ordinal))
        {
            if (!app.Environment.IsDevelopment())
                throw new InvalidOperationException(
                    "Auth:ServiceKey is the insecure built-in default. Configure a strong, unique key " +
                    "(env Auth__ServiceKey / TRAVERSE_SERVICE_KEY) before running outside Development.");
            app.Logger.LogWarning(
                "Auth:ServiceKey is the insecure built-in default. Set a unique Auth__ServiceKey " +
                "before deploying beyond a local lab.");
        }

        if (app.Configuration["Auth:ServicePermissions"] is null)
            app.Logger.LogWarning(
                "Auth:ServicePermissions is not set — the internal service principal is granted ALL " +
                "permissions. Scope it to the keys this service must honour from internal callers.");

        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }

    private static string[] ParseServicePermissions(string? configured)
    {
        if (configured is null) return Perms.All; // un-migrated service keeps working (warned above)
        return configured
            .Split(new[] { ',', ' ', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(k => Perms.All.Contains(k))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
    }
}
