// Traverse API Gateway (Plan 04, GW-01/GW-02).
//
// Single front door for the estate: owns /api, /hubs, /mqtt-ws and (flag-gated) /swagger.
// The route map in appsettings.json mirrors src/frontend-ob/nginx.conf 1:1 — nginx shrinks
// to static-SPA-only at cutover (Plan 04 item 7).
//
// Decided auth model: EDGE-ONLY (MIGRATION_LOG decision #16). This gateway is the single
// JWT validator: it validates the RS256 token against auth-service JWKS, enforces
// revocation (credentials_changed_at epoch, polled — see Auth/RevocationCache.cs), and
// forwards the caller's identity as X-Auth-* headers. During the transition the services
// keep validating the bearer token we forward unchanged, so enabling the gateway is
// non-breaking at every step; the per-service validators are deleted only after the
// services are unreachable except through the gateway (Plan 04 §2 cutover sequencing).

using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Prometheus;
using Traverse.Gateway.Auth;
using Traverse.Gateway.Limits;
using Traverse.Gateway.Proxy;
using Traverse.Gateway.RateLimit;
using Yarp.ReverseProxy.Forwarder;
using Yarp.ReverseProxy.Transforms;

var builder = WebApplication.CreateBuilder(args);

var config = builder.Configuration;

// ---- Kestrel: HTTP on 8080 always; HTTPS on 8443 when a certificate is configured ----
// (GW-02: TLS termination. The lab runs HTTP; on-prem production supplies a real cert via
// Gateway__Tls__CertPath / Gateway__Tls__CertPassword and publishes only 8443.)
var certPath = config["Gateway:Tls:CertPath"];
builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(8080);
    if (!string.IsNullOrWhiteSpace(certPath))
    {
        var cert = new X509Certificate2(certPath, config["Gateway:Tls:CertPassword"]);
        kestrel.ListenAnyIP(8443, l => l.UseHttps(cert));
    }
});

// ---- Edge authentication (GW-01): RS256 bearer validation against auth-service JWKS ----
builder.Services.AddHttpClient();
builder.Services.AddSingleton<JwksKeyCache>();
builder.Services.AddSingleton<RevocationCache>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RevocationCache>());
builder.Services.AddSingleton<RedisRateLimiter>();

// Bounded connect timeout -> dead upstreams fail fast and feed the passive-health
// circuit breaker (TransportFailureRate, configured per cluster in appsettings).
builder.Services.AddSingleton<IForwarderHttpClientFactory, GatewayForwarderHttpClientFactory>();

var authIssuer   = config["Auth:Issuer"]   ?? "traverse-auth";
var authAudience = config["Auth:Audience"] ?? "ams-services";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.RequireHttpsMetadata = false; // HTTP inside the compose network
        opt.MapInboundClaims = false;     // keep raw claim names: sub, role, permission, iat
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = authIssuer,
            ValidateAudience = true,
            ValidAudience = authAudience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidAlgorithms = new[] { "RS256" },
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var jwks = ctx.HttpContext.RequestServices.GetRequiredService<JwksKeyCache>();
                ctx.Options.TokenValidationParameters.IssuerSigningKeyResolver = jwks.Resolve;

                // SignalR WebSockets (and browser-initiated downloads) cannot set an
                // Authorization header — they carry the token as ?access_token=.
                if (string.IsNullOrEmpty(ctx.Token))
                {
                    var qs = ctx.Request.Query["access_token"].ToString();
                    if (!string.IsNullOrEmpty(qs)) ctx.Token = qs;
                }
                return Task.CompletedTask;
            },
        };
    });

