using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;
using Confluent.Kafka;
using Traverse.AnalysisService.Consumers;
using Traverse.AnalysisService.Data;
using Traverse.AnalysisService.Models;

using Traverse.Auth;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("TraverseAnalysis") 
    ?? "Host=postgres;Database=traverse_analysis;Username=postgres;Password=postgres";

builder.Services.AddDbContext<AnalysisDbContext>(options => 
    options.UseNpgsql(connectionString));

var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false{(string.IsNullOrEmpty(builder.Configuration["Redis:Password"]) ? "" : $",password={builder.Configuration["Redis:Password"]}")}"));

// Kafka producer for analysis commands
var kafkaBrokers = builder.Configuration["Kafka:Brokers"] ?? "kafka:9092";
builder.Services.AddSingleton<IProducer<string, string>>(sp =>
{
    var config = new ProducerConfig { BootstrapServers = kafkaBrokers };
    return new ProducerBuilder<string, string>(config).Build();
});

// Flink REST API client
// RES-01: retry + circuit breaker + timeout on every outbound HttpClient in this service.
builder.Services.ConfigureHttpClientDefaults(http => http.AddStandardResilienceHandler());

builder.Services.AddHttpClient("Flink", client =>
{
    var flinkUrl = builder.Configuration["Flink:JobManagerUrl"] ?? "http://flink-jobmanager:8081";
    client.BaseAddress = new Uri(flinkUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

// asset-model client (Phase 7 — register derived measurements from calculation results). Authenticates
// as a service principal with the shared internal key, like binding-resolver → asset-model.
builder.Services.AddHttpClient("AssetModel", client =>
{
    var baseUrl = builder.Configuration["Services:AssetModel"] ?? "http://asset-model:5000";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
    var serviceKey = builder.Configuration["Auth:ServiceKey"];
    if (!string.IsNullOrEmpty(serviceKey))
        client.DefaultRequestHeaders.Add(TraverseAuthExtensions.ServiceKeyHeader, serviceKey);
});

// Phase 7 — consume calculation results (analysis.results) and publish derived measurements to the UNS.
builder.Services.AddHostedService<AnalysisResultConsumer>();

// ── Auth (platform RBAC) ────────────────────────────────────────────────────
// RS256 bearer validation against auth-service JWKS + a policy per permission key.
// Internal callers (e.g. binding-resolver → asset-model) authenticate with X-Service-Key.
builder.AddTraverseAuth();

var app = builder.Build();

// Phase 7 — self-healing schema for calculation versioning (fresh installs get it from a DB script).
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AnalysisDbContext>();
        await db.Database.ExecuteSqlRawAsync(@"
            ALTER TABLE analysis.analysis_definitions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
            CREATE TABLE IF NOT EXISTS analysis.calculation_versions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                analysis_id UUID NOT NULL REFERENCES analysis.analysis_definitions(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                configuration JSONB NOT NULL,
                change_note TEXT,
                status TEXT NOT NULL DEFAULT 'draft',
                created_by TEXT NOT NULL DEFAULT 'system',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                published_at TIMESTAMPTZ,
                UNIQUE (analysis_id, version));");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Could not ensure calculation_versions schema at startup");
    }
}

app.UseTraverseAuth();

// ── GET /health ─────────────────────────────────────────────────────────────
app.MapGet("/health", async (AnalysisDbContext db) =>
{
    try
    {
        await db.Database.ExecuteSqlRawAsync("SELECT 1");
        return Results.Json(new { status = "Healthy" });
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "Unhealthy", error = ex.Message }, statusCode: 503);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Analysis Definition CRUD
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /analyses ────────────────────────────────────────────────────────────
app.MapGet("/analyses", async (
    AnalysisDbContext db,
    AnalysisType? type,
    string? targetPath,
    bool? enabled,
    int skip = 0,
    int take = 50) =>
{
    var query = db.Analyses.Where(a => !a.IsDeleted);
    
    if (type.HasValue)
        query = query.Where(a => a.Type == type.Value);
    
    if (!string.IsNullOrWhiteSpace(targetPath))
        query = query.Where(a => a.TargetPath.StartsWith(targetPath));
    
    if (enabled.HasValue)
        query = query.Where(a => a.IsEnabled == enabled.Value);
    
    var total = await query.CountAsync();
    var analyses = await query
        .OrderBy(a => a.Name)
        .Skip(skip)
        .Take(Math.Min(take, 100))
        .Select(a => new AnalysisListDto(
            a.Id, a.Name, a.Type, a.Description, a.TargetPath,
            a.OutputPath, a.Schedule, a.IsEnabled, a.CreatedAt))
        .ToListAsync();
    
    return Results.Ok(new { total, analyses });
}).RequireAuthorization("analysis.view");

// ── GET /analyses/{id} ───────────────────────────────────────────────────────
app.MapGet("/analyses/{id:guid}", async (Guid id, AnalysisDbContext db) =>
{
    var analysis = await db.Analyses
        .Include(a => a.Executions.OrderByDescending(e => e.StartedAt).Take(10))
        .FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    
    if (analysis is null) return Results.NotFound();
    
    return Results.Ok(new AnalysisDetailDto(
        analysis.Id, analysis.Name, analysis.Type, analysis.Description,
        analysis.TargetPath, analysis.Configuration, analysis.OutputPath,
        analysis.Schedule, analysis.IsEnabled, analysis.OwnerId,
        analysis.CreatedAt, analysis.UpdatedAt,
        analysis.Executions.Select(e => new ExecutionDto(
            e.Id, e.Status, e.WindowStart, e.WindowEnd,
            e.InputRecords, e.OutputRecords, e.StartedAt, e.CompletedAt)).ToList()));
}).RequireAuthorization("analysis.view");

// ── POST /analyses ───────────────────────────────────────────────────────────
app.MapPost("/analyses", async (CreateAnalysisRequest request, AnalysisDbContext db, IProducer<string, string> kafka) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest("name is required");
    if (string.IsNullOrWhiteSpace(request.TargetPath))
        return Results.BadRequest("targetPath is required");
    
    var analysis = new AnalysisDefinition
    {
        Id = Guid.NewGuid(),
        Name = request.Name,
        Type = request.Type,
        Description = request.Description,
        TargetPath = request.TargetPath,
        Configuration = request.Configuration ?? JsonDocument.Parse("{}"),
        OutputPath = request.OutputPath ?? $"root.analysis.{request.TargetPath.Replace('/', '.')}",
        Schedule = request.Schedule ?? "continuous",
        IsEnabled = request.IsEnabled ?? false,
        OwnerId = request.OwnerId ?? "system",
        CreatedAt = DateTimeOffset.UtcNow,
        UpdatedAt = DateTimeOffset.UtcNow
    };
    
    db.Analyses.Add(analysis);
    await db.SaveChangesAsync();
    
    // Publish to Kafka for Flink to pick up if enabled
    if (analysis.IsEnabled)
    {
        await PublishAnalysisCommand(kafka, "analysis.created", analysis);
    }
    
    return Results.Created($"/analyses/{analysis.Id}", new { id = analysis.Id, name = analysis.Name });
}).RequireAuthorization("analysis.edit");

// ── PUT /analyses/{id} ───────────────────────────────────────────────────────
app.MapPut("/analyses/{id:guid}", async (Guid id, UpdateAnalysisRequest request, AnalysisDbContext db, IProducer<string, string> kafka) =>
{
    var analysis = await db.Analyses.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (analysis is null) return Results.NotFound();
    
    var wasEnabled = analysis.IsEnabled;
    
    if (request.Name is not null) analysis.Name = request.Name;
    if (request.Description is not null) analysis.Description = request.Description;
    if (request.Configuration is not null) analysis.Configuration = request.Configuration;
    if (request.OutputPath is not null) analysis.OutputPath = request.OutputPath;
    if (request.Schedule is not null) analysis.Schedule = request.Schedule;
    if (request.IsEnabled.HasValue) analysis.IsEnabled = request.IsEnabled.Value;
    
    analysis.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    // Notify Flink of changes
    if (wasEnabled != analysis.IsEnabled)
    {
        var command = analysis.IsEnabled ? "analysis.enabled" : "analysis.disabled";
        await PublishAnalysisCommand(kafka, command, analysis);
    }
    else if (analysis.IsEnabled)
    {
        await PublishAnalysisCommand(kafka, "analysis.updated", analysis);
    }
    
    return Results.Ok(new { id = analysis.Id, name = analysis.Name });
}).RequireAuthorization("analysis.edit");

// ── DELETE /analyses/{id} ────────────────────────────────────────────────────
app.MapDelete("/analyses/{id:guid}", async (Guid id, AnalysisDbContext db, IProducer<string, string> kafka) =>
{
    var analysis = await db.Analyses.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (analysis is null) return Results.NotFound();
    
    if (analysis.IsEnabled)
    {
        await PublishAnalysisCommand(kafka, "analysis.disabled", analysis);
    }
    
    analysis.IsDeleted = true;
    analysis.IsEnabled = false;
    analysis.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    
    return Results.NoContent();
}).RequireAuthorization("analysis.edit");

// ══════════════════════════════════════════════════════════════════════════════
// Analysis Execution Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /analyses/{id}/execute ──────────────────────────────────────────────
// Trigger an ad-hoc execution of an analysis.
app.MapPost("/analyses/{id:guid}/execute", async (
    Guid id,
    ExecuteRequest request,
    AnalysisDbContext db,
    IProducer<string, string> kafka,
    IConnectionMultiplexer redis) =>
{
    var analysis = await db.Analyses.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (analysis is null) return Results.NotFound();

    var execution = new AnalysisExecution
    {
        Id = Guid.NewGuid(),
        AnalysisId = analysis.Id,
        Status = "pending",
        WindowStart = request.WindowStart ?? DateTimeOffset.UtcNow.AddHours(-1),
        WindowEnd = request.WindowEnd ?? DateTimeOffset.UtcNow,
        StartedAt = DateTimeOffset.UtcNow
    };

    db.Executions.Add(execution);
    await db.SaveChangesAsync();

    // Phase 7 — for a calculation, extract the expression + inputs from the config and read each input's
    // current value from the Redis snapshot, so the Flink job can evaluate immediately. Compute stays in
    // Flink; this service only sources the inputs and ships the command.
    var (expression, inputs, unit) = CalcPayload.Parse(analysis.Configuration);
    var inputValues = await CalcPayload.ReadInputsAsync(redis, inputs);

    // Publish execution command to Kafka
    await kafka.ProduceAsync("analysis.executions", new Message<string, string>
    {
        Key = execution.Id.ToString(),
        Value = JsonSerializer.Serialize(new
        {
            executionId = execution.Id,
            analysisId = analysis.Id,
            analysisType = analysis.Type.ToString(),
            targetPath = analysis.TargetPath,
            outputPath = analysis.OutputPath,
            configuration = analysis.Configuration,
            expression,
            inputs = inputValues,
            unit,
            windowStart = execution.WindowStart,
            windowEnd = execution.WindowEnd
        })
    });

    return Results.Accepted($"/analyses/{id}/executions/{execution.Id}", new
    {
        executionId = execution.Id,
        status = execution.Status
    });
}).RequireAuthorization("analysis.edit");

// ── GET /analyses/{id}/executions ────────────────────────────────────────────
app.MapGet("/analyses/{id:guid}/executions", async (Guid id, AnalysisDbContext db, int skip = 0, int take = 20) =>
{
    var executions = await db.Executions
        .Where(e => e.AnalysisId == id)
        .OrderByDescending(e => e.StartedAt)
        .Skip(skip)
        .Take(Math.Min(take, 100))
        .Select(e => new ExecutionDto(
            e.Id, e.Status, e.WindowStart, e.WindowEnd,
            e.InputRecords, e.OutputRecords, e.StartedAt, e.CompletedAt))
        .ToListAsync();
    
    return Results.Ok(new { executions });
}).RequireAuthorization("analysis.view");

// ── GET /analyses/executions/{executionId} ───────────────────────────────────
app.MapGet("/analyses/executions/{executionId:guid}", async (Guid executionId, AnalysisDbContext db) =>
{
    var execution = await db.Executions
        .Include(e => e.Analysis)
        .FirstOrDefaultAsync(e => e.Id == executionId);
    
    if (execution is null) return Results.NotFound();
    
    return Results.Ok(new
    {
        id = execution.Id,
        analysisId = execution.AnalysisId,
        analysisName = execution.Analysis.Name,
        status = execution.Status,
        windowStart = execution.WindowStart,
        windowEnd = execution.WindowEnd,
        inputRecords = execution.InputRecords,
        outputRecords = execution.OutputRecords,
        errorMessage = execution.ErrorMessage,
        startedAt = execution.StartedAt,
        completedAt = execution.CompletedAt
    });
}).RequireAuthorization("analysis.view");

// ── PUT /analyses/executions/{executionId}/status ────────────────────────────
// Called by Flink job to update execution status.
app.MapPut("/analyses/executions/{executionId:guid}/status", async (
    Guid executionId,
    UpdateExecutionStatusRequest request,
    AnalysisDbContext db) =>
{
    var execution = await db.Executions.FirstOrDefaultAsync(e => e.Id == executionId);
    if (execution is null) return Results.NotFound();
    
    execution.Status = request.Status;
    execution.FlinkJobId = request.FlinkJobId ?? execution.FlinkJobId;
    execution.InputRecords = request.InputRecords ?? execution.InputRecords;
    execution.OutputRecords = request.OutputRecords ?? execution.OutputRecords;
    execution.ErrorMessage = request.ErrorMessage;
    
    if (request.Status is "completed" or "failed")
    {
        execution.CompletedAt = DateTimeOffset.UtcNow;
    }
    
    await db.SaveChangesAsync();
    
    return Results.Ok(new { id = execution.Id, status = execution.Status });
}).RequireAuthorization("analysis.edit");

// ══════════════════════════════════════════════════════════════════════════════
// Phase 7 — Calculation versioning (named, versioned artifacts; L1–L4/L10)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /analyses/{id}/versions — snapshot the current config as a new draft version. ─
app.MapPost("/analyses/{id:guid}/versions", async (Guid id, VersionRequest request, System.Security.Claims.ClaimsPrincipal user, AnalysisDbContext db) =>
{
    var analysis = await db.Analyses.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (analysis is null) return Results.NotFound();

    var nextVersion = 1 + (await db.CalculationVersions.Where(v => v.AnalysisId == id)
        .Select(v => (int?)v.Version).MaxAsync() ?? 0);

    var version = new CalculationVersion
    {
        Id = Guid.NewGuid(),
        AnalysisId = id,
        Version = nextVersion,
        Configuration = JsonDocument.Parse(analysis.Configuration.RootElement.GetRawText()),
        ChangeNote = request.ChangeNote,
        Status = "draft",
        CreatedBy = Username(user),
        CreatedAt = DateTimeOffset.UtcNow,
    };
    db.CalculationVersions.Add(version);
    await db.SaveChangesAsync();
    return Results.Created($"/analyses/{id}/versions/{nextVersion}", new { analysisId = id, version = nextVersion, status = version.Status });
}).RequireAuthorization("analysis.edit");

// ── POST /analyses/{id}/versions/{v}/publish — make a version the live artifact. ─
app.MapPost("/analyses/{id:guid}/versions/{v:int}/publish", async (Guid id, int v, AnalysisDbContext db) =>
{
    var analysis = await db.Analyses.FirstOrDefaultAsync(a => a.Id == id && !a.IsDeleted);
    if (analysis is null) return Results.NotFound();
    var version = await db.CalculationVersions.FirstOrDefaultAsync(x => x.AnalysisId == id && x.Version == v);
    if (version is null) return Results.NotFound($"Version {v} not found");

    // Archive the previously-published version, promote this one, adopt its config as current.
    var prev = await db.CalculationVersions.Where(x => x.AnalysisId == id && x.Status == "published").ToListAsync();
    foreach (var p in prev) p.Status = "archived";
    version.Status = "published";
    version.PublishedAt = DateTimeOffset.UtcNow;
    analysis.Version = v;
    analysis.Configuration = JsonDocument.Parse(version.Configuration.RootElement.GetRawText());
    analysis.UpdatedAt = DateTimeOffset.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new { analysisId = id, publishedVersion = v });
}).RequireAuthorization("analysis.edit");

