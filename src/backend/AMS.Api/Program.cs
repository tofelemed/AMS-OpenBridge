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
using Asp.Versioning;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Npgsql;
using Prometheus;
using Serilog;
using Serilog.Events;
using StackExchange.Redis;
using System.Reflection;
using System.Threading.RateLimiting;

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
services.AddHostedService<AMS.Api.BackgroundServices.DriftAlertConsumerService>();
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

// ---- API Versioning ----
services.AddApiVersioning(opt =>
{
    opt.DefaultApiVersion                = new ApiVersion(1, 0);
    opt.AssumeDefaultVersionWhenUnspecified = true;
    opt.ReportApiVersions                = true;
    opt.ApiVersionReader                 = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-Api-Version"));
}).AddApiExplorer(opt =>
{
    opt.GroupNameFormat           = "'v'VVV";
    opt.SubstituteApiVersionInUrl = true;
});

// ---- Swagger / OpenAPI ----
services.AddEndpointsApiExplorer();
services.AddSwaggerGen(opt =>
{
    opt.SwaggerDoc("v1", new OpenApiInfo
    {
        Title          = "AMS – Alarm Management System API",
        Version        = "v1",
        Description    = "OPC A&E 1.10 compliant enterprise alarm management REST API. " +
                         "Supports ISA-18.2 and EEMUA-191 alarm lifecycle operations.",
        Contact        = new OpenApiContact { Name = "AMS Operations", Email = "ams-ops@company.com" },
        License        = new OpenApiLicense { Name = "Enterprise License" }
    });

    opt.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type         = SecuritySchemeType.Http,
        Scheme       = "bearer",
        BearerFormat = "JWT",
        Description  = "JWT Bearer token from Keycloak / IdentityServer"
    });

    opt.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
        }] = Array.Empty<string>()
    });

    opt.EnableAnnotations();
    var apiXml = Path.Combine(AppContext.BaseDirectory, "AMS.Api.xml");
    if (File.Exists(apiXml))
        opt.IncludeXmlComments(apiXml, includeControllerXmlComments: true);
    opt.UseInlineDefinitionsForEnums();
});

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

services.AddAuthentication(AMS.Api.Auth.GatewayHeaderAuthHandler.SchemeName)
    .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions,
               AMS.Api.Auth.GatewayHeaderAuthHandler>(
        AMS.Api.Auth.GatewayHeaderAuthHandler.SchemeName, _ => { });

// ---- Authorization Policies (RBAC) ----
services.AddAuthorizationBuilder()
    .AddPolicy("alarm.view",             p => p.RequireClaim("permission", "alarm.view"))
    .AddPolicy("alarm.acknowledge",      p => p.RequireClaim("permission", "alarm.acknowledge"))
    .AddPolicy("alarm.acknowledge_batch",p => p.RequireClaim("permission", "alarm.acknowledge_batch"))
    .AddPolicy("alarm.shelve",           p => p.RequireClaim("permission", "alarm.shelve"))
    .AddPolicy("alarm.unshelve",         p => p.RequireClaim("permission", "alarm.unshelve"))
    .AddPolicy("alarm.suppress",         p => p.RequireClaim("permission", "alarm.suppress"))
    .AddPolicy("alarm.export",           p => p.RequireClaim("permission", "alarm.export"))
    .AddPolicy("soe.view",               p => p.RequireClaim("permission", "soe.view"))
    .AddPolicy("analytics.view",         p => p.RequireClaim("permission", "analytics.view"))
    .AddPolicy("admin.users.edit",       p => p.RequireClaim("permission", "admin.users.edit"))
    .AddPolicy("admin.audit.view",       p => p.RequireClaim("permission", "admin.audit.view"))
    // cpm.manage moved to cplm-api with the CPLM controllers (extraction Phase 6).
    // Referenced by ObservabilityController and OpcConnectionsController since the
    // security hardening, but never registered — ASP.NET throws on an unknown policy,
    // so every endpoint carrying it returned HTTP 500 even for admins holding the claim.
    .AddPolicy("system.manage",          p => p.RequireClaim("permission", "system.manage"));

// ---- Rate Limiting ----
services.AddRateLimiter(opt =>
{
    opt.AddFixedWindowLimiter("alarms-read", o =>
    {
        o.PermitLimit        = 1000;
        o.Window             = TimeSpan.FromMinutes(1);
        o.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        o.QueueLimit         = 50;
    });

    opt.AddFixedWindowLimiter("alarms-write", o =>
    {
        o.PermitLimit = 300;
        o.Window      = TimeSpan.FromMinutes(1);
    });

    opt.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.StatusCode = 429;
        ctx.HttpContext.Response.Headers.RetryAfter = "60";
        await ctx.HttpContext.Response.WriteAsJsonAsync(
            new { message = "Rate limit exceeded. Retry after 60 seconds.", code = 429 }, ct);
    };
});

