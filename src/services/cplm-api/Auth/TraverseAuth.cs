// Traverse platform auth — the SAME file is copied into each service (see scripts/sync-auth-module.ps1).
// Services build from their own Docker context, so a shared project reference is not an option; this
// module is duplicated by design and must stay byte-identical across services.
//
// It gives a service two ways to be called:
//   1. A user, presenting an RS256 JWT minted by auth-service. Authorization is by the `permission`
//      claim (an array in the token → one claim per entry, so RequireClaim("permission", key) works).
//      auth-service publishes JWKS but NO OIDC discovery document, so JwtBearer's Authority/metadata
//      flow cannot be used — the key set is fetched directly and re-fetched when an unknown `kid` shows up.
//   2. Another service, presenting the shared secret in `X-Service-Key`. Internal calls (e.g.
//      binding-resolver → asset-model) have no user context; without this they would break the moment
//      the callee starts requiring a token. A service principal is granted every permission.
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Traverse.Auth;

public sealed class JwksKeyCache
{
    private readonly string _jwksUrl;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<JwksKeyCache> _log;
    private readonly SemaphoreSlim _gate = new(1, 1);

    private IReadOnlyCollection<SecurityKey> _keys = Array.Empty<SecurityKey>();
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;
    private static readonly TimeSpan MinRefreshInterval = TimeSpan.FromSeconds(30);

    public JwksKeyCache(IConfiguration config, IHttpClientFactory http, ILogger<JwksKeyCache> log)
    {
        _jwksUrl = config["Auth:JwksUrl"] ?? "http://auth-service:3002/api/auth/.well-known/jwks.json";
        _http = http;
        _log = log;
    }

    public IEnumerable<SecurityKey> Resolve(string token, SecurityToken securityToken, string kid,
                                            TokenValidationParameters parameters)
    {
        var keys = _keys;
        if (keys.Count == 0 || (kid is not null && !keys.Any(k => k.KeyId == kid)))
        {
            RefreshAsync().GetAwaiter().GetResult();
            keys = _keys;
        }
        return kid is null ? keys : keys.Where(k => k.KeyId == kid);
    }

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (DateTimeOffset.UtcNow - _fetchedAt < MinRefreshInterval && _keys.Count > 0) return;

            var json = await _http.CreateClient().GetStringAsync(_jwksUrl, ct);
            _keys = new JsonWebKeySet(json).GetSigningKeys().ToList();
            _fetchedAt = DateTimeOffset.UtcNow;
            _log.LogInformation("JWKS loaded from {Url}: {Count} signing key(s)", _jwksUrl, _keys.Count);
        }
        catch (Exception ex)
        {
            // Never 500 on a transient auth-service outage: with no keys, validation fails and callers
            // get 401 until JWKS is reachable again.
            _log.LogError(ex, "Failed to fetch JWKS from {Url}", _jwksUrl);
        }
        finally
        {
            _gate.Release();
        }
    }
}

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

public static class TraverseAuthExtensions
{
    public const string ServiceKeyHeader = "X-Service-Key";

