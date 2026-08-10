using AMS.NotificationService.Consumers;
using AMS.NotificationService.Orchestrator;
using AMS.NotificationService.Providers;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Prometheus;
using Serilog;

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

var app = builder.Build();

app.UseRouting();
app.UseHttpMetrics();

app.MapMetrics();
app.MapHealthChecks("/health");

app.MapGet("/", () => "AMS Notification Service is running.");

app.Run();
