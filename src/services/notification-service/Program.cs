using AMS.NotificationService.Consumers;
using AMS.NotificationService.Orchestrator;
using AMS.NotificationService.Providers;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Prometheus;
using Serilog;
using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

// ---- Logging Setup ----
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

builder.Host.UseSerilog();

// ---- Services ----
builder.Services.AddHttpClient();

// Providers
builder.Services.AddSingleton<INotificationProvider, EmailProvider>();
builder.Services.AddSingleton<INotificationProvider, TeamsWebhookProvider>();

// Orchestrator
builder.Services.AddSingleton<NotificationOrchestrator>();

// Background Workers (Kafka)
builder.Services.AddHostedService<RootCauseConsumer>();
// STR-05: lifecycle-alerts had two producers (telemetry deadman, ACK-SLA watchdog)
// and no consumer at all — a dead OPC feed raised nothing an operator could see.
builder.Services.AddHostedService<LifecycleAlertConsumer>();

// Basic Health/Metrics
builder.Services.AddHealthChecks();

// Platform auth (AUTH-07): RS256 bearer validation against auth-service JWKS, same as every peer
// service. This worker has no business HTTP surface today, but wiring the stack keeps it consistent
// and ready to guard any future endpoint. /health and /metrics stay anonymous for probes/Prometheus.
builder.AddTraverseAuth();

var app = builder.Build();

app.UseRouting();
app.UseHttpMetrics();
app.UseTraverseAuth();

app.MapMetrics();
app.MapHealthChecks("/health");

app.MapGet("/", () => "AMS Notification Service is running.").RequireAuthorization();

app.Run();
