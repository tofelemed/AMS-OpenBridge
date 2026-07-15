using System.Text.Json;

namespace Traverse.AnalysisService.Models;

/// <summary>
/// Represents an analysis definition that executes on Flink.
/// Analyses are design-time artifacts; execution is delegated to Flink.
/// </summary>
public class AnalysisDefinition
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// Analysis name (e.g., "Pump 101 Efficiency", "Daily Production Rollup").
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Analysis type: rollup, threshold, rate_of_change, expression.
    /// </summary>
    public required AnalysisType Type { get; set; }
    
    /// <summary>
    /// Optional description.
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// Target asset path (UNS contextual path).
    /// </summary>
    public required string TargetPath { get; set; }
    
    /// <summary>
    /// Analysis configuration (type-specific parameters).
    /// </summary>
    public required JsonDocument Configuration { get; set; }
    
    /// <summary>
    /// Output path where results are written (IoTDB path).
    /// </summary>
    public required string OutputPath { get; set; }
    
    /// <summary>
    /// Execution schedule: continuous, hourly, daily, or cron expression.
    /// </summary>
    public required string Schedule { get; set; }
    
    /// <summary>
    /// Whether the analysis is currently enabled.
    /// </summary>
    public bool IsEnabled { get; set; } = true;
    
    /// <summary>
    /// Owner user ID.
    /// </summary>
    public required string OwnerId { get; set; }

    /// <summary>
    /// Current published version (Phase 7 — calculations are named, versioned artifacts, per the
    /// Flink-only-compute decision). Bumped when a new version is published.
    /// </summary>
    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<AnalysisExecution> Executions { get; set; } = new List<AnalysisExecution>();
}

/// <summary>
/// An immutable, versioned snapshot of a calculation/analysis definition (Phase 7 — L1–L4/L10).
/// A calculation is authored, versioned, and published as an artifact; the Flink AnalysisExecutionJob
/// runs the published version. History is append-only so an execution is always traceable to a version.
/// </summary>
public class CalculationVersion
{
    public Guid Id { get; set; }
    public Guid AnalysisId { get; set; }
    public int Version { get; set; }
    /// <summary>Snapshot of the analysis configuration at this version (e.g. expression + inputs).</summary>
    public required JsonDocument Configuration { get; set; }
    public string? ChangeNote { get; set; }
    /// <summary>draft | published | archived.</summary>
    public required string Status { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
}

public enum AnalysisType
{
    /// <summary>
    /// Time-window aggregations (min, max, avg, sum, count).
    /// </summary>
    Rollup = 1,
    
    /// <summary>
    /// Limit monitoring (hi-hi, hi, lo, lo-lo thresholds).
    /// </summary>
    Threshold = 2,
    
    /// <summary>
    /// Rate of change / derivative calculations.
    /// </summary>
    RateOfChange = 3,
    
    /// <summary>
    /// Custom Flink SQL expression.
    /// </summary>
    Expression = 4
}

/// <summary>
/// Records an analysis execution instance.
/// </summary>
public class AnalysisExecution
{
    public Guid Id { get; set; }
    
    public Guid AnalysisId { get; set; }
    public AnalysisDefinition Analysis { get; set; } = null!;
    
    /// <summary>
    /// Flink job ID (if applicable).
    /// </summary>
    public string? FlinkJobId { get; set; }
    
    /// <summary>
    /// Execution status: pending, running, completed, failed.
    /// </summary>
    public required string Status { get; set; }
    
    /// <summary>
    /// Time window start for this execution.
    /// </summary>
    public DateTimeOffset WindowStart { get; set; }
    
    /// <summary>
    /// Time window end for this execution.
    /// </summary>
    public DateTimeOffset WindowEnd { get; set; }
    
    /// <summary>
    /// Number of input records processed.
    /// </summary>
    public long? InputRecords { get; set; }
    
    /// <summary>
    /// Number of output records generated.
    /// </summary>
    public long? OutputRecords { get; set; }
    
    /// <summary>
    /// Error message if failed.
    /// </summary>
    public string? ErrorMessage { get; set; }
    
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Models (stored in AnalysisDefinition.Configuration)
// ═══════════════════════════════════════════════════════════════════════════

/// <summary>
/// Configuration for rollup analyses.
/// </summary>
public class RollupConfig
{
    /// <summary>
    /// Source measurements to aggregate (relative to TargetPath).
    /// </summary>
    public required string[] SourceMeasurements { get; set; }
    
    /// <summary>
    /// Aggregation functions: min, max, avg, sum, count, first, last.
    /// </summary>
    public required string[] Aggregations { get; set; }
    
    /// <summary>
    /// Time window size (e.g., "1h", "1d", "15m").
    /// </summary>
    public required string WindowSize { get; set; }
    
    /// <summary>
    /// Slide interval for sliding windows (optional).
    /// </summary>
    public string? SlideInterval { get; set; }
}

/// <summary>
/// Configuration for threshold analyses.
/// </summary>
public class ThresholdConfig
{
    /// <summary>
    /// Source measurement to monitor.
    /// </summary>
    public required string SourceMeasurement { get; set; }
    
    /// <summary>
    /// Threshold limits.
    /// </summary>
    public double? HiHiLimit { get; set; }
    public double? HiLimit { get; set; }
    public double? LoLimit { get; set; }
    public double? LoLoLimit { get; set; }
    
    /// <summary>
    /// Deadband for hysteresis.
    /// </summary>
    public double? Deadband { get; set; }
    
    /// <summary>
    /// Minimum duration before triggering (e.g., "30s").
    /// </summary>
    public string? MinDuration { get; set; }
}

/// <summary>
/// Configuration for rate-of-change analyses.
/// </summary>
public class RateOfChangeConfig
{
    /// <summary>
    /// Source measurement to calculate rate for.
    /// </summary>
    public required string SourceMeasurement { get; set; }
    
    /// <summary>
    /// Time interval for rate calculation (e.g., "1m", "1h").
    /// </summary>
    public required string Interval { get; set; }
    
    /// <summary>
    /// Output unit (e.g., "/hr", "/min").
    /// </summary>
    public string? OutputUnit { get; set; }
    
    /// <summary>
    /// Maximum rate threshold for alerts.
    /// </summary>
    public double? MaxRate { get; set; }
}

/// <summary>
/// Configuration for custom expression analyses.
/// </summary>
public class ExpressionConfig
{
    /// <summary>
    /// Flink SQL SELECT expression.
    /// Use {{path}} placeholders for UNS paths.
    /// </summary>
    public required string SqlExpression { get; set; }
    
    /// <summary>
    /// Input source table name.
    /// </summary>
    public string SourceTable { get; set; } = "metrics";
    
    /// <summary>
    /// Time window for expression (e.g., "1h").
    /// </summary>
    public string? WindowSize { get; set; }
}

/// <summary>
/// Configuration for a calculation (Phase 7): an arithmetic expression over named input tags, evaluated
/// by the Flink AnalysisExecutionJob and published to the UNS as a derived measurement. This is the
/// Traverse-shaped alternative to a client-side expression engine (recorded decision L19).
/// </summary>
public class CalculationConfig
{
    /// <summary>Arithmetic expression using the input names, e.g. "(a + b) / 2 * 3.6".</summary>
    public required string Expression { get; set; }
    /// <summary>Named inputs: each maps a variable name to a UNS path whose live value is substituted.</summary>
    public required CalculationInput[] Inputs { get; set; }
    /// <summary>Engineering unit of the derived result (registered with the derived measurement).</summary>
    public string? Unit { get; set; }
}

public class CalculationInput
{
    public required string Name { get; set; }
    public required string Path { get; set; }
}