// Default policy = any authenticated user. Fine-grained permission checks stay IN the
// services (they read the same permission claims, forwarded as X-Auth-Permissions after
// cutover). Routes marked "AuthorizationPolicy": "anonymous" in the route map skip this.
builder.Services.AddAuthorization(options =>
{
    options.DefaultPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

// ---- Reverse proxy (route map + clusters from configuration) ----
builder.Services.AddReverseProxy()
    .LoadFromConfig(config.GetSection("ReverseProxy"))
    .AddTransforms(transforms =>
    {
        // Edge-only identity propagation: after validation, forward who the caller is as
        // X-Auth-* headers. The gateway is the ONLY writer of these (client-supplied ones
        // are stripped below). The original Authorization header is forwarded untouched so
        // services keep validating during the transition.
        transforms.AddRequestTransform(t =>
        {
            var user = t.HttpContext.User;
            if (user.Identity?.IsAuthenticated == true)
            {
                string? claim(string type) => user.FindFirst(type)?.Value;
                var perms = user.FindAll("permission").Select(c => c.Value);

                t.ProxyRequest.Headers.Remove("X-Auth-Subject");
                t.ProxyRequest.Headers.Remove("X-Auth-Username");
                t.ProxyRequest.Headers.Remove("X-Auth-Role");
                t.ProxyRequest.Headers.Remove("X-Auth-Permissions");
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-Auth-Subject", claim("sub"));
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-Auth-Username", claim("preferred_username") ?? claim("username"));
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-Auth-Role", claim("role"));
                t.ProxyRequest.Headers.TryAddWithoutValidation("X-Auth-Permissions", string.Join(",", perms));
            }
            return ValueTask.CompletedTask;
        });
    });

var app = builder.Build();

// When TLS is on, upgrade any plain-HTTP hit (parity with "HTTP redirects to HTTPS").
if (!string.IsNullOrWhiteSpace(certPath))
{
    app.UseHttpsRedirection();
}

// ---- Gateway's own liveness (distinct from /health, which proxies to ams-api for parity) ----
app.MapGet("/gw/health", () => Results.Ok(new { status = "Healthy", service = "gateway" }));

// Prometheus scrape endpoint under the gateway's own /gw namespace (internal network).
app.MapMetrics("/gw/metrics");

// ---- Upstream health passthrough (ops) ----
// With direct service ports unpublished (final lockdown), host tooling checks a
// service's liveness here: GET /gw/upstreams/<cluster>/health. Resolves the
// cluster's destination from the live proxy state and relays its /health.
// Availability info only — no auth, same as the old per-port /health checks.
app.MapGet("/gw/upstreams/{cluster}/health",
    async (string cluster, Yarp.ReverseProxy.IProxyStateLookup proxy, IHttpClientFactory httpFactory) =>
{
    if (!proxy.TryGetCluster(cluster, out var state))
        return Results.NotFound(new { error = $"Unknown cluster '{cluster}'." });

    var destination = state.Destinations.Values.FirstOrDefault();
    if (destination is null)
        return Results.Problem($"Cluster '{cluster}' has no destinations.", statusCode: 502);

    try
    {
        var client = httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(5);
        var res = await client.GetAsync(destination.Model.Config.Address.TrimEnd('/') + "/health");
        var body = await res.Content.ReadAsStringAsync();
        return Results.Content(body, res.Content.Headers.ContentType?.ToString() ?? "application/json",
            statusCode: (int)res.StatusCode);
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "Unreachable", cluster, detail = ex.Message }, statusCode: 502);
    }
});

// Cluster inventory for the endpoint above (ops discoverability).
app.MapGet("/gw/upstreams", (Yarp.ReverseProxy.IProxyStateLookup proxy) =>
    Results.Ok(proxy.GetClusters().Select(c => c.ClusterId).OrderBy(x => x)));

// ---- Spoof guard: the gateway is the ONLY writer of X-Auth-* identity headers ----
app.Use(async (ctx, next) =>
{
    foreach (var header in ctx.Request.Headers.Keys
                 .Where(k => k.StartsWith("X-Auth-", StringComparison.OrdinalIgnoreCase))
                 .ToList())
    {
        ctx.Request.Headers.Remove(header);
    }
    await next();
});

// ---- Per-route request-body limits (Plan 04 item 5) ----
app.UseMiddleware<BodyLimitMiddleware>();

// ---- RED metrics per route + compact access log (Plan 04 item 5) ----
app.UseHttpMetrics();
if (config.GetValue("Gateway:AccessLog", true))
{
    app.Use(async (ctx, next) =>
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        await next();
        sw.Stop();
        app.Logger.LogInformation(
            "{Method} {Path} -> {Status} {Ms}ms user={User} ip={Ip} cache={Cache}",
            ctx.Request.Method, ctx.Request.Path.Value, ctx.Response.StatusCode,
            sw.ElapsedMilliseconds,
            ctx.User.Identity?.IsAuthenticated == true ? ctx.User.FindFirst("preferred_username")?.Value : "-",
            ctx.Connection.RemoteIpAddress,
            ctx.Response.Headers.TryGetValue("X-Cache", out var xc) ? xc.ToString() : "-");
    });
}

// ---- /swagger gate (GW-01: not publicly reachable unless explicitly enabled) ----
var exposeSwagger = config.GetValue("Gateway:ExposeSwagger", false);
app.Use(async (ctx, next) =>
{
    if (!exposeSwagger &&
        ctx.Request.Path.StartsWithSegments("/swagger", StringComparison.OrdinalIgnoreCase))
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    await next();
});

app.UseAuthentication();