    /// <summary>Bearer validation + a policy per permission key. Call before builder.Build().</summary>
    public static IServiceCollection AddTraverseAuth(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        var services = builder.Services;

        services.AddHttpClient();
        services.AddSingleton<JwksKeyCache>();

        var issuer = config["Auth:Issuer"] ?? "traverse-auth";
        var audience = config["Auth:Audience"] ?? "ams-services";

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.RequireHttpsMetadata = false; // HTTP inside the compose network
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = audience,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidAlgorithms = new[] { "RS256" },
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = ctx =>
                    {
                        var jwks = ctx.HttpContext.RequestServices.GetRequiredService<JwksKeyCache>();
                        ctx.Options.TokenValidationParameters.IssuerSigningKeyResolver = jwks.Resolve;

                        // Browser-initiated downloads and WebSockets can't set a header.
                        if (string.IsNullOrEmpty(ctx.Token))
                        {
                            var qs = ctx.Request.Query["access_token"].ToString();
                            if (!string.IsNullOrEmpty(qs)) ctx.Token = qs;
                        }
                        return Task.CompletedTask;
                    },
                };
            });

        services.AddAuthorization(options =>
        {
            foreach (var perm in Perms.All)
                options.AddPolicy(perm, p => p.RequireClaim("permission", perm));
        });

        return services;
    }

    /// <summary>Service-key principal + authentication + authorization. Call before mapping endpoints.</summary>
    public static WebApplication UseTraverseAuth(this WebApplication app)
    {
        var serviceKey = app.Configuration["Auth:ServiceKey"];

        // The built-in default key grants a service principal to anyone who can present it, and the
        // value is visible in source. Fail closed in EVERY non-Development environment (Staging /
        // Production / custom); only a local dev box may run with it, and even there it warns loudly.
        const string InsecureDefaultServiceKey = "traverse-internal-dev-key";
        if (string.Equals(serviceKey, InsecureDefaultServiceKey, StringComparison.Ordinal))
        {
            if (!app.Environment.IsDevelopment())
                throw new InvalidOperationException(
                    "Auth:ServiceKey is the insecure built-in default. Configure a strong, unique key " +
                    "(env Auth__ServiceKey / TRAVERSE_SERVICE_KEY) before running outside Development.");
            app.Logger.LogWarning(
                "Auth:ServiceKey is the insecure built-in default and grants a service principal to any caller " +
                "presenting it. Set a unique Auth__ServiceKey before deploying beyond a local lab.");
        }

        // Scope the service principal to only the permissions this service must honour from internal
        // callers instead of granting every permission. Auth:ServicePermissions is a comma/space/
        // semicolon-separated list of permission keys; when the setting is absent the principal falls
        // back to all permissions (logged) so an un-migrated service keeps working. An explicitly-empty
        // value yields a principal that can do nothing — correct for a service nobody calls internally.
        var servicePerms = ParseServicePermissions(app.Configuration["Auth:ServicePermissions"], app.Logger);

        // Internal service-to-service calls carry no user token. A matching X-Service-Key is promoted to
        // a scoped service principal BEFORE authentication runs, so the normal policies apply unchanged.
        // If no key is configured the header is ignored entirely (it can't be used to bypass).
        app.Use(async (ctx, next) =>
        {
            if (!string.IsNullOrEmpty(serviceKey) &&
                ctx.Request.Headers.TryGetValue(ServiceKeyHeader, out var presented) &&
                CryptoEquals(presented.ToString(), serviceKey))
            {
                if (string.Equals(serviceKey, InsecureDefaultServiceKey, StringComparison.Ordinal))
                    app.Logger.LogWarning(
                        "Internal call authenticated with the INSECURE DEFAULT service key from {RemoteIp}",
                        ctx.Connection.RemoteIpAddress);

                var claims = new List<Claim>
                {
                    new(ClaimTypes.NameIdentifier, "service"),
                    new("preferred_username", "traverse-service"),
                    new("role", "Service"),
                };
                claims.AddRange(servicePerms.Select(p => new Claim("permission", p)));
                ctx.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "ServiceKey"));
            }
            await next();
        });

        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }

    private static bool CryptoEquals(string a, string b)
    {
        if (a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }

    /// <summary>
    /// Parse Auth:ServicePermissions into the permission set granted to the internal service principal.
    /// Null (setting absent) → every permission, with a warning; explicitly empty → no permissions.
    /// Unknown keys are dropped with a warning so a typo cannot silently widen scope.
    /// </summary>
    private static string[] ParseServicePermissions(string? configured, ILogger logger)
    {
        if (configured is null)
        {
            logger.LogWarning(
                "Auth:ServicePermissions is not set — the internal service principal is granted ALL permissions. " +
                "Scope it to the keys this service must honour from internal callers " +
                "(e.g. Auth__ServicePermissions=asset.view,asset.edit).");
            return Perms.All;
        }

        var keys = configured
            .Split(new[] { ',', ' ', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var unknown = keys.Where(k => !Perms.All.Contains(k)).ToArray();
        if (unknown.Length > 0)
            logger.LogWarning("Auth:ServicePermissions has unknown permission key(s), ignored: {Keys}",
                string.Join(", ", unknown));

        return keys.Where(k => Perms.All.Contains(k)).ToArray();
    }
}
