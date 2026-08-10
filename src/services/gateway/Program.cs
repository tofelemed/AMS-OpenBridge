// Traverse API Gateway (Plan 04, GW-01/GW-02).
//
// Single front door for the estate: owns /api, /hubs, /mqtt-ws and (flag-gated) /swagger.
// The route map in appsettings.json mirrors src/frontend-ob/nginx.conf 1:1 — nginx shrinks
// to static-SPA-only at cutover (Plan 04 item 7).
//
// Decided auth model: EDGE-ONLY (MIGRATION_LOG decision #16). This gateway is the single
// JWT validator; after cutover the per-service validators are deleted. During the
// transition the services keep validating the bearer token we forward unchanged, so
// enabling the gateway is non-breaking at every step.

using System.Security.Cryptography.X509Certificates;

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

// ---- Reverse proxy (route map + clusters from configuration) ----
builder.Services.AddReverseProxy()
    .LoadFromConfig(config.GetSection("ReverseProxy"));

var app = builder.Build();

// When TLS is on, upgrade any plain-HTTP hit (parity with "HTTP redirects to HTTPS").
if (!string.IsNullOrWhiteSpace(certPath))
{
    app.UseHttpsRedirection();
}

// ---- Gateway's own liveness (distinct from /health, which proxies to ams-api for parity) ----
app.MapGet("/gw/health", () => Results.Ok(new { status = "Healthy", service = "gateway" }));

// ---- Spoof guard: the gateway is the ONLY writer of X-Auth-* identity headers ----
// Strip any client-supplied X-Auth-* before anything else runs. Phase B injects the real
// ones after JWT validation; a client must never be able to smuggle identity past the edge.
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

app.MapReverseProxy();

app.Logger.LogInformation(
    "Traverse gateway starting — TLS {Tls}, swagger {Swagger}",
    string.IsNullOrWhiteSpace(certPath) ? "OFF (HTTP only)" : "ON (8443)",
    exposeSwagger ? "EXPOSED" : "blocked");

app.Run();
