namespace Traverse.AssetModel.Models;

/// <summary>
/// Represents an asset in the Unified Namespace hierarchy.
/// The contextual path is the canonical source of truth; all other paths are derived.
/// Pattern: site/area/unit/device.measurement (area optional, measurement optional for devices)
/// </summary>
public class Asset
{
    public Guid Id { get; set; }
    
    /// <summary>
    /// The canonical contextual path following ISA-95 hierarchy.
    /// Format: site/area/unit/device[.measurement]
    /// Example: houston/refinery/crude1/pump101.discharge_press
    /// </summary>
    public required string ContextualPath { get; set; }
    
    /// <summary>
    /// Human-readable display name for UI.
    /// </summary>
    public required string Name { get; set; }
    
    /// <summary>
    /// Asset type: Site, Area, Unit, Device, or Measurement.
    /// </summary>
    public required AssetType Type { get; set; }
    
    /// <summary>
    /// Optional description for documentation.
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// Engineering unit for measurements (e.g., PSI, degC, m3/hr).
    /// </summary>
    public string? EngineeringUnit { get; set; }
    
    /// <summary>
    /// Low engineering limit for HMI scaling.
    /// </summary>
    public double? LoEngLimit { get; set; }
    
    /// <summary>
    /// High engineering limit for HMI scaling.
    /// </summary>
    public double? HiEngLimit { get; set; }
    
    /// <summary>
    /// Reference to parent asset ID (null for root sites).
    /// </summary>
    public Guid? ParentId { get; set; }
    
    /// <summary>
    /// Soft-delete flag.
    /// </summary>
    public bool IsDeleted { get; set; }
    
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    
    // ───────────────────────────────────────────────────────────────────────────
    // Derived paths — computed from ContextualPath
    // ───────────────────────────────────────────────────────────────────────────
    
    /// <summary>
    /// IoTDB time-series path. Derived: root.{contextual_path with / → .}
    /// Example: root.houston.refinery.crude1.pump101.discharge_press
    /// </summary>
    public string IoTDbPath => $"root.{ContextualPath.Replace('/', '.').Replace(' ', '_')}";
    
    /// <summary>
    /// Sparkplug B group identifier. Derived from site level.
    /// Example: houston
    /// </summary>
    public string SparkplugGroup => ContextualPath.Split('/')[0];
    
    /// <summary>
    /// Sparkplug B edge node. Derived from site + edge convention.
    /// For compatibility with existing AMS: {site}_edge1
    /// </summary>
    public string SparkplugEdgeNode => $"{SparkplugGroup}_edge1";
    
    /// <summary>
    /// Sparkplug B device ID. Derived from unit/device portion.
    /// Example: crude1_pump101
    /// </summary>
    public string SparkplugDevice
    {
        get
        {
            var parts = ContextualPath.Split('/');
            return parts.Length >= 4 
                ? $"{parts[^2]}_{parts[^1].Split('.')[0]}" 
                : parts[^1].Split('.')[0];
        }
    }
    
    /// <summary>
    /// Sparkplug metric name. The measurement portion after the device.
    /// Example: discharge_press
    /// </summary>
    public string? SparkplugMetric
    {
        get
        {
            var lastPart = ContextualPath.Split('/')[^1];
            var dotIndex = lastPart.IndexOf('.');
            return dotIndex >= 0 ? lastPart[(dotIndex + 1)..] : null;
        }
    }
    
    /// <summary>
    /// Full Sparkplug B topic for DDATA messages.
    /// Example: spBv1.0/houston/DDATA/houston_edge1/crude1_pump101
    /// </summary>
    public string SparkplugTopic => $"spBv1.0/{SparkplugGroup}/DDATA/{SparkplugEdgeNode}/{SparkplugDevice}";
    
    /// <summary>
    /// Alarm source identifier for alarm pipeline.
    /// Format: {site}:{unit}:{device}
    /// Example: houston:crude1:pump101
    /// </summary>
    public string AlarmSource
    {
        get
        {
            var parts = ContextualPath.Split('/');
            var site = parts[0];
            var unit = parts.Length >= 3 ? parts[^2] : "default";
            var device = parts[^1].Split('.')[0];
            return $"{site}:{unit}:{device}";
        }
    }
    
    /// <summary>
    /// Redis snapshot key for real-time values.
    /// Example: snapshot:metric:houston:houston_edge1:crude1_pump101:discharge_press
    /// </summary>
    public string? RedisSnapshotKey
    {
        get
        {
            var metric = SparkplugMetric;
            return metric != null 
                ? $"snapshot:metric:{SparkplugGroup}:{SparkplugEdgeNode}:{SparkplugDevice}:{metric}"
                : null;
        }
    }
}

public enum AssetType
{
    Site = 1,
    Area = 2,
    Unit = 3,
    Device = 4,
    Measurement = 5
}