// ---- Response Compression ----
services.AddResponseCompression(opt =>
{
    opt.Providers.Add<BrotliCompressionProvider>();
    opt.Providers.Add<GzipCompressionProvider>();
    opt.EnableForHttps = true;
    opt.MimeTypes      = ResponseCompressionDefaults.MimeTypes
        .Concat(new[] { "application/json", "application/x-ndjson", "text/event-stream" });
});

// ---- Health Checks ----
services.AddHealthChecks()
    .AddNpgSql(connStr, name: "postgresql", tags: new[] { "database", "critical" })
    .AddKafka(new Confluent.Kafka.ProducerConfig
    {
        BootstrapServers = config["Kafka:BootstrapServers"] ?? "localhost:9092"
    }, topic: "server-status", name: "kafka", tags: new[] { "messaging", "critical" })
    .AddCheck<FlinkOnlyIngestHealthCheck>("flink-ingest", tags: new[] { "critical", "ingest" });

// ---- CORS ----
services.AddCors(opt => opt.AddPolicy("AmsPolicy", p =>
{
    var origins = config.GetSection("AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:3000" };
    p.WithOrigins(origins)
     .AllowAnyMethod()
     .AllowAnyHeader()
     .AllowCredentials()
     .WithExposedHeaders("X-Total-Count", "X-Api-Version");
}));

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
app.MapHealthChecks("/health/ready", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = hc => hc.Tags.Contains("critical")
});

Log.Information("AMS API starting on {Urls}", string.Join(", ", app.Urls));
app.Run();


// ============================================================
// MediatR Pipeline Behaviors
// ============================================================

public sealed class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
        => _validators = validators;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        if (!_validators.Any()) return await next();

        var ctx     = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(_validators.Select(v => v.ValidateAsync(ctx, ct)));
        var errors  = results.SelectMany(r => r.Errors).Where(f => f is not null).ToList();

        if (errors.Count > 0)
            throw new FluentValidation.ValidationException(errors);

        return await next();
    }
}

public sealed class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
        => _logger = logger;

    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken ct)
    {
        var name = typeof(TRequest).Name;
        _logger.LogDebug("Handling {RequestName}", name);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var response = await next();
            sw.Stop();
            _logger.LogDebug("Handled {RequestName} in {ElapsedMs}ms", name, sw.ElapsedMilliseconds);
            return response;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Request {RequestName} failed after {ElapsedMs}ms", name, sw.ElapsedMilliseconds);
            throw;
        }
    }
}

public sealed class GlobalExceptionFilter : Microsoft.AspNetCore.Mvc.Filters.IExceptionFilter
{
    private readonly ILogger<GlobalExceptionFilter> _logger;

    public GlobalExceptionFilter(ILogger<GlobalExceptionFilter> logger) => _logger = logger;

    public void OnException(Microsoft.AspNetCore.Mvc.Filters.ExceptionContext ctx)
    {
        var ex      = ctx.Exception;
        var problem = ex switch
        {
            FluentValidation.ValidationException ve => new Microsoft.AspNetCore.Mvc.ValidationProblemDetails(
                ve.Errors.GroupBy(e => e.PropertyName)
                  .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray()))
                {
                    Status = 400, Title = "Validation Failed", Type = "https://tools.ietf.org/html/rfc7231#section-6.5.1"
                },
            UnauthorizedAccessException => new Microsoft.AspNetCore.Mvc.ProblemDetails
                { Status = 403, Title = "Forbidden", Detail = "You do not have permission to perform this action" },
            KeyNotFoundException => new Microsoft.AspNetCore.Mvc.ProblemDetails
                { Status = 404, Title = "Not Found", Detail = ex.Message },
            _ => new Microsoft.AspNetCore.Mvc.ProblemDetails
                {
                    Status  = 500,
                    Title   = "Internal Server Error",
                    Detail  = "An unexpected error occurred. Please contact support.",
                    Extensions = { ["traceId"] = ctx.HttpContext.TraceIdentifier }
                }
        };

        _logger.LogError(ex, "Unhandled exception [{TraceId}]: {Message}",
            ctx.HttpContext.TraceIdentifier, ex.Message);

