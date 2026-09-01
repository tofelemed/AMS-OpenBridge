using AMS.Api.Behaviors;
using AMS.Api.BackgroundServices;
using AMS.Api.Extensions;
using AMS.Api.Filters;
using AMS.Api.Health;
using AMS.Api.Hubs;
using AMS.Application.Alarms.Commands;
using AMS.Infrastructure.Health;
using AMS.Infrastructure.Kafka;
using AMS.Infrastructure.Security;
using AMS.Infrastructure.Opc;
using AMS.Infrastructure.Persistence;
using AMS.Infrastructure.Repositories;
using AMS.Domain.Repositories;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Prometheus;
using Serilog;
using Serilog.Events;
using StackExchange.Redis;
using System.Reflection;

// ============================================================
// AMS API Bootstrap
// ============================================================

var builder = WebApplication.CreateBuilder(args);

// ---- Serilog structured logging ----
var loggerConfig = new LoggerConfiguration()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Service", "AMS.Api")
    .Enrich.WithProperty("Environment", builder.Environment.EnvironmentName)
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss.fff} {Level:u3}] [{SourceContext}] {Message:lj}{NewLine}{Exception}");
if (!builder.Environment.IsDevelopment())
    loggerConfig = loggerConfig.WriteTo.Seq(builder.Configuration["Seq:Url"] ?? "http://localhost:5341");
Log.Logger = loggerConfig.CreateLogger();

builder.Host.UseSerilog();

// ============================================================
// Services
// ============================================================

var services = builder.Services;
var config   = builder.Configuration;

if (builder.Environment.IsDevelopment())
{
    services.Configure<HostOptions>(o => o.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore);
}

// ---- Database ----
var connStr = config.GetConnectionString("AmsDb")
    ?? throw new InvalidOperationException("AmsDb connection string is required");

var npgsqlDataSource = new NpgsqlDataSourceBuilder(connStr)
    .EnableDynamicJson()
    .Build();

services.AddSingleton(npgsqlDataSource);

// CPLM extraction Phase 6 — the keyed "cplm" data source is gone: every class
// that used traverse_cplm now lives in src/services/cplm-api.
services.AddDbContext<AmsDbContext>(opt =>
    opt.UseNpgsql(npgsqlDataSource, o =>
    {
        o.EnableRetryOnFailure(maxRetryCount: 5, maxRetryDelay: TimeSpan.FromSeconds(30), null);
        o.CommandTimeout(60);
        o.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery);
        o.MigrationsHistoryTable("__EFMigrationsHistory", "public");
    })
    .UseSnakeCaseNamingConvention()
    .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.CoreEventId.NavigationBaseIncludeIgnored))
);

// ---- CQRS / MediatR ----
services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssembly(typeof(AcknowledgeAlarmCommand).Assembly);
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
    cfg.AddOpenBehavior(typeof(LoggingBehavior<,>));
});

// ---- Validation ----
services.AddValidatorsFromAssembly(typeof(AcknowledgeAlarmCommandValidator).Assembly);

// ---- Repositories & Unit of Work ----
// DATA-08: short-TTL alarm-list read cache, version-invalidated by the projection consumers.
services.AddMemoryCache();
services.AddSingleton<AMS.Infrastructure.Caching.AlarmReadCache>();

services.AddScoped<IActiveAlarmRepository, ActiveAlarmRepository>();
services.AddScoped<IHistoricalAlarmRepository, HistoricalAlarmRepository>();
services.AddScoped<IAlarmTransitionRepository, AlarmTransitionRepository>();
services.AddScoped<ISoeEventRepository, SoeEventRepository>();
services.AddScoped<IOpcServerRepository, OpcServerRepository>();
services.AddScoped<IOpcConnectionRepository, OpcConnectionRepository>();
services.AddScoped<OpcConnectionMetricsEnricher>();
services.AddScoped<IUnitOfWork, UnitOfWork>();
services.AddSingleton<IAlarmSignalRPublisher, AlarmSignalRPublisher>();
services.AddScoped<AMS.Application.Alarms.Queries.IAlarmEnricher, AMS.Api.Services.AlarmEnricher>();
services.AddScoped<IOpcDcsGateway, NoOpOpcDcsGateway>();

// ---- Kafka ----
services.Configure<KafkaOptions>(config.GetSection("Kafka"));
services.AddSingleton<AlarmEventProducer>();
services.AddSingleton<LifecycleEventPublisher>();
services.AddSingleton<IOperatorActionPublisher, OperatorActionPublisher>();
var useFlinkOrchestration = config.GetValue("Kafka:UseFlinkOrchestration", true);
if (config.GetValue("Kafka:LabDirectIngest", false))
    throw new InvalidOperationException(
        "Kafka:LabDirectIngest is not permitted. AMS runs in Flink-only authoritative orchestration mode.");

