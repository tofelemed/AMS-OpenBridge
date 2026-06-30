using Microsoft.EntityFrameworkCore;
using StackExchange.Redis;
using System.Text.Json;
using Confluent.Kafka;
using Traverse.AnalysisService.Data;
using Traverse.AnalysisService.Models;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("TraverseAnalysis") 
    ?? "Host=postgres;Database=traverse_analysis;Username=postgres;Password=postgres";

builder.Services.AddDbContext<AnalysisDbContext>(options => 
    options.UseNpgsql(connectionString));

var redisHost = builder.Configuration["Redis:Host"] ?? "redis";
var redisPort = builder.Configuration.GetValue<int>("Redis:Port", 6379);
builder.Services.AddSingleton<IConnectionMultiplexer>(
    ConnectionMultiplexer.Connect($"{redisHost}:{redisPort},abortConnect=false"));

// Kafka producer for analysis commands
var kafkaBrokers = builder.Configuration["Kafka:Brokers"] ?? "kafka:9092";
builder.Services.AddSingleton<IProducer<string, string>>(sp =>
{
    var config = new ProducerConfig { BootstrapServers = kafkaBrokers };
    return new ProducerBuilder<string, string>(config).Build();
});

// Flink REST API client
builder.Services.AddHttpClient("Flink", client =>
{
    var flinkUrl = builder.Configuration["Flink:JobManagerUrl"] ?? "http://flink-jobmanager:8081";
    client.BaseAddress = new Uri(flinkUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

var app = builder.Build();

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
});

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
});

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
});

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
});

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
});

// ══════════════════════════════════════════════════════════════════════════════
// Analysis Execution Endpoints
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /analyses/{id}/execute ──────────────────────────────────────────────
// Trigger an ad-hoc execution of an analysis.
app.MapPost("/analyses/{id:guid}/execute", async (
    Guid id,
    ExecuteRequest request,
    AnalysisDbContext db,
    IProducer<string, string> kafka) =>
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
            windowStart = execution.WindowStart,
            windowEnd = execution.WindowEnd
        })
    });
    
    return Results.Accepted($"/analyses/{id}/executions/{execution.Id}", new
    {
        executionId = execution.Id,
        status = execution.Status
    });
});

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
});

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
});

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
});

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
            Type = "expression",
            Name = "Custom Expression",
            Description = "Custom Flink SQL expression",
            ConfigSchema = new Dictionary<string, string>
            {
                ["sqlExpression"] = "string - Flink SQL SELECT",
                ["sourceTable"] = "string - default: metrics",
                ["windowSize"] = "string? - time window"
            }
        }
    };
    return Results.Ok(types);
});

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

record UpdateExecutionStatusRequest(
    string Status, string? FlinkJobId, long? InputRecords, long? OutputRecords, string? ErrorMessage);

class AnalysisTypeInfo
{
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public Dictionary<string, string> ConfigSchema { get; set; } = new();
}