// ── GET /analyses/{id}/versions — version history. ─
app.MapGet("/analyses/{id:guid}/versions", async (Guid id, AnalysisDbContext db) =>
{
    var versions = await db.CalculationVersions.Where(v => v.AnalysisId == id)
        .OrderByDescending(v => v.Version)
        .Select(v => new { v.Version, v.Status, v.ChangeNote, v.CreatedBy, v.CreatedAt, v.PublishedAt })
        .ToListAsync();
    return Results.Ok(new { analysisId = id, versions });
}).RequireAuthorization("analysis.view");

// ══════════════════════════════════════════════════════════════════════════════
// Analysis Types / Templates
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /analyses/types ──────────────────────────────────────────────────────
app.MapGet("/analyses/types", () =>
{
    var types = new List<object>
    {
        new AnalysisTypeInfo
        {
            Type = "rollup",
            Name = "Rollup Aggregation",
            Description = "Time-window aggregations (min, max, avg, sum, count)",
            ConfigSchema = new Dictionary<string, string>
            {
                ["sourceMeasurements"] = "string[] - measurements to aggregate",
                ["aggregations"] = "string[] - min, max, avg, sum, count, first, last",
                ["windowSize"] = "string - e.g., 1h, 1d, 15m",
                ["slideInterval"] = "string? - for sliding windows"
            }
        },
        new AnalysisTypeInfo
        {
            Type = "threshold",
            Name = "Threshold Monitor",
            Description = "Limit monitoring with hi-hi, hi, lo, lo-lo thresholds",
            ConfigSchema = new Dictionary<string, string>
            {
                ["sourceMeasurement"] = "string - measurement to monitor",
                ["hiHiLimit"] = "number? - high-high limit",
                ["hiLimit"] = "number? - high limit",
                ["loLimit"] = "number? - low limit",
                ["loLoLimit"] = "number? - low-low limit",
                ["deadband"] = "number? - hysteresis deadband",
                ["minDuration"] = "string? - e.g., 30s"
            }
        },
        new AnalysisTypeInfo
        {
            Type = "rate_of_change",
            Name = "Rate of Change",
            Description = "Derivative / rate calculations",
            ConfigSchema = new Dictionary<string, string>
            {
                ["sourceMeasurement"] = "string",
                ["interval"] = "string - e.g., 1m, 1h",
                ["outputUnit"] = "string? - e.g., /hr, /min",
                ["maxRate"] = "number? - alert threshold"
            }
        },
        new AnalysisTypeInfo
        {
            // "expression" matches the AnalysisType enum value clients POST; the display name is
            // "Calculation". (Was advertised as "Custom Flink SQL" that no job executed — audit §7.3.)
            Type = "expression",
            Name = "Calculation",
            // Phase 7 — this is what the AnalysisExecutionJob actually runs: an arithmetic expression over
            // named input tags, evaluated in Flink and published to the UNS as a derived measurement.
            Description = "Arithmetic expression over named input tags, executed by Flink and published to the UNS as a derived measurement",
            ConfigSchema = new Dictionary<string, string>
            {
                ["expression"] = "string - arithmetic over input names, e.g. (a + b) / 2 * 3.6",
                ["inputs"] = "{name,path}[] - named UNS tag inputs bound into the expression",
                ["unit"] = "string? - engineering unit of the derived result"
            }
        }
    };
    return Results.Ok(types);
}).RequireAuthorization("analysis.view");