if (!useFlinkOrchestration)
{
    throw new InvalidOperationException(
        "Kafka:UseFlinkOrchestration must be true. Flink owns the alarm lifecycle; " +
        "in-service stream processing and .NET ACK orchestration were removed.");
}

Console.WriteLine("[AMS] Flink-only orchestration — stream processor disabled; lifecycle owned by Flink.");

// Projection consumers only (Flink → DB → SignalR). No .NET stream processing.
services.AddHostedService<NormalizedAlarmConsumerService>();
services.AddHostedService<LifecycleEventConsumerService>();
services.AddHostedService<AMS.Api.BackgroundServices.AlarmStateDeltaConsumerService>();
services.AddHostedService<AMS.Api.BackgroundServices.ReplayResultConsumerService>();
services.AddHostedService<TelemetryDeadmanWatchdogService>();
services.Configure<AMS.Api.BackgroundServices.AlarmIngestionOptions>(
    config.GetSection(AMS.Api.BackgroundServices.AlarmIngestionOptions.SectionName));

services.AddHttpClient<AMS.Api.Services.FlinkRestClient>(client =>
{
    // Read from config. This was hardcoded, so Flink:JobManagerUrl was ignored by
    // the client while PipelineHealthService honoured it — two components could
    // disagree about which cluster they were talking to.
    client.BaseAddress = new Uri(
        config["Flink:JobManagerUrl"] ?? "http://ams-flink-jobmanager:8081");
});
services.AddHostedService<AMS.Api.BackgroundServices.AlarmIngestionService>();
services.AddHostedService<AMS.Api.BackgroundServices.HttpAckWritebackService>();
services.AddHostedService<AMS.Api.BackgroundServices.KpiConsumerService>();
// CPLM extraction Phase 6 — result/frame consumers, registry, recompute and
// audit emitter all live in src/services/cplm-api now. What stays here:
// IotDbWriteClient + CplmOptions, both used by RawLoopIotDbConsumer (raw loop
// samples → IoTDB historian, its own consumer group — never part of the move).
services.Configure<AMS.Api.BackgroundServices.CplmOptions>(
    config.GetSection(AMS.Api.BackgroundServices.CplmOptions.SectionName));
services.Configure<AMS.Api.Services.IotDbWriteOptions>(
    config.GetSection(AMS.Api.Services.IotDbWriteOptions.SectionName));