        ctx.Result  = new Microsoft.AspNetCore.Mvc.ObjectResult(problem) { StatusCode = problem.Status };
        ctx.ExceptionHandled = true;
    }
}

// Placeholder classes for compilation (full implementations in respective files)
public class ShelveExpiryService : BackgroundService
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<ShelveExpiryService> _logger;
    public ShelveExpiryService(IServiceProvider sp, ILogger<ShelveExpiryService> logger)
    { _sp = sp; _logger = logger; }
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AmsDbContext>();
                // Call alarms.expire_shelved_alarms() stored procedure
                await db.Database.ExecuteSqlRawAsync("SELECT alarms.expire_shelved_alarms()", ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to execute shelve expiry. Schema or function might be missing.");
            }
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(1), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}

public class SoeEventRepository : ISoeEventRepository
{
    private readonly NpgsqlDataSource _ds;
    public SoeEventRepository(NpgsqlDataSource ds) => _ds = ds;
    public Task<SoeEventQueryResult> QueryAsync(SoeEventQuery q, CancellationToken ct = default) =>
        Task.FromResult(new SoeEventQueryResult(new List<object>(), 0, 1, 500, false));
    public IAsyncEnumerable<object> StreamReplayAsync(DateTimeOffset f, DateTimeOffset t, Guid[] s,
        CancellationToken ct = default) => EmptyReplay(ct);

    private static async IAsyncEnumerable<object> EmptyReplay(
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
        await Task.CompletedTask;
        yield break;
    }
}

public class OpcServerRepository : IOpcServerRepository
{
    private readonly AmsDbContext _ctx;
    public OpcServerRepository(AmsDbContext ctx) => _ctx = ctx;
    public Task<IReadOnlyList<OpcServerConfig>> GetAllEnabledAsync(CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<OpcServerConfig>>(new List<OpcServerConfig>());
    public Task<OpcServerConfig?> GetByIdAsync(Guid id, CancellationToken ct = default) => Task.FromResult<OpcServerConfig?>(null);
    public Task<OpcServerConfig> AddAsync(OpcServerConfig s, CancellationToken ct = default) => Task.FromResult(s);
    public Task UpdateAsync(OpcServerConfig s, CancellationToken ct = default) => Task.CompletedTask;
    public Task UpdateConnectionStateAsync(Guid id, bool c, string? e, CancellationToken ct = default) => Task.CompletedTask;
    public Task UpdateHeartbeatAsync(Guid id, CancellationToken ct = default) => Task.CompletedTask;
}

public class UnitOfWork : IUnitOfWork
{
    private readonly AmsDbContext _ctx;
    private Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? _tx;
    public IActiveAlarmRepository ActiveAlarms { get; }
    public IHistoricalAlarmRepository HistoricalAlarms { get; }
    public ISoeEventRepository SoeEvents { get; }
    public IOpcServerRepository OpcServers { get; }
    public UnitOfWork(AmsDbContext ctx, IActiveAlarmRepository aa, IHistoricalAlarmRepository ha,
        ISoeEventRepository soe, IOpcServerRepository opc)
    { _ctx = ctx; ActiveAlarms = aa; HistoricalAlarms = ha; SoeEvents = soe; OpcServers = opc; }
    public Task<int> SaveChangesAsync(CancellationToken ct = default) => _ctx.SaveChangesAsync(ct);
    public async Task BeginTransactionAsync(CancellationToken ct = default) =>
        _tx = await _ctx.Database.BeginTransactionAsync(ct);
    public async Task CommitTransactionAsync(CancellationToken ct = default) =>
        await _tx!.CommitAsync(ct);
    public async Task RollbackTransactionAsync(CancellationToken ct = default) =>
        await _tx!.RollbackAsync(ct);
}

// Security headers middleware
public static class ApplicationBuilderExtensions
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app)
        => app.Use(async (ctx, next) =>
        {
            ctx.Response.Headers["X-Content-Type-Options"]  = "nosniff";
            ctx.Response.Headers["X-Frame-Options"]          = "DENY";
            ctx.Response.Headers["X-XSS-Protection"]         = "1; mode=block";
            ctx.Response.Headers["Referrer-Policy"]          = "strict-origin-when-cross-origin";
            ctx.Response.Headers["Permissions-Policy"]       = "geolocation=(), camera=(), microphone=()";
            if (!ctx.Request.IsHttps)
                ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            await next();
        });
}

// Expose Program for WebApplicationFactory integration tests
public partial class Program { }