app.Run();

// ── Helper Functions ─────────────────────────────────────────────────────────
static async Task PublishAnalysisCommand(IProducer<string, string> kafka, string command, AnalysisDefinition analysis)
{
    await kafka.ProduceAsync("analysis.commands", new Message<string, string>
    {
        Key = analysis.Id.ToString(),
        Value = JsonSerializer.Serialize(new
        {
            command,
            analysisId = analysis.Id,
            analysisType = analysis.Type.ToString(),
            targetPath = analysis.TargetPath,
            outputPath = analysis.OutputPath,
            configuration = analysis.Configuration,
            schedule = analysis.Schedule,
            isEnabled = analysis.IsEnabled
        })
    });
}

static string Username(System.Security.Claims.ClaimsPrincipal user) =>
    user.FindFirst("preferred_username")?.Value
    ?? user.FindFirst("username")?.Value
    ?? user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
    ?? "system";

// ── Phase 7 — calculation input sourcing (Redis snapshot reads) ───────────────
static class CalcPayload
{
    public record Input(string Name, string Path);

    /// <summary>Extract (expression, inputs, unit) from an analysis configuration document.</summary>
    public static (string? expression, List<Input> inputs, string? unit) Parse(JsonDocument config)
    {
        var inputs = new List<Input>();
        string? expression = null, unit = null;
        try
        {
            var root = config.RootElement;
            if (root.TryGetProperty("expression", out var e) && e.ValueKind == JsonValueKind.String) expression = e.GetString();
            if (expression is null && root.TryGetProperty("sqlExpression", out var s) && s.ValueKind == JsonValueKind.String) expression = s.GetString();
            if (root.TryGetProperty("unit", out var u) && u.ValueKind == JsonValueKind.String) unit = u.GetString();
            if (root.TryGetProperty("inputs", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray())
                {
                    var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var path = item.TryGetProperty("path", out var p) ? p.GetString() : null;
                    if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(path))
                        inputs.Add(new Input(name!, path!));
                }
            }
        }
        catch { /* malformed config → no calc payload */ }
        return (expression, inputs, unit);
    }

    /// <summary>Read each input's current value from its Redis snapshot (best-effort).</summary>
    public static async Task<Dictionary<string, double>> ReadInputsAsync(IConnectionMultiplexer redis, List<Input> inputs)
    {
        var result = new Dictionary<string, double>();
        if (inputs.Count == 0) return result;
        var db = redis.GetDatabase();
        foreach (var input in inputs)
        {
            var key = SnapshotKeyFor(input.Path);
            if (key is null) continue;
            try
            {
                var raw = await db.StringGetAsync(key);
                if (raw.IsNullOrEmpty) continue;
                if (double.TryParse(raw!, out var d)) { result[input.Name] = d; continue; }
                using var doc = JsonDocument.Parse(raw.ToString());
                if (doc.RootElement.TryGetProperty("value", out var vv) && vv.TryGetDouble(out var dv)) result[input.Name] = dv;
                else if (doc.RootElement.TryGetProperty("v", out var v2) && v2.TryGetDouble(out var dv2)) result[input.Name] = dv2;
            }
            catch { /* a missing/garbled snapshot just leaves that variable unbound */ }
        }
        return result;
    }

    /// <summary>
    /// Snapshot key for a UNS path. Live snapshots are keyed by the BARE device name (the asset catalog's
    /// canonical SparkplugDevice, and what historian-bff /snapshot reads at position 4) —
    /// snapshot:metric:{site}:{site}_edge1:{device}:{metric}. NOT the {unit}_{device} form that
    /// binding-resolver's *fallback* generates (which its own comment flags as breaking live values).
    /// </summary>
    public static string? SnapshotKeyFor(string contextualPath)
    {
        var parts = contextualPath.Split('/');
        if (parts.Length < 2) return null;
        var site = parts[0];
        var edgeNode = $"{site}_edge1";
        var last = parts[^1];
        var dot = last.IndexOf('.');
        if (dot < 0) return null;
        var device = last[..dot];
        var metric = last[(dot + 1)..];
        return $"snapshot:metric:{site}:{edgeNode}:{device}:{metric}";
    }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