// ---- Edge revocation (Plan 04 §2: single enforcement point) ----
// A signature-valid token whose owner was deactivated / role-changed / password-changed
// after it was issued is rejected here within seconds. Skipped on anonymous routes
// (e.g. /api/auth/refresh must reach auth-service, which enforces its own revocation).
app.Use(async (ctx, next) =>
{
    var endpoint = ctx.GetEndpoint();
    var isAnonymous = endpoint?.Metadata.GetMetadata<IAllowAnonymous>() is not null;

    if (!isAnonymous && ctx.User.Identity?.IsAuthenticated == true)
    {
        var sub = ctx.User.FindFirst("sub")?.Value;
        var iatRaw = ctx.User.FindFirst("iat")?.Value;
        if (sub is not null && long.TryParse(iatRaw, out var iat))
        {
            var revocation = ctx.RequestServices.GetRequiredService<RevocationCache>();
            if (revocation.IsRevoked(sub, iat))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await ctx.Response.WriteAsJsonAsync(new { error = "Token revoked; please sign in again." });
                return;
            }
        }
    }
    await next();
});

// ---- Per-client, per-route-class rate limiting (GW-03, Plan 04 item 3) ----
// Classes and failure semantics per the plan: login 10/min/IP (fail-closed),
// snapshot 30/min, historian 120/min, mutations 120/min (fail-closed),
// other reads 600/min (fail-open), plus a 2000/min global per-IP ceiling.
var rlEnabled = config.GetValue("RateLimiting:Enabled", true);
var rlLogin     = new RateLimitClass("login",     config.GetValue("RateLimiting:LoginPerMinutePerIp", 10),  PerIp: true,  FailClosed: true);
var rlSnapshot  = new RateLimitClass("snapshot",  config.GetValue("RateLimiting:SnapshotPerMinute",   30),  PerIp: false, FailClosed: false);
var rlHistorian = new RateLimitClass("historian", config.GetValue("RateLimiting:HistorianPerMinute",  120), PerIp: false, FailClosed: false);
var rlMutation  = new RateLimitClass("mutation",  config.GetValue("RateLimiting:MutationPerMinute",   120), PerIp: false, FailClosed: true);
var rlRead      = new RateLimitClass("read",      config.GetValue("RateLimiting:ReadPerMinute",       600), PerIp: false, FailClosed: false);
var rlGlobal    = new RateLimitClass("global",    config.GetValue("RateLimiting:GlobalPerMinutePerIp", 2000), PerIp: true, FailClosed: false);

app.Use(async (ctx, next) =>
{
    if (!rlEnabled || ctx.Request.Path.StartsWithSegments("/gw"))
    {
        await next();
        return;
    }

    var path = ctx.Request.Path;
    var method = ctx.Request.Method;
    var isRead = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);

    RateLimitClass cls;
    if (HttpMethods.IsPost(method) && path.StartsWithSegments("/api/auth/login"))
        cls = rlLogin;
    else if (isRead && path.StartsWithSegments("/api/hist/snapshot"))
        cls = rlSnapshot;
    else if (isRead && path.StartsWithSegments("/api/hist"))
        cls = rlHistorian;
    else if (!isRead)
        cls = rlMutation;
    else
        cls = rlRead;

    var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    var sub = ctx.User.Identity?.IsAuthenticated == true ? ctx.User.FindFirst("sub")?.Value : null;
    var clientId = cls.PerIp ? ip : (sub ?? ip);

    var limiter = ctx.RequestServices.GetRequiredService<RedisRateLimiter>();
    var (allowed, retryAfter) = await limiter.CheckAsync(cls, clientId);
    if (allowed)
        (allowed, retryAfter) = await limiter.CheckAsync(rlGlobal, ip);

    if (!allowed)
    {
        ctx.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        ctx.Response.Headers.RetryAfter = retryAfter.ToString();
        await ctx.Response.WriteAsJsonAsync(new
        {
            error = "Rate limit exceeded.",
            retryAfterSeconds = retryAfter,
        });
        return;
    }
    await next();
});

app.UseAuthorization();

// ---- Edge response cache (GW-01, Plan 04 item 4) ----
// After authorization (a cached body is only ever served to an authenticated,
// authorized caller and the key is scoped per user), before the proxy.
app.UseMiddleware<Traverse.Gateway.Caching.ResponseCacheMiddleware>();

app.MapReverseProxy();

app.Logger.LogInformation(
    "Traverse gateway starting — TLS {Tls}, swagger {Swagger}, edge auth ON",
    string.IsNullOrWhiteSpace(certPath) ? "OFF (HTTP only)" : "ON (8443)",
    exposeSwagger ? "EXPOSED" : "blocked");

app.Run();