services.AddHttpClient("IotDbWrite");
services.AddSingleton<AMS.Api.Services.IotDbWriteClient>();
services.AddHostedService<AMS.Api.BackgroundServices.RawLoopIotDbConsumer>();
// DriftAlertConsumerService removed (audit-jobs.md Phase G): StateDriftDetectionJob retired.
// DOM-02: ShelveExpiryService was implemented but never registered, so the
// ISA-18.2 shelving timeout never ran — a shelved alarm stayed shelved forever.
services.AddHostedService<ShelveExpiryService>();
services.AddSingleton<TelemetryIngestState>();
services.AddSingleton<ReadinessHistoryStore>();
services.AddSingleton<PipelineHealthService>();
services.AddSingleton<ISignalRHealthProvider, SignalRHealthProvider>();
services.AddSingleton<ConnectionPasswordCrypto>();
services.AddHttpClient("AlarmFeed", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

// ---- HTTP Clients ----
// Redis removed per simplified architecture


// ---- SignalR ----
var signalRBuilder = services.AddSignalR(opt =>
{
    opt.EnableDetailedErrors          = builder.Environment.IsDevelopment();
    opt.MaximumReceiveMessageSize     = 102_400;  // 100KB
    opt.StreamBufferCapacity          = 20;
    opt.HandshakeTimeout              = TimeSpan.FromSeconds(15);
    opt.KeepAliveInterval             = TimeSpan.FromSeconds(10);
    // Dev UI loads large alarm snapshots; allow longer idle before server closes WS (1011).
    opt.ClientTimeoutInterval         = builder.Environment.IsDevelopment()
        ? TimeSpan.FromSeconds(120)
        : TimeSpan.FromSeconds(30);
})
.AddJsonProtocol(opt =>
{
    opt.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
});

// Single-instance backend does not need Redis backplane.


// ---- API Controllers ----
services.AddControllers(opt =>
{
    opt.Filters.Add<GlobalExceptionFilter>();
    opt.SuppressAsyncSuffixInActionNames = true;
})
.AddJsonOptions(opt =>
{
    opt.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    opt.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    opt.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

// ---- API Versioning + Swagger (Extensions/ServiceCollectionExtensions.cs) ----
services.AddAmsApiVersioning();
services.AddAmsSwagger();

// ---- JWT Authentication (Phase K: real RS256 bearer validation against auth-service) ----
// This replaces the former TestAuthHandler, which succeeded for EVERY anonymous request with the full
// permission set — making the policies below decorative. Tokens now come from auth-service and are
// Edge-only auth (Plan 04 final lockdown): the GATEWAY is the single JWT validator —
// it validates the RS256 token (including SignalR's ?access_token=), enforces
// revocation, and forwards the identity as X-Auth-* headers. This service
// materialises those headers into a principal; the policies below are unchanged.
services.AddHttpClient();

// RES-01: every outbound HttpClient (Flink REST, IoTDB writer, alarm feed poller,
// DCS ACK writeback) gets retry + circuit breaker + timeout. The package was
// referenced but had ZERO call sites — no outbound call had any resilience.
services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

// Auth + policies, rate limiting, compression, health, CORS — one cohesive
// registration group each (Extensions/ServiceCollectionExtensions.cs).
services.AddAmsAuthPolicies();
services.AddAmsRateLimiting();
services.AddAmsResponseCompression();
services.AddAmsHealthChecks(config, connStr);
// Plan 10 C3: CORS is Development-only. In every deployed shape the browser is
// same-origin (SPA behind nginx -> gateway; no published API port), and even dev
// uses the Vite proxy — the policy exists solely as a safety net for ad-hoc
// dev setups that point a browser straight at a locally-run API.
if (builder.Environment.IsDevelopment())
    services.AddAmsCors(config);

// ============================================================
// Application Pipeline
// ============================================================

var app = builder.Build();

// ---- Database migrations on startup ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
    if (app.Environment.IsDevelopment())
    {
        Log.Information("Development mode: skipping auto-migration (lab schema managed via database/scripts)");
    }
    else
    {
        await db.Database.MigrateAsync();
        Log.Information("Database migrations applied");
    }
}

app.UseSerilogRequestLogging(opt =>
{
    opt.MessageTemplate        = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000}ms";
    opt.GetLevel               = (ctx, elapsed, ex) =>
        ex is not null || ctx.Response.StatusCode >= 500 ? LogEventLevel.Error
        : elapsed > 1000 ? LogEventLevel.Warning
        : LogEventLevel.Debug;
    opt.EnrichDiagnosticContext = (diag, ctx) =>
    {
        diag.Set("RequestId", ctx.TraceIdentifier);
        diag.Set("ClientIP",  ctx.Connection.RemoteIpAddress?.ToString());
    };
});

app.UseResponseCompression();
app.UseSecurityHeaders();  // X-Content-Type-Options, X-Frame-Options, HSTS
if (app.Environment.IsDevelopment())
    app.UseCors("AmsPolicy");
app.UseRateLimiter();

if (app.Environment.IsDevelopment() || app.Environment.IsStaging())
{
    app.UseSwagger();
    app.UseSwaggerUI(opt =>
    {
        opt.SwaggerEndpoint("/swagger/v1/swagger.json", "AMS API v1");
        opt.DisplayRequestDuration();
        opt.EnableFilter();
        opt.EnableDeepLinking();
        opt.DocExpansion(Swashbuckle.AspNetCore.SwaggerUI.DocExpansion.None);
    });
}

if (config.GetValue("Security:UseHttpsRedirection", !app.Environment.IsDevelopment()))
    app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

// ---- Prometheus metrics endpoint ----
app.UseMetricServer("/metrics");
app.UseHttpMetrics(opt =>
{
    opt.AddCustomLabel("endpoint", ctx => ctx.Request.Path.Value ?? "unknown");
});

// ---- Routes ----
// Every controller is authorized by its own [Authorize] attributes. There is deliberately no
// global bypass here: the former Security:DisableApiAuthorization switch could turn the entire
// REST surface (alarms, ACK, shelve, admin, audit, OPC) anonymous from a single env var. Removed
// so no release image can ship an authorization kill switch (AUTH-02).
app.MapControllers();
app.MapHub<AMS.Api.Hubs.AlarmHub>("/hubs/alarms", opt =>
{
    opt.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.WebSockets
                   | Microsoft.AspNetCore.Http.Connections.HttpTransportType.ServerSentEvents;
});

app.MapHub<AMS.Api.Hubs.ObservabilityHub>("/hubs/observability", opt =>
{
    opt.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.WebSockets
                   | Microsoft.AspNetCore.Http.Connections.HttpTransportType.ServerSentEvents;
});

app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    ResponseWriter = HealthChecks.UI.Client.UIResponseWriter.WriteHealthCheckUIResponse
});
// Liveness / container probe: "critical" only (postgres). Kafka/Flink outages degrade the
// pipeline, not the REST surface — they must never restart-loop the container (Plan 10 C1).
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = hc => hc.Tags.Contains("critical")
});
// Pipeline view: kafka + flink-ingest only — what ops watches when data stops flowing.
app.MapHealthChecks("/health/pipeline", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = hc => hc.Tags.Contains("pipeline"),
    ResponseWriter = HealthChecks.UI.Client.UIResponseWriter.WriteHealthCheckUIResponse
});

Log.Information("AMS API starting on {Urls}", string.Join(", ", app.Urls));
app.Run();


// ============================================================
// MediatR Pipeline Behaviors
// ============================================================


// Expose Program for WebApplicationFactory integration tests
public partial class Program { }
