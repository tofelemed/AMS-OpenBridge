using AMS.AuditService.Archival;
using AMS.AuditService.Consumers;
using AMS.AuditService.Hashing;
using AMS.AuditService.Persistence;
using AMS.AuditService.Verification;
using Microsoft.EntityFrameworkCore;
using Prometheus;
using Serilog;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

var connectionString = builder.Configuration.GetConnectionString("AuditDb");

// Add DB Context
builder.Services.AddDbContext<AuditDbContext>(options =>
    options.UseNpgsql(connectionString));

// Add Core Services
builder.Services.AddSingleton<AuditHashChainService>();
builder.Services.AddScoped<ImmutableAuditRepository>();
builder.Services.AddScoped<ChainIntegrityVerifier>();

// Add Background Workers
builder.Services.AddHostedService<AuditEventConsumer>();
builder.Services.AddHostedService<WormArchiveWriter>();

// Add basic healthcheck and metrics API
builder.Services.AddHealthChecks();

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
builder.AddTraverseAuth();

var app = builder.Build();

// Run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
    db.Database.EnsureCreated(); // Use EnsureCreated for scaffolding, normally you'd use Migrate()
}

app.UseRouting();
app.UseTraverseAuth();
app.UseHttpMetrics();

app.MapMetrics();
app.MapHealthChecks("/health");

// HTTP endpoint to manually trigger a full chain cryptographic verification
app.MapPost("/api/v1/audit/verify", async (ChainIntegrityVerifier verifier, CancellationToken ct) => 
{
    var isValid = await verifier.VerifyFullChainAsync(ct);
    return isValid ? Results.Ok("Chain verified. No tampering detected.") : Results.Problem("CHAIN TAMPERING DETECTED.");
}).RequireAuthorization("admin.audit.view");

app.Run();