record AnalysisListDto(
    Guid Id, string Name, AnalysisType Type, string? Description,
    string TargetPath, string OutputPath, string Schedule, bool IsEnabled, DateTimeOffset CreatedAt);

record AnalysisDetailDto(
    Guid Id, string Name, AnalysisType Type, string? Description,
    string TargetPath, JsonDocument Configuration, string OutputPath,
    string Schedule, bool IsEnabled, string OwnerId,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt,
    List<ExecutionDto> RecentExecutions);

record ExecutionDto(
    Guid Id, string Status, DateTimeOffset WindowStart, DateTimeOffset WindowEnd,
    long? InputRecords, long? OutputRecords, DateTimeOffset StartedAt, DateTimeOffset? CompletedAt);

record CreateAnalysisRequest(
    string Name, AnalysisType Type, string? Description,
    string TargetPath, JsonDocument? Configuration, string? OutputPath,
    string? Schedule, bool? IsEnabled, string? OwnerId);

record UpdateAnalysisRequest(
    string? Name, string? Description, JsonDocument? Configuration,
    string? OutputPath, string? Schedule, bool? IsEnabled);

record ExecuteRequest(DateTimeOffset? WindowStart, DateTimeOffset? WindowEnd);

record VersionRequest(string? ChangeNote);

record UpdateExecutionStatusRequest(
    string Status, string? FlinkJobId, long? InputRecords, long? OutputRecords, string? ErrorMessage);

class AnalysisTypeInfo
{
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public Dictionary<string, string> ConfigSchema { get; set; } = new();
}
